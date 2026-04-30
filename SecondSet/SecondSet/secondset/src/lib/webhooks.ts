import { createHmac, timingSafeEqual as cryptoTimingSafeEqual } from 'crypto';

/**
 * Verify webhook signature using HMAC-SHA256
 * Follows existing HMAC pattern from audit.ts
 */
export function verifyWebhookSignature(params: {
  payload: string; // Raw request body
  signature: string; // From X-Coordinator-Signature header
  timestamp: string; // From X-Coordinator-Timestamp header
  secret: string; // COORDINATOR_WEBHOOK_SECRET
}): boolean {
  const { payload, signature, timestamp, secret } = params;

  // Reject old requests (> 5 minutes)
  const now = Date.now();
  const requestTime = parseInt(timestamp, 10);
  if (isNaN(requestTime) || Math.abs(now - requestTime) > 300000) {
    return false;
  }

  // Compute expected signature
  const signedPayload = `${timestamp}.${payload}`;
  const expectedSignature = createHmac('sha256', secret)
    .update(signedPayload)
    .digest('hex');

  // Timing-safe comparison
  return timingSafeEqual(
    Buffer.from(signature),
    Buffer.from(expectedSignature)
  );
}

function timingSafeEqual(a: Buffer, b: Buffer): boolean {
  if (a.length !== b.length) return false;

  // Use Node.js built-in timingSafeEqual if available
  try {
    return cryptoTimingSafeEqual(a, b);
  } catch {
    // Fallback to manual comparison
    let result = 0;
    for (let i = 0; i < a.length; i++) {
      result |= a[i] ^ b[i];
    }
    return result === 0;
  }
}
