# Webhook Integration Guide

## Overview

The coordinator sends webhooks to the web app when ceremonies complete or fail. This allows the web app to react to keygen and signing events in real-time.

## Setup

### 1. Configure Environment Variables

Add to your coordinator `.env` file:

```bash
WEBAPP_WEBHOOK_URL=http://localhost:4000/api/webhooks/coordinator
COORDINATOR_WEBHOOK_SECRET=your-secure-random-secret-here
```

**Generate a secure secret:**
```bash
openssl rand -hex 32
```

### 2. Web App Webhook Endpoint

The web app must implement a POST endpoint to receive webhooks from the coordinator.

**Endpoint:** `POST /api/webhooks/coordinator`

## Webhook Events

### 1. Keygen Complete

Sent when a wallet is successfully created.

```json
{
  "event_type": "keygen_complete",
  "session_id": "uuid",
  "org_id": "org-123",
  "timestamp": "2026-02-03T12:34:56.789Z",
  "data": {
    "wallet_address": "0x742d35Cc6634C0532925a3b844Bc9e7595f0bFc7",
    "public_key": "0x04...",
    "status": "complete"
  }
}
```

**Web app should:**
- Save `wallet_address` to database
- Link wallet to `org_id`
- Mark wallet setup as complete
- Notify users

### 2. Keygen Failed

Sent when wallet creation fails (e.g., address mismatch).

```json
{
  "event_type": "keygen_failed",
  "session_id": "uuid",
  "org_id": "org-123",
  "timestamp": "2026-02-03T12:34:56.789Z",
  "data": {
    "status": "failed",
    "reason": "address_mismatch",
    "error_details": "Participants reported different wallet addresses"
  }
}
```

**Web app should:**
- Mark wallet setup as failed
- Show error to user
- Allow retry

### 3. Signing Complete

Sent when a transaction is successfully signed.

```json
{
  "event_type": "signing_complete",
  "session_id": "uuid",
  "org_id": "org-123",
  "timestamp": "2026-02-03T12:34:56.789Z",
  "data": {
    "request_id": "payment-123",
    "signature": "{\"r\":\"0x...\",\"s\":\"0x...\",\"v\":27}",
    "tx_hash": "0xabc...",
    "status": "complete"
  }
}
```

**Web app should:**
- Extract signature from `data.signature`
- Broadcast transaction to blockchain
- Update payment request status
- Notify users

### 4. Signing Failed

Sent when transaction signing fails.

```json
{
  "event_type": "signing_failed",
  "session_id": "uuid",
  "org_id": "org-123",
  "timestamp": "2026-02-03T12:34:56.789Z",
  "data": {
    "request_id": "payment-123",
    "status": "failed",
    "reason": "protocol_error",
    "error_details": "Timeout waiting for signatures"
  }
}
```

**Web app should:**
- Mark signing session as failed
- Show error to user
- Allow retry

## Security: Verifying Webhooks

**CRITICAL:** Always verify the HMAC signature before processing webhooks!

### Headers

All webhooks include these headers:
- `Content-Type: application/json`
- `x-coordinator-signature: <hmac-sha256-hex>`
- `x-event-type: <event_type>`

### Verification Example (Node.js)

```typescript
import crypto from 'crypto';

function verifyWebhook(req: Request): boolean {
  const signature = req.headers['x-coordinator-signature'];
  const body = JSON.stringify(req.body);
  const secret = process.env.COORDINATOR_WEBHOOK_SECRET;

  const expectedSignature = crypto
    .createHmac('sha256', secret)
    .update(body)
    .digest('hex');

  return signature === expectedSignature;
}

// In your webhook endpoint:
app.post('/api/webhooks/coordinator', (req, res) => {
  // Verify signature
  if (!verifyWebhook(req)) {
    console.error('Invalid webhook signature!');
    return res.status(401).json({ error: 'Invalid signature' });
  }

  // Process webhook
  const { event_type, data } = req.body;

  switch (event_type) {
    case 'keygen_complete':
      handleKeygenComplete(data);
      break;
    case 'signing_complete':
      handleSigningComplete(data);
      break;
    // ... handle other events
  }

  res.status(200).json({ received: true });
});
```

## Testing Webhooks

### 1. Local Testing with ngrok

If your web app is running locally, use ngrok to expose it:

```bash
ngrok http 4000
```

Update `.env`:
```bash
WEBAPP_WEBHOOK_URL=https://abc123.ngrok.io/api/webhooks/coordinator
```

### 2. Test with curl

Simulate a webhook from the coordinator:

```bash
# Generate signature
PAYLOAD='{"event_type":"keygen_complete","session_id":"test","org_id":"org-123","timestamp":"2026-02-03T12:00:00Z","data":{"wallet_address":"0x123","public_key":"0x456","status":"complete"}}'
SIGNATURE=$(echo -n "$PAYLOAD" | openssl dgst -sha256 -hmac "your-secret-here" | cut -d' ' -f2)

# Send webhook
curl -X POST http://localhost:4000/api/webhooks/coordinator \
  -H "Content-Type: application/json" \
  -H "x-coordinator-signature: $SIGNATURE" \
  -H "x-event-type: keygen_complete" \
  -d "$PAYLOAD"
```

### 3. Monitor Webhook Logs

Check coordinator logs for webhook delivery status:

```bash
cd coordinator
npm run dev

# Look for:
# 📤 Sending webhook (attempt 1/3): keygen_complete abc12345
# ✅ Webhook delivered successfully
```

## Retry Logic

The coordinator automatically retries failed webhooks:
- **Max retries:** 3 attempts
- **Backoff:** 1s, 2s, 3s (exponential)
- **Timeout:** 10 seconds per request

All attempts are logged to the audit log.

## Troubleshooting

### Webhook not received

1. Check `WEBAPP_WEBHOOK_URL` is correct
2. Verify web app endpoint is accessible
3. Check coordinator logs for errors
4. Ensure no firewall blocking requests

### Signature verification fails

1. Ensure `COORDINATOR_WEBHOOK_SECRET` matches on both sides
2. Verify you're computing HMAC over raw JSON body (as string)
3. Use same secret format (hex, not base64)

### Webhook timeout

1. Web app should respond quickly (< 10s)
2. Process webhook asynchronously if needed
3. Return 200 OK immediately, process in background

## Database Schema

Webhook attempts are logged to `audit_events`:

```sql
SELECT * FROM audit_events
WHERE event_type IN ('webhook_delivered', 'webhook_failed')
ORDER BY timestamp DESC;
```
