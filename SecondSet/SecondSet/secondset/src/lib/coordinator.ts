// CoordinatorClient for DKG and threshold signature operations

export interface KeygenSessionResponse {
  session_id: string;
  join_token: string;
  qr_code_data: string;
  short_code: string;
  expiry: string;
  status: string;
}

export interface SigningSessionResponse {
  sessionId: string;
  qrCodeData?: string; // Optional for push notification scenarios
  expiresAt: string;
}

export interface KeygenWebhookPayload {
  sessionId: string;
  status: 'completed' | 'failed';
  walletAddress?: string;
  error?: string;
  timestamp: string;
}

export interface RecoverySessionResponse {
  session_id: string;
  join_token: string;
  qr_code_data: string;
  short_code: string;
  status: string;
  expires_at: string;
}

export interface SigningWebhookPayload {
  sessionId: string;
  status: 'completed' | 'failed';
  signedTransaction?: string; // Serialized signed tx
  error?: string;
  timestamp: string;
}

export class CoordinatorClient {
  private baseUrl: string;
  private apiKey: string;

  constructor() {
    this.baseUrl = process.env.COORDINATOR_API_URL!;
    this.apiKey = process.env.COORDINATOR_API_KEY!;

    if (!this.baseUrl || !this.apiKey) {
      throw new Error('COORDINATOR_API_URL and COORDINATOR_API_KEY required');
    }
  }

  /**
   * Initiate DKG keygen ceremony
   */
  async createKeygenSession(params: {
    orgId: string;
    adminUserId: string;
    initiatedByIp: string;
    chain?: 'EVM' | 'SOLANA';
    vaultId?: string;
  }): Promise<KeygenSessionResponse> {
    // Transform to coordinator's expected format (snake_case)
    const requestBody = {
      org_id: params.orgId,
      admin_user_id: params.adminUserId,
      initiated_by_ip: params.initiatedByIp,
      chain: params.chain || 'EVM',
      ...(params.vaultId && { vault_id: params.vaultId }),
      role_assignments: {
        cfo: { user_id: params.adminUserId },
        controller: { user_id: params.adminUserId },
        backup: { user_id: params.adminUserId },
      },
    };

    const response = await fetch(`${this.baseUrl}/v1/keygen/sessions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${this.apiKey}`,
      },
      body: JSON.stringify(requestBody),
    });

    if (!response.ok) {
      const error = await response.json().catch(() => ({ error: 'Unknown error' }));
      throw new Error(`Coordinator keygen failed: ${error.error || error.message || 'Unknown error'}`);
    }

    return response.json();
  }

  /**
   * Initiate threshold signing session
   */
  async createSigningSession(params: {
    orgId: string;
    walletAddress: string;
    requestId: string;
    txDigest: string;
    unsignedTx: any; // Chain-specific unsigned transaction
    chain: 'EVM' | 'SOLANA';
    threshold?: number; // 2 for 2-of-3
    webhookUrl?: string;
    displayInfo?: {
      amount: string;
      token: string;
      chain: string;
      recipientAddress: string;
      recipientName?: string;
      requestedBy?: string;
    };
  }): Promise<SigningSessionResponse> {
    // Transform to coordinator's expected format (snake_case)
    // Merge display info into tx_details so mobile can show human-readable fields
    const txDetails = {
      ...params.unsignedTx,
      ...(params.displayInfo && {
        display_amount: params.displayInfo.amount,
        display_token: params.displayInfo.token,
        display_chain: params.displayInfo.chain,
        display_recipient: params.displayInfo.recipientAddress,
        display_recipient_name: params.displayInfo.recipientName,
        display_requested_by: params.displayInfo.requestedBy,
      }),
    };

    const requestBody = {
      org_id: params.orgId,
      wallet_address: params.walletAddress,
      request_id: params.requestId,
      tx_digest: params.txDigest,
      tx_details: txDetails,
      required_signers: params.threshold ?? 2,
      webhook_url: params.webhookUrl,
      chain: params.chain,
    };

    const response = await fetch(`${this.baseUrl}/v1/signing/sessions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${this.apiKey}`,
      },
      body: JSON.stringify(requestBody),
    });

    if (!response.ok) {
      const error = await response.json().catch(() => ({ error: 'Unknown error' }));
      throw new Error(`Coordinator signing failed: ${error.error || error.message || 'Unknown error'}`);
    }

    const data = await response.json();
    // Map snake_case response to camelCase
    return {
      sessionId: data.session_id,
      qrCodeData: data.qr_code_data,
      expiresAt: data.expires_at,
    };
  }

  /**
   * Cancel an active keygen session on the coordinator
   */
  async cancelKeygenSession(coordinatorSessionId: string): Promise<void> {
    const response = await fetch(
      `${this.baseUrl}/v1/keygen/sessions/${coordinatorSessionId}/cancel`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${this.apiKey}`,
        },
      }
    );

    if (!response.ok) {
      const error = await response.json().catch(() => ({ message: 'Unknown error' }));
      throw new Error(`Coordinator cancel failed: ${error.message || error.error}`);
    }
  }

  /**
   * Get keygen session status (for polling)
   */
  async getKeygenSessionStatus(sessionId: string): Promise<{
    status: 'pending' | 'completed' | 'failed' | 'expired';
    walletAddress?: string;
    error?: string;
  }> {
    const response = await fetch(`${this.baseUrl}/v1/keygen/sessions/${sessionId}`, {
      headers: {
        'Authorization': `Bearer ${this.apiKey}`,
      },
    });

    if (!response.ok) {
      throw new Error('Failed to fetch keygen status');
    }

    return response.json();
  }

  /**
   * Get signing session status (for polling)
   */
  async getSigningSessionStatus(sessionId: string): Promise<{
    status: 'pending' | 'completed' | 'failed' | 'expired';
    signedTransaction?: string;
    error?: string;
  }> {
    const response = await fetch(`${this.baseUrl}/v1/signing/sessions/${sessionId}`, {
      headers: {
        'Authorization': `Bearer ${this.apiKey}`,
      },
    });

    if (!response.ok) {
      throw new Error('Failed to fetch signing status');
    }

    return response.json();
  }

  /**
   * Initiate a key recovery session
   */
  async createRecoverySession(params: {
    orgId: string;
    vaultId: string;
    walletAddress: string;
    chain: 'EVM' | 'SOLANA';
    adminUserId: string;
    initiatedByIp: string;
    reason?: string;
    thresholdPolicy?: { formula?: string; min_threshold?: number; override_m?: number | null };
  }): Promise<RecoverySessionResponse> {
    const requestBody = {
      org_id: params.orgId,
      vault_id: params.vaultId,
      wallet_address: params.walletAddress,
      chain: params.chain,
      admin_user_id: params.adminUserId,
      initiated_by_ip: params.initiatedByIp,
      reason: params.reason,
      threshold_policy: params.thresholdPolicy,
    };

    const response = await fetch(`${this.baseUrl}/v1/recovery/sessions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${this.apiKey}`,
      },
      body: JSON.stringify(requestBody),
    });

    if (!response.ok) {
      const error = await response.json().catch(() => ({ error: 'Unknown error' }));
      throw new Error(`Coordinator recovery session failed: ${error.error || error.message || 'Unknown error'}`);
    }

    return response.json();
  }

  /**
   * Lock a recovery session (no more participants can join)
   */
  async lockRecoverySession(sessionId: string, adminUserId: string): Promise<{
    status: string;
    computed_m: number;
    computed_old_n: number;
    computed_new_n: number;
  }> {
    const response = await fetch(`${this.baseUrl}/v1/recovery/sessions/${sessionId}/lock`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${this.apiKey}`,
      },
      body: JSON.stringify({ admin_user_id: adminUserId }),
    });

    if (!response.ok) {
      const error = await response.json().catch(() => ({ error: 'Unknown error' }));
      throw new Error(`Coordinator recovery lock failed: ${error.error || error.message || 'Unknown error'}`);
    }

    return response.json();
  }

  /**
   * Cancel an active recovery session on the coordinator
   */
  async cancelRecoverySession(coordinatorSessionId: string): Promise<void> {
    const response = await fetch(
      `${this.baseUrl}/v1/recovery/sessions/${coordinatorSessionId}/cancel`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${this.apiKey}`,
        },
      }
    );

    if (!response.ok) {
      const error = await response.json().catch(() => ({ message: 'Unknown error' }));
      throw new Error(`Coordinator recovery cancel failed: ${error.message || error.error}`);
    }
  }

  /**
   * Get recovery session status (for polling)
   */
  async getRecoverySessionStatus(sessionId: string): Promise<{
    status: string;
    wallet_address?: string;
    computed_m?: number;
    computed_old_n?: number;
    computed_new_n?: number;
    participants?: Array<{
      participant_type: string;
      role: string;
      connection_status: string;
      reported_address?: string;
    }>;
    error?: string;
    error_message?: string;
  }> {
    const response = await fetch(`${this.baseUrl}/v1/recovery/sessions/${sessionId}`, {
      headers: {
        'Authorization': `Bearer ${this.apiKey}`,
      },
    });

    if (!response.ok) {
      throw new Error('Failed to fetch recovery session status');
    }

    return response.json();
  }
}
