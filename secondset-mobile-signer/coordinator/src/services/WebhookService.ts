// coordinator/src/services/WebhookService.ts

import crypto from 'crypto';
import axios from 'axios';
import { DatabaseService } from './DatabaseService';

interface WebhookPayload {
  type: 'keygen.completed' | 'keygen.failed' | 'signing.completed' | 'signing.failed' | 'recovery.completed' | 'recovery.failed';
  sessionId: string;
  walletAddress?: string;
  signedTransaction?: string;
  chain?: string;
  curve_type?: string;
  newThreshold?: number;
  newN?: number;
  recoveryRecord?: Record<string, any>;
  error?: string;
  timestamp: string;
}

export class WebhookService {
  private static webhookUrl = process.env.WEBAPP_WEBHOOK_URL;
  private static webhookSecret = process.env.COORDINATOR_WEBHOOK_SECRET || 'dev-webhook-secret-change-in-production';
  private static maxRetries = 3;
  private static retryDelayMs = 1000;

  /**
   * Generate HMAC-SHA256 signature for webhook authentication
   * Signature format: HMAC-SHA256(timestamp.payload)
   */
  private static generateSignature(timestamp: string, payload: string): string {
    const signedPayload = `${timestamp}.${payload}`;
    return crypto
      .createHmac('sha256', this.webhookSecret)
      .update(signedPayload)
      .digest('hex');
  }

  /**
   * Send webhook with retry logic
   */
  private static async sendWithRetry(
    url: string,
    payload: WebhookPayload,
    attempt: number = 1
  ): Promise<boolean> {
    try {
      const payloadString = JSON.stringify(payload);
      const timestamp = Date.now().toString(); // Milliseconds since epoch
      const signature = this.generateSignature(timestamp, payloadString);

      console.log(`📤 Sending webhook (attempt ${attempt}/${this.maxRetries}):`, payload.type, payload.sessionId.slice(0, 8));

      const response = await axios.post(url, payload, {
        headers: {
          'Content-Type': 'application/json',
          'X-Coordinator-Signature': signature,
          'X-Coordinator-Timestamp': timestamp,
          'x-event-type': payload.type,
        },
        timeout: 10000, // 10 second timeout
      });

      if (response.status >= 200 && response.status < 300) {
        console.log('✅ Webhook delivered successfully');
        return true;
      }

      throw new Error(`HTTP ${response.status}: ${response.statusText}`);
    } catch (error: any) {
      console.error(`❌ Webhook delivery failed (attempt ${attempt}):`, error.message);

      // Retry if we haven't exceeded max attempts
      if (attempt < this.maxRetries) {
        const delay = this.retryDelayMs * attempt; // Exponential backoff
        console.log(`🔄 Retrying in ${delay}ms...`);
        await new Promise(resolve => setTimeout(resolve, delay));
        return this.sendWithRetry(url, payload, attempt + 1);
      }

      return false;
    }
  }

  /**
   * Log webhook attempt to audit log
   */
  private static async logWebhookAttempt(
    sessionId: string,
    orgId: string,
    eventType: string,
    success: boolean,
    error?: string
  ): Promise<void> {
    try {
      await DatabaseService.logAuditEvent({
        org_id: orgId,
        event_type: success ? 'webhook_delivered' : 'webhook_failed',
        session_id: sessionId,
        details: {
          webhook_event: eventType,
          success,
          error,
          timestamp: new Date().toISOString(),
        },
      });
    } catch (auditError) {
      console.error('Failed to log webhook attempt:', auditError);
    }
  }

  /**
   * Send keygen completion webhook
   */
  static async notifyKeygenComplete(
    session_id: string,
    org_id: string,
    wallet_address: string,
    public_key: string
  ): Promise<void> {
    if (!this.webhookUrl) {
      console.warn('⚠️  WEBAPP_WEBHOOK_URL not configured, skipping webhook');
      return;
    }

    const payload: WebhookPayload = {
      type: 'keygen.completed',
      sessionId: session_id,
      walletAddress: wallet_address,
      timestamp: new Date().toISOString(),
    };

    const success = await this.sendWithRetry(this.webhookUrl, payload);
    await this.logWebhookAttempt(session_id, org_id, 'keygen.completed', success, success ? undefined : 'Max retries exceeded');
  }

  /**
   * Send keygen failure webhook
   */
  static async notifyKeygenFailed(
    session_id: string,
    org_id: string,
    reason: string,
    error_details: string
  ): Promise<void> {
    if (!this.webhookUrl) {
      console.warn('⚠️  WEBAPP_WEBHOOK_URL not configured, skipping webhook');
      return;
    }

    const payload: WebhookPayload = {
      type: 'keygen.failed',
      sessionId: session_id,
      error: `${reason}: ${error_details}`,
      timestamp: new Date().toISOString(),
    };

    const success = await this.sendWithRetry(this.webhookUrl, payload);
    await this.logWebhookAttempt(session_id, org_id, 'keygen.failed', success, success ? undefined : 'Max retries exceeded');
  }

  /**
   * Send signing completion webhook
   */
  static async notifySigningComplete(
    session_id: string,
    org_id: string,
    request_id: string,
    signature: string,
    tx_hash?: string
  ): Promise<void> {
    if (!this.webhookUrl) {
      console.warn('⚠️  WEBAPP_WEBHOOK_URL not configured, skipping webhook');
      return;
    }

    const payload: WebhookPayload = {
      type: 'signing.completed',
      sessionId: session_id,
      signedTransaction: signature,
      timestamp: new Date().toISOString(),
    };

    const success = await this.sendWithRetry(this.webhookUrl, payload);
    await this.logWebhookAttempt(session_id, org_id, 'signing.completed', success, success ? undefined : 'Max retries exceeded');
  }

  /**
   * Send signing failure webhook
   */
  static async notifySigningFailed(
    session_id: string,
    org_id: string,
    request_id: string,
    reason: string,
    error_details: string
  ): Promise<void> {
    if (!this.webhookUrl) {
      console.warn('⚠️  WEBAPP_WEBHOOK_URL not configured, skipping webhook');
      return;
    }

    const payload: WebhookPayload = {
      type: 'signing.failed',
      sessionId: session_id,
      error: `${reason}: ${error_details}`,
      timestamp: new Date().toISOString(),
    };

    const success = await this.sendWithRetry(this.webhookUrl, payload);
    await this.logWebhookAttempt(session_id, org_id, 'signing.failed', success, success ? undefined : 'Max retries exceeded');
  }

  /**
   * Send recovery completion webhook
   */
  static async notifyRecoveryComplete(
    session_id: string,
    org_id: string,
    wallet_address: string,
    chain: string,
    curve_type: string,
    new_threshold: number,
    new_n: number,
    recovery_record: Record<string, any>
  ): Promise<void> {
    if (!this.webhookUrl) {
      console.warn('WEBAPP_WEBHOOK_URL not configured, skipping webhook');
      return;
    }

    const payload: WebhookPayload = {
      type: 'recovery.completed',
      sessionId: session_id,
      walletAddress: wallet_address,
      chain,
      curve_type,
      newThreshold: new_threshold,
      newN: new_n,
      recoveryRecord: recovery_record,
      timestamp: new Date().toISOString(),
    };

    const success = await this.sendWithRetry(this.webhookUrl, payload);
    await this.logWebhookAttempt(session_id, org_id, 'recovery.completed', success, success ? undefined : 'Max retries exceeded');
  }

  /**
   * Send recovery failure webhook
   */
  static async notifyRecoveryFailed(
    session_id: string,
    org_id: string,
    reason: string,
    error_details: string
  ): Promise<void> {
    if (!this.webhookUrl) {
      console.warn('WEBAPP_WEBHOOK_URL not configured, skipping webhook');
      return;
    }

    const payload: WebhookPayload = {
      type: 'recovery.failed',
      sessionId: session_id,
      error: `${reason}: ${error_details}`,
      timestamp: new Date().toISOString(),
    };

    const success = await this.sendWithRetry(this.webhookUrl, payload);
    await this.logWebhookAttempt(session_id, org_id, 'recovery.failed', success, success ? undefined : 'Max retries exceeded');
  }
}
