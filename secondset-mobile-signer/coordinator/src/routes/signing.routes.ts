// coordinator/src/routes/signing.routes.ts

import express from 'express';
import { DatabaseService } from '../services/DatabaseService';
import { v4 as uuidv4 } from 'uuid';
import { Pool } from 'pg';
import jwt from 'jsonwebtoken';
import { requireApiKey, rateLimit } from '../middleware/auth';
import { ChainType, curveForChain } from '../types';
import { PushNotificationService } from '../services/PushNotificationService';

const router = express.Router();

// Create a database pool for signing routes
const db = new Pool({
  connectionString: process.env.DATABASE_URL,
});

const JWT_SECRET = process.env.JWT_SECRET || 'change-me-in-production';

/**
 * GET /api/v1/signing/sessions/pending?wallet_address=0x...
 * Fetch pending signing sessions for a wallet (used by mobile app polling)
 */
router.get('/sessions/pending', rateLimit(60, 60000), async (req, res) => {
  try {
    const { wallet_address } = req.query;

    if (!wallet_address || typeof wallet_address !== 'string') {
      return res.status(400).json({ error: 'wallet_address query parameter required' });
    }

    const result = await db.query(
      `SELECT ss.session_id, ss.org_id, ss.wallet_address, ss.request_id,
              ss.tx_details, ss.required_signers, ss.status, ss.expires_at, ss.created_at,
              ss.chain, ss.curve_type,
              (SELECT COUNT(*)::int FROM signing_participants sp WHERE sp.session_id = ss.session_id) as current_signers
       FROM signing_sessions ss
       WHERE ss.wallet_address = $1
         AND ss.status = 'waiting_for_signers'
         AND ss.expires_at > NOW()
       ORDER BY ss.created_at DESC`,
      [wallet_address]
    );

    // Parse tx_details JSON for each session
    const sessions = result.rows.map(row => ({
      ...row,
      tx_details: typeof row.tx_details === 'string' ? JSON.parse(row.tx_details) : row.tx_details,
    }));

    res.json({ sessions });
  } catch (error) {
    console.error('Error fetching pending signing sessions:', error);
    res.status(500).json({ error: 'Failed to fetch pending sessions' });
  }
});

/**
 * POST /api/v1/signing/sessions
 * Create a new signing session
 */
router.post('/sessions', requireApiKey, rateLimit(50, 60000), async (req, res) => {
  try {
    const {
      org_id,
      wallet_address,
      request_id,
      tx_digest,
      tx_details,
      required_signers = 2,
    } = req.body;

    const { webhook_url } = req.body;

    // Determine chain and curve type
    const chain: ChainType = req.body.chain || 'EVM';
    const curve_type = curveForChain(chain);
    const vault_id = req.body.vault_id;

    // Validate required fields
    if (!org_id || !wallet_address || !request_id || !tx_digest || !tx_details) {
      const missing = [];
      if (!org_id) missing.push('org_id');
      if (!wallet_address) missing.push('wallet_address');
      if (!request_id) missing.push('request_id');
      if (!tx_digest) missing.push('tx_digest');
      if (!tx_details) missing.push('tx_details');
      return res.status(400).json({ error: `Missing required fields: ${missing.join(', ')}` });
    }

    const session_id = uuidv4();
    const join_token = uuidv4().replace(/-/g, '');
    const expires_at = new Date(Date.now() + 30 * 60 * 1000); // 30 minutes

    // Create signing session
    const result = await db.query(
      `INSERT INTO signing_sessions (
        session_id, org_id, wallet_address, request_id,
        tx_digest, tx_details, required_signers, expires_at,
        chain, curve_type, vault_id
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
      RETURNING session_id, status, expires_at`,
      [session_id, org_id, wallet_address, request_id, tx_digest, JSON.stringify(tx_details), required_signers, expires_at, chain, curve_type, vault_id || null]
    );

    // Generate QR code data for mobile signers
    const qr_code_data = JSON.stringify({
      type: 'signing',
      session_id,
      org_id,
      wallet_address,
      join_token,
      expiry: expires_at.toISOString(),
      chain,
      curve_type,
    });

    console.log('✅ Created signing session:', session_id, `(${chain}/${curve_type})`);

    res.status(201).json({
      session_id: result.rows[0].session_id,
      status: result.rows[0].status,
      expires_at: result.rows[0].expires_at,
      qr_code_data,
    });

    // Best-effort: notify enrolled signers via push notification
    PushNotificationService.sendSigningRequest(wallet_address, tx_details, session_id).catch(() => {});
  } catch (error) {
    console.error('Error creating signing session:', error);
    res.status(500).json({ error: 'Failed to create signing session' });
  }
});

/**
 * POST /api/v1/sign/sessions/:sessionId/join
 * Join a signing session
 */
router.post('/sessions/:sessionId/join', async (req, res) => {
  try {
    const { sessionId } = req.params;
    const { device_id, role, biometric_verified = true } = req.body;

    // Check if session exists and is active
    const sessionResult = await db.query(
      `SELECT * FROM signing_sessions WHERE session_id = $1`,
      [sessionId]
    );

    if (sessionResult.rows.length === 0) {
      return res.status(404).json({ error: 'Session not found' });
    }

    const session = sessionResult.rows[0];

    if (session.status !== 'waiting_for_signers' && session.status !== 'ready') {
      return res.status(400).json({ error: 'Session not accepting participants' });
    }

    if (new Date(session.expires_at) < new Date()) {
      return res.status(400).json({ error: 'Session expired' });
    }

    // Check if device was part of original keygen FOR THIS WALLET
    // Must filter by wallet_address to avoid returning the wrong keygen participant
    // when a device has participated in multiple keygen ceremonies (e.g., EVM + Solana)
    const deviceResult = await db.query(
      `SELECT kp.* FROM keygen_participants kp
       JOIN keygen_sessions ks ON kp.session_id = ks.session_id
       WHERE ks.org_id = $1 AND kp.device_id = $2 AND kp.role = $3
         AND ks.wallet_address = $4
       ORDER BY ks.completed_at DESC
       LIMIT 1`,
      [session.org_id, device_id, role, session.wallet_address]
    );

    let keygenParticipant;
    if (deviceResult.rows.length === 0) {
      // Fallback: try without wallet_address filter for legacy sessions
      const fallbackResult = await db.query(
        `SELECT kp.* FROM keygen_participants kp
         JOIN keygen_sessions ks ON kp.session_id = ks.session_id
         WHERE ks.org_id = $1 AND kp.device_id = $2 AND kp.role = $3
         ORDER BY ks.completed_at DESC
         LIMIT 1`,
        [session.org_id, device_id, role]
      );

      if (fallbackResult.rows.length === 0) {
        return res.status(403).json({ error: 'Device not authorized for this wallet' });
      }

      console.log('⚠️ Using fallback keygen lookup (no wallet_address match) for device:', device_id);
      keygenParticipant = fallbackResult.rows[0];
    } else {
      keygenParticipant = deviceResult.rows[0];
    }

    console.log(`Keygen participant lookup: device=${device_id}, role=${role}, wallet=${session.wallet_address}, signer_index=${keygenParticipant.signer_index}`);
    const participant_id = uuidv4();

    // Add participant to signing session
    await db.query(
      `INSERT INTO signing_participants (
        participant_id, session_id, device_id, role, 
        signer_index, biometric_verified
      ) VALUES ($1, $2, $3, $4, $5, $6)`,
      [participant_id, sessionId, device_id, role, keygenParticipant.signer_index, biometric_verified]
    );

    // Check how many participants have joined
    const participantCount = await db.query(
      `SELECT COUNT(*) as count FROM signing_participants WHERE session_id = $1`,
      [sessionId]
    );

    const count = parseInt(participantCount.rows[0].count);

    // Update session status if enough signers joined
    if (count >= session.required_signers) {
      await db.query(
        `UPDATE signing_sessions SET status = 'ready', started_at = NOW() WHERE session_id = $1`,
        [sessionId]
      );
    }

    // Generate WebSocket JWT token (consistent with keygen flow, includes org_id for audit)
    const ws_token = jwt.sign(
      {
        sub: participant_id,
        session_id: sessionId,
        role,
        org_id: session.org_id,
        jti: uuidv4(),
      },
      JWT_SECRET,
      { expiresIn: '30m' } // 30 minutes to match signing session expiry
    );

    console.log(`✅ ${role} joined signing session ${sessionId} (${count}/${session.required_signers})`);

    res.status(200).json({
      participant_id,
      signer_index: keygenParticipant.signer_index,
      ws_url: `ws://${req.headers.host}/ws`,
      ws_token,
      session_details: {
        tx_digest: session.tx_digest,
        tx_details: session.tx_details,
        required_signers: session.required_signers,
        current_signers: count,
        expires_at: session.expires_at,
      },
    });
  } catch (error) {
    console.error('Error joining signing session:', error);
    res.status(500).json({ error: 'Failed to join signing session' });
  }
});

/**
 * GET /api/v1/sign/sessions/:sessionId/status
 * Get signing session status
 */
router.get('/sessions/:sessionId/status', async (req, res) => {
  try {
    const { sessionId } = req.params;

    const sessionResult = await db.query(
      `SELECT * FROM signing_sessions WHERE session_id = $1`,
      [sessionId]
    );

    if (sessionResult.rows.length === 0) {
      return res.status(404).json({ error: 'Session not found' });
    }

    const session = sessionResult.rows[0];

    const participants = await db.query(
      `SELECT participant_id, role, signer_index, joined_at, 
              connection_status, biometric_verified, completed_at
       FROM signing_participants WHERE session_id = $1`,
      [sessionId]
    );

    res.json({
      session_id: session.session_id,
      status: session.status,
      participants: participants.rows,
      signature: session.signature,
      tx_hash: session.tx_hash,
      error_code: session.error_code,
      error_message: session.error_message,
    });
  } catch (error) {
    console.error('Error getting session status:', error);
    res.status(500).json({ error: 'Failed to get session status' });
  }
});

export default router;
