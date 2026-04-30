// coordinator/src/routes/recovery.routes.ts

import express from 'express';
import { DatabaseService } from '../services/DatabaseService';
import { v4 as uuidv4 } from 'uuid';
import { Pool } from 'pg';
import jwt from 'jsonwebtoken';
import { requireApiKey, rateLimit } from '../middleware/auth';
import {
  ChainType,
  CurveType,
  curveForChain,
  RecoverySessionStatus,
  ThresholdPolicy,
  CreateRecoverySessionRequest,
  CreateRecoverySessionResponse,
  JoinRecoverySessionRequest,
  JoinRecoverySessionResponse,
  RecoveryParticipantType,
} from '../types';

const router = express.Router();

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
});

const JWT_SECRET = process.env.JWT_SECRET || 'change-me-in-production';

// Terminal statuses that cannot be transitioned away from
const TERMINAL_STATUSES: RecoverySessionStatus[] = ['complete', 'failed', 'cancelled'];

// ============================================================================
// UTILITY FUNCTIONS
// ============================================================================

function generateShortCode(): string {
  const words = ['WOLF', 'TIGER', 'EAGLE', 'BEAR', 'LION', 'HAWK'];
  return [
    words[Math.floor(Math.random() * words.length)],
    words[Math.floor(Math.random() * words.length)],
    words[Math.floor(Math.random() * words.length)],
    Math.floor(Math.random() * 100),
  ].join('-');
}

const DEFAULT_THRESHOLD_POLICY: ThresholdPolicy = {
  formula: 'ceil_2n_3',
  min_threshold: 2,
  allow_m_one: false,
};

// ============================================================================
// POST /sessions — Create a recovery session
// ============================================================================

router.post('/sessions', requireApiKey, rateLimit(10, 60000), async (req, res) => {
  try {
    const request: CreateRecoverySessionRequest = req.body;

    // Validate required fields
    const missing: string[] = [];
    if (!request.org_id) missing.push('org_id');
    if (!request.vault_id) missing.push('vault_id');
    if (!request.wallet_address) missing.push('wallet_address');
    if (!request.chain) missing.push('chain');
    if (!request.admin_user_id) missing.push('admin_user_id');

    if (missing.length > 0) {
      return res.status(400).json({ error: `Missing required fields: ${missing.join(', ')}` });
    }

    const chain: ChainType = request.chain;
    const curve_type: CurveType = request.curve_type || curveForChain(chain);

    // Check for active (non-terminal) recovery sessions for the same wallet_address
    // Also exclude sessions that have expired by time even if not yet marked as 'expired'
    const activeCheck = await pool.query(
      `SELECT session_id, status FROM recovery_sessions
       WHERE wallet_address = $1
         AND status NOT IN ('complete', 'failed', 'cancelled', 'expired')
         AND expires_at > NOW()
       LIMIT 1`,
      [request.wallet_address]
    );

    if (activeCheck.rows.length > 0) {
      return res.status(409).json({
        error: 'Active recovery session already exists for this wallet',
        existing_session_id: activeCheck.rows[0].session_id,
        existing_status: activeCheck.rows[0].status,
      });
    }

    // Generate session data
    const session_id = uuidv4();
    const join_token = uuidv4().replace(/-/g, '');
    const short_code = generateShortCode();
    const expires_at = new Date(Date.now() + 2 * 60 * 60 * 1000); // 2 hours

    // Merge threshold policy with defaults
    const threshold_policy: ThresholdPolicy = {
      ...DEFAULT_THRESHOLD_POLICY,
      ...request.threshold_policy,
    };

    const old_threshold = request.old_threshold || 2;

    // Insert into recovery_sessions table
    await pool.query(
      `INSERT INTO recovery_sessions (
        session_id, org_id, vault_id, wallet_address, chain, curve_type,
        admin_user_id, initiated_by_ip, reason, status,
        join_token, short_code, threshold_policy, old_threshold,
        expires_at
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15)`,
      [
        session_id,
        request.org_id,
        request.vault_id,
        request.wallet_address,
        chain,
        curve_type,
        request.admin_user_id,
        request.initiated_by_ip || null,
        request.reason || null,
        'open',
        join_token,
        short_code,
        JSON.stringify(threshold_policy),
        old_threshold,
        expires_at,
      ]
    );

    // Log audit event
    await DatabaseService.logAuditEvent({
      org_id: request.org_id,
      event_type: 'recovery_initiated',
      session_id,
      user_id: request.admin_user_id,
      ip_address: request.initiated_by_ip,
      details: {
        vault_id: request.vault_id,
        wallet_address: request.wallet_address,
        chain,
        curve_type,
        reason: request.reason,
        threshold_policy,
        old_threshold,
      },
    });

    // Generate QR code data
    const qr_code_data = JSON.stringify({
      type: 'recovery',
      session_id,
      join_token,
      vault_id: request.vault_id,
      wallet_address: request.wallet_address,
      chain,
      curve_type,
    });

    const response: CreateRecoverySessionResponse = {
      session_id,
      join_token,
      qr_code_data,
      short_code,
      status: 'open',
      expires_at: expires_at.toISOString(),
    };

    console.log('✅ Created recovery session:', session_id, `(${chain}/${curve_type})`, 'for wallet:', request.wallet_address);
    res.status(201).json(response);
  } catch (error) {
    console.error('Error creating recovery session:', error);
    res.status(500).json({ error: 'Failed to create recovery session' });
  }
});

// ============================================================================
// POST /sessions/:sessionId/join — Device joins recovery
// ============================================================================

router.post('/sessions/:sessionId/join', async (req, res) => {
  try {
    const { sessionId } = req.params;
    const request: JoinRecoverySessionRequest = req.body;

    // Validate required fields
    const missing: string[] = [];
    if (!request.join_token) missing.push('join_token');
    if (!request.device_id) missing.push('device_id');
    if (!request.participant_type) missing.push('participant_type');
    if (!request.role) missing.push('role');
    if (!request.device_public_key) missing.push('device_public_key');
    if (!request.device_info) missing.push('device_info');

    if (missing.length > 0) {
      return res.status(400).json({ error: `Missing required fields: ${missing.join(', ')}` });
    }

    // Fetch session
    const sessionResult = await pool.query(
      `SELECT * FROM recovery_sessions WHERE session_id = $1`,
      [sessionId]
    );

    if (sessionResult.rows.length === 0) {
      return res.status(404).json({ error: 'Session not found' });
    }

    const session = sessionResult.rows[0];

    // Validate session is not expired
    if (new Date(session.expires_at) < new Date()) {
      return res.status(410).json({ error: 'Session expired' });
    }

    // Validate session status is open
    if (session.status !== 'open') {
      return res.status(400).json({
        error: `Session is not accepting participants (status: ${session.status})`,
      });
    }

    // Validate join_token
    if (request.join_token !== session.join_token) {
      return res.status(403).json({ error: 'Invalid join token' });
    }

    const participant_id = uuidv4();
    let old_signer_index: number | null = null;
    let new_signer_index: number | null = null;

    if (request.participant_type === 'old_signer') {
      // Old signer: must have biometric verification
      if (!request.biometric_verified) {
        return res.status(403).json({ error: 'Biometric verification required for old signers' });
      }

      // Look up this device in the original keygen ceremony for this wallet
      const keygenResult = await pool.query(
        `SELECT kp.signer_index FROM keygen_participants kp
         JOIN keygen_sessions ks ON kp.session_id = ks.session_id
         WHERE kp.device_id = $1
           AND ks.wallet_address = $2
           AND ks.status = 'complete'
         ORDER BY ks.completed_at DESC
         LIMIT 1`,
        [request.device_id, session.wallet_address]
      );

      if (keygenResult.rows.length === 0) {
        return res.status(403).json({
          error: 'Device not found in original keygen ceremony for this vault',
        });
      }

      old_signer_index = keygenResult.rows[0].signer_index;

      // Check this old_signer hasn't already joined
      const duplicateCheck = await pool.query(
        `SELECT participant_id FROM recovery_participants
         WHERE session_id = $1 AND device_id = $2 AND participant_type = 'old_signer'`,
        [sessionId, request.device_id]
      );

      if (duplicateCheck.rows.length > 0) {
        return res.status(409).json({ error: 'Device already joined as old_signer' });
      }
    } else if (request.participant_type === 'new_signer') {
      // Use a transaction with row-level lock to prevent concurrent joins
      // from getting duplicate new_signer_index values
      const client = await pool.connect();
      try {
        await client.query('BEGIN');

        // Lock the session row to serialize concurrent new_signer joins
        await client.query(
          `SELECT session_id FROM recovery_sessions WHERE session_id = $1 FOR UPDATE`,
          [sessionId]
        );

        // Check this new_signer device hasn't already joined
        const duplicateCheck = await client.query(
          `SELECT participant_id FROM recovery_participants
           WHERE session_id = $1 AND device_id = $2 AND participant_type = 'new_signer'`,
          [sessionId, request.device_id]
        );

        if (duplicateCheck.rows.length > 0) {
          await client.query('ROLLBACK');
          return res.status(409).json({ error: 'Device already joined as new_signer' });
        }

        // Count existing new_signers to assign sequential index (within lock)
        const countResult = await client.query(
          `SELECT COUNT(*)::int as count FROM recovery_participants
           WHERE session_id = $1 AND participant_type = 'new_signer'`,
          [sessionId]
        );

        const existingNewSigners = countResult.rows[0].count;

        // Max 7 new signers
        if (existingNewSigners >= 7) {
          await client.query('ROLLBACK');
          return res.status(409).json({ error: 'Maximum number of new signers (7) reached' });
        }

        new_signer_index = existingNewSigners + 1;
        await client.query('COMMIT');
      } catch (txError) {
        await client.query('ROLLBACK');
        throw txError;
      } finally {
        client.release();
      }
    } else {
      return res.status(400).json({ error: 'Invalid participant_type. Must be old_signer or new_signer' });
    }

    // Insert into recovery_participants table
    await pool.query(
      `INSERT INTO recovery_participants (
        participant_id, session_id, device_id, participant_type, role,
        old_signer_index, new_signer_index, device_public_key,
        device_os, device_os_version, app_version,
        biometric_verified
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)`,
      [
        participant_id,
        sessionId,
        request.device_id,
        request.participant_type,
        request.role,
        old_signer_index,
        new_signer_index,
        request.device_public_key,
        request.device_info.os,
        request.device_info.os_version,
        request.device_info.app_version,
        request.biometric_verified || false,
      ]
    );

    // Log audit event
    await DatabaseService.logAuditEvent({
      org_id: session.org_id,
      event_type: request.participant_type === 'old_signer'
        ? 'recovery_old_signer_joined'
        : 'recovery_new_signer_joined',
      session_id: sessionId,
      device_id: request.device_id,
      details: {
        participant_type: request.participant_type,
        role: request.role,
        old_signer_index,
        new_signer_index,
      },
    });

    // Generate JWT token (20 min expiry)
    const ws_token = jwt.sign(
      {
        sub: participant_id,
        session_id: sessionId,
        role: request.role,
        org_id: session.org_id,
        participant_type: request.participant_type,
        jti: uuidv4(),
      },
      JWT_SECRET,
      { expiresIn: '20m' }
    );

    const response: JoinRecoverySessionResponse = {
      participant_id,
      participant_type: request.participant_type,
      old_signer_index: old_signer_index ?? undefined,
      new_signer_index: new_signer_index ?? undefined,
      ws_url: `ws://${req.headers.host}/ws`,
      ws_token,
      vault_address: session.wallet_address,
      session_expiry: session.expires_at.toISOString
        ? session.expires_at.toISOString()
        : new Date(session.expires_at).toISOString(),
      chain: session.chain,
      curve_type: session.curve_type,
    };

    console.log(
      `✅ ${request.participant_type} joined recovery session ${sessionId}`,
      request.participant_type === 'old_signer'
        ? `(old_signer_index=${old_signer_index})`
        : `(new_signer_index=${new_signer_index})`
    );

    res.status(200).json(response);
  } catch (error) {
    console.error('Error joining recovery session:', error);
    res.status(500).json({ error: 'Failed to join recovery session' });
  }
});

// ============================================================================
// GET /sessions/:sessionId — Get recovery session status
// ============================================================================

router.get('/sessions/:sessionId', async (req, res) => {
  try {
    const { sessionId } = req.params;

    // Fetch session
    const sessionResult = await pool.query(
      `SELECT * FROM recovery_sessions WHERE session_id = $1`,
      [sessionId]
    );

    if (sessionResult.rows.length === 0) {
      return res.status(404).json({ error: 'Session not found' });
    }

    const session = sessionResult.rows[0];

    // Fetch participants
    const participantsResult = await pool.query(
      `SELECT participant_id, device_id, participant_type, role,
              old_signer_index, new_signer_index, biometric_verified,
              connection_status, joined_at, completed_at,
              reported_address, recovery_completed, old_share_deletion_confirmed
       FROM recovery_participants
       WHERE session_id = $1
       ORDER BY participant_type, COALESCE(old_signer_index, 0), COALESCE(new_signer_index, 0)`,
      [sessionId]
    );

    // Parse threshold_policy if stored as string
    const threshold_policy = typeof session.threshold_policy === 'string'
      ? JSON.parse(session.threshold_policy)
      : session.threshold_policy;

    res.json({
      session_id: session.session_id,
      org_id: session.org_id,
      vault_id: session.vault_id,
      wallet_address: session.wallet_address,
      chain: session.chain,
      curve_type: session.curve_type,
      status: session.status,
      threshold_policy,
      old_threshold: session.old_threshold,
      computed_old_n: session.computed_old_n,
      computed_new_n: session.computed_new_n,
      computed_m: session.computed_m,
      expires_at: session.expires_at,
      locked_at: session.locked_at,
      started_at: session.started_at,
      completed_at: session.completed_at,
      error_code: session.error_code,
      error_message: session.error_message,
      participants: participantsResult.rows,
    });
  } catch (error) {
    console.error('Error getting recovery session status:', error);
    res.status(500).json({ error: 'Failed to get recovery session status' });
  }
});

// ============================================================================
// POST /sessions/:sessionId/lock — Admin locks the ceremony
// ============================================================================

router.post('/sessions/:sessionId/lock', requireApiKey, async (req, res) => {
  try {
    const { sessionId } = req.params;

    // Fetch session
    const sessionResult = await pool.query(
      `SELECT * FROM recovery_sessions WHERE session_id = $1`,
      [sessionId]
    );

    if (sessionResult.rows.length === 0) {
      return res.status(404).json({ error: 'Session not found' });
    }

    const session = sessionResult.rows[0];

    // Validate session is not expired
    if (new Date(session.expires_at) < new Date()) {
      return res.status(410).json({ error: 'Session expired' });
    }

    // Validate session status is open
    if (session.status !== 'open') {
      return res.status(409).json({
        error: `Cannot lock session with status '${session.status}'. Must be 'open'.`,
      });
    }

    // Count connected old_signers
    const oldSignersResult = await pool.query(
      `SELECT COUNT(*)::int as count FROM recovery_participants
       WHERE session_id = $1
         AND participant_type = 'old_signer'
         AND connection_status = 'connected'`,
      [sessionId]
    );
    const connected_old_signers = oldSignersResult.rows[0].count;

    const old_threshold = session.old_threshold || 2;

    if (connected_old_signers < old_threshold) {
      return res.status(400).json({
        error: `Not enough connected old signers. Need at least ${old_threshold}, have ${connected_old_signers}.`,
      });
    }

    // Count connected new_signers
    const newSignersResult = await pool.query(
      `SELECT COUNT(*)::int as count FROM recovery_participants
       WHERE session_id = $1
         AND participant_type = 'new_signer'
         AND connection_status = 'connected'`,
      [sessionId]
    );
    const connected_new_signers = newSignersResult.rows[0].count;

    if (connected_new_signers < 1) {
      return res.status(400).json({
        error: 'At least one connected new signer is required.',
      });
    }

    // Parse threshold_policy
    const policy: ThresholdPolicy = typeof session.threshold_policy === 'string'
      ? JSON.parse(session.threshold_policy)
      : session.threshold_policy || DEFAULT_THRESHOLD_POLICY;

    // Compute computed_m (new threshold)
    const n_new = connected_new_signers;
    let computed_m: number;

    if (policy.override_m && policy.override_m >= 2) {
      computed_m = policy.override_m;
    } else {
      // formula: ceil(2 * n_new / 3)
      computed_m = Math.max(policy.min_threshold, Math.ceil((2 * n_new) / 3));
    }

    // HARD FLOOR: computed_m >= 2 always (unless allow_m_one is true)
    if (computed_m < 2 && !policy.allow_m_one) {
      return res.status(400).json({
        error: `Computed threshold (${computed_m}) is below the hard floor of 2. Need at least 2 new signers for a valid recovery.`,
      });
    }

    // Update session to locked
    await pool.query(
      `UPDATE recovery_sessions
       SET status = 'locked',
           computed_old_n = $2,
           computed_new_n = $3,
           computed_m = $4,
           locked_at = NOW()
       WHERE session_id = $1`,
      [sessionId, connected_old_signers, connected_new_signers, computed_m]
    );

    // Log audit event
    await DatabaseService.logAuditEvent({
      org_id: session.org_id,
      event_type: 'recovery_locked',
      session_id: sessionId,
      user_id: session.admin_user_id,
      details: {
        computed_old_n: connected_old_signers,
        computed_new_n: connected_new_signers,
        computed_m,
        old_threshold,
        threshold_policy: policy,
      },
    });

    console.log(
      `🔒 Recovery session locked: ${sessionId}`,
      `(old_n=${connected_old_signers}, new_n=${connected_new_signers}, m=${computed_m})`
    );

    res.json({
      session_id: sessionId,
      status: 'locked',
      computed_old_n: connected_old_signers,
      computed_new_n: connected_new_signers,
      computed_m,
      locked_at: new Date().toISOString(),
    });
  } catch (error) {
    console.error('Error locking recovery session:', error);
    res.status(500).json({ error: 'Failed to lock recovery session' });
  }
});

// ============================================================================
// POST /sessions/:sessionId/cancel — Cancel recovery session
// ============================================================================

router.post('/sessions/:sessionId/cancel', requireApiKey, async (req, res) => {
  try {
    const { sessionId } = req.params;

    // Fetch session
    const sessionResult = await pool.query(
      `SELECT * FROM recovery_sessions WHERE session_id = $1`,
      [sessionId]
    );

    if (sessionResult.rows.length === 0) {
      return res.status(404).json({ error: 'Session not found' });
    }

    const session = sessionResult.rows[0];

    // Only allow cancellation if status is not terminal
    if (TERMINAL_STATUSES.includes(session.status)) {
      return res.status(409).json({
        error: `Cannot cancel session with terminal status '${session.status}'`,
      });
    }

    // Update status to cancelled
    await pool.query(
      `UPDATE recovery_sessions
       SET status = 'cancelled',
           error_code = 'admin_cancelled',
           error_message = 'Recovery session cancelled by admin',
           completed_at = NOW()
       WHERE session_id = $1`,
      [sessionId]
    );

    // Log audit event
    await DatabaseService.logAuditEvent({
      org_id: session.org_id,
      event_type: 'recovery_cancelled',
      session_id: sessionId,
      user_id: session.admin_user_id,
      details: {
        previous_status: session.status,
        cancelled_at: new Date().toISOString(),
      },
    });

    // Notify connected WebSocket clients and close their connections
    const wsManager = req.app.get('wsManager');
    if (wsManager) {
      wsManager.cancelRecoverySession(sessionId);
    }

    console.log('🚫 Recovery session cancelled:', sessionId);

    res.json({ status: 'cancelled' });
  } catch (error) {
    console.error('Error cancelling recovery session:', error);
    res.status(500).json({ error: 'Failed to cancel recovery session' });
  }
});

export default router;
