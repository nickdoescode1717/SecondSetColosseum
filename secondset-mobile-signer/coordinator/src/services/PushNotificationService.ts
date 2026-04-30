// coordinator/src/services/PushNotificationService.ts
//
// Best-effort push notification delivery via Expo Push API.
// All errors are caught internally — callers should fire-and-forget.

import { Pool } from 'pg';
import axios from 'axios';

const db = new Pool({ connectionString: process.env.DATABASE_URL });

const EXPO_PUSH_URL = 'https://exp.host/--/api/v2/push/send';

export const PushNotificationService = {
  async registerToken(
    deviceId: string,
    orgId: string,
    pushToken: string,
    platform?: string
  ): Promise<void> {
    await db.query(
      `INSERT INTO device_push_tokens (device_id, org_id, push_token, platform, updated_at)
       VALUES ($1, $2, $3, $4, NOW())
       ON CONFLICT (device_id, org_id) DO UPDATE
         SET push_token = EXCLUDED.push_token,
             platform = EXCLUDED.platform,
             updated_at = NOW()`,
      [deviceId, orgId, pushToken, platform || null]
    );
  },

  async sendSigningRequest(
    walletAddress: string,
    txDetails: Record<string, any>,
    sessionId: string
  ): Promise<void> {
    // Find all devices enrolled in this wallet's most recent keygen ceremony
    const participantsResult = await db.query(
      `SELECT DISTINCT ON (kp.device_id) kp.device_id, ks.org_id
       FROM keygen_participants kp
       JOIN keygen_sessions ks ON kp.session_id = ks.session_id
       WHERE ks.wallet_address = $1 AND ks.status = 'complete'
       ORDER BY kp.device_id, ks.completed_at DESC`,
      [walletAddress]
    );

    if (participantsResult.rows.length === 0) return;

    const deviceIds = participantsResult.rows.map((r: any) => r.device_id);
    const orgId = participantsResult.rows[0].org_id;

    // Look up registered push tokens for those devices
    const tokensResult = await db.query(
      `SELECT push_token FROM device_push_tokens
       WHERE device_id = ANY($1) AND org_id = $2`,
      [deviceIds, orgId]
    );

    if (tokensResult.rows.length === 0) return;

    const pushTokens: string[] = tokensResult.rows.map((r: any) => r.push_token);

    // Build human-readable notification body
    const amount = txDetails?.amount || '';
    const token = txDetails?.token || '';
    const recipientName = txDetails?.recipientName;
    const recipientAddress: string = txDetails?.recipientAddress || '';
    const recipient = recipientName || (recipientAddress ? `${recipientAddress.slice(0, 6)}…` : 'recipient');

    const body =
      amount && token
        ? `${amount} ${token} to ${recipient} needs your signature`
        : 'A transaction needs your signature';

    const messages = pushTokens.map((pushToken) => ({
      to: pushToken,
      sound: 'default',
      title: 'Signing Request',
      body,
      data: {
        type: 'signing_request',
        session_id: sessionId,
        wallet_address: walletAddress,
      },
      channelId: 'signing-requests',
    }));

    // Expo Push API accepts up to 100 messages per request
    for (let i = 0; i < messages.length; i += 100) {
      await axios.post(EXPO_PUSH_URL, messages.slice(i, i + 100), {
        headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
        timeout: 5000,
      });
    }

    console.log(`📱 Push notifications sent for signing session ${sessionId} (${pushTokens.length} device(s))`);
  },
};
