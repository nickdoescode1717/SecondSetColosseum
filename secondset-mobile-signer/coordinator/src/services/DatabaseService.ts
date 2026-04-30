// coordinator/src/services/DatabaseService.ts

import { Pool } from 'pg';
import type {
  KeygenSession,
  KeygenParticipant,
  AuditEvent,
  SigningSession,
  SigningParticipant
} from '../types';

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
});

export class DatabaseService {
  static async healthCheck(): Promise<boolean> {
    try {
      await pool.query('SELECT 1');
      return true;
    } catch (error) {
      console.error('Database health check failed:', error);
      return false;
    }
  }

  static async createKeygenSession(session: Omit<KeygenSession, 'created_at'> & { chain?: string; curve_type?: string; vault_id?: string }): Promise<void> {
    await pool.query(
      `INSERT INTO keygen_sessions (
        session_id, org_id, admin_user_id, status, join_token, short_code, expires_at,
        chain, curve_type, vault_id
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)`,
      [
        session.session_id,
        session.org_id,
        session.admin_user_id,
        session.status,
        session.join_token,
        session.short_code,
        session.expires_at,
        session.chain || 'EVM',
        session.curve_type || 'secp256k1',
        session.vault_id || null,
      ]
    );
  }

  static async getKeygenSession(session_id: string): Promise<KeygenSession | null> {
    const result = await pool.query(
      'SELECT * FROM keygen_sessions WHERE session_id = $1',
      [session_id]
    );
    return result.rows[0] || null;
  }

  static async getParticipantCount(session_id: string): Promise<number> {
    const result = await pool.query(
      'SELECT COUNT(*) as count FROM keygen_participants WHERE session_id = $1',
      [session_id]
    );
    return parseInt(result.rows[0].count);
  }

  static async addParticipant(participant: Omit<KeygenParticipant, 'joined_at'>): Promise<void> {
    await pool.query(
      `INSERT INTO keygen_participants (
        participant_id, session_id, device_id, role, signer_index,
        device_public_key, device_os, device_os_version, app_version
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
      [
        participant.participant_id,
        participant.session_id,
        participant.device_id,
        participant.role,
        participant.signer_index,
        participant.device_public_key,
        participant.device_os,
        participant.device_os_version,
        participant.app_version,
      ]
    );
  }

  static async getParticipants(session_id: string): Promise<KeygenParticipant[]> {
    const result = await pool.query(
      'SELECT * FROM keygen_participants WHERE session_id = $1 ORDER BY signer_index',
      [session_id]
    );
    return result.rows;
  }

  static async logAuditEvent(event: Omit<AuditEvent, 'id' | 'timestamp'>): Promise<void> {
    await pool.query(
      `INSERT INTO audit_events (
        org_id, event_type, session_id, device_id, user_id, ip_address, details
      ) VALUES ($1, $2, $3, $4, $5, $6, $7)`,
      [
        event.org_id,
        event.event_type,
        event.session_id,
        event.device_id,
        event.user_id,
        event.ip_address,
        event.details ? JSON.stringify(event.details) : null,
      ]
    );
  }

  static async updateParticipantConnection(
    participant_id: string,
    status: 'connected' | 'disconnected'
  ): Promise<void> {
    await pool.query(
      `UPDATE keygen_participants 
       SET connection_status = $1, last_seen_at = NOW()
       WHERE participant_id = $2`,
      [status, participant_id]
    );
  }

  static async updateParticipantAddress(
    participant_id: string,
    wallet_address: string
  ): Promise<void> {
    await pool.query(
      `UPDATE keygen_participants 
       SET reported_address = $1
       WHERE participant_id = $2`,
      [wallet_address, participant_id]
    );
  }

  static async updateSessionStatus(
    session_id: string,
    status: string,
    updates: {
      wallet_address?: string;
      public_key?: string;
      completed_at?: Date;
      started_at?: Date;
      error_code?: string;
      error_message?: string;
    }
  ): Promise<void> {
    const fields: string[] = ['status = $1'];
    const values: any[] = [status, session_id];
    let paramIndex = 2;

    if (updates.wallet_address) {
      fields.push(`wallet_address = $${++paramIndex}`);
      values.push(updates.wallet_address);
    }
    if (updates.public_key) {
      fields.push(`public_key = $${++paramIndex}`);
      values.push(updates.public_key);
    }
    if (updates.completed_at) {
      fields.push(`completed_at = $${++paramIndex}`);
      values.push(updates.completed_at);
    }
    if (updates.started_at) {
      fields.push(`started_at = $${++paramIndex}`);
      values.push(updates.started_at);
    }
    if (updates.error_code) {
      fields.push(`error_code = $${++paramIndex}`);
      values.push(updates.error_code);
    }
    if (updates.error_message) {
      fields.push(`error_message = $${++paramIndex}`);
      values.push(updates.error_message);
    }

    await pool.query(
      `UPDATE keygen_sessions SET ${fields.join(', ')} WHERE session_id = $2`,
      values
    );
  }

  // ============================================================================
  // SIGNING SESSION METHODS
  // ============================================================================

  static async createSigningSession(session: {
    session_id: string;
    org_id: string;
    wallet_address: string;
    request_id: string;
    tx_digest: string;
    tx_details: any;
    required_signers: number;
    expires_at: Date;
    chain?: string;
    curve_type?: string;
    vault_id?: string;
  }): Promise<void> {
    await pool.query(
      `INSERT INTO signing_sessions (
        session_id, org_id, wallet_address, request_id, tx_digest,
        tx_details, required_signers, expires_at, status,
        chain, curve_type, vault_id
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)`,
      [
        session.session_id,
        session.org_id,
        session.wallet_address,
        session.request_id,
        session.tx_digest,
        JSON.stringify(session.tx_details),
        session.required_signers,
        session.expires_at,
        'waiting_for_signers',
        session.chain || 'EVM',
        session.curve_type || 'secp256k1',
        session.vault_id || null,
      ]
    );
  }

  static async getSigningSession(session_id: string): Promise<any> {
    const result = await pool.query(
      'SELECT * FROM signing_sessions WHERE session_id = $1',
      [session_id]
    );
    return result.rows[0] || null;
  }

  static async addSigningParticipant(participant: {
    participant_id: string;
    session_id: string;
    device_id: string;
    role: string;
    signer_index: number;
    biometric_verified: boolean;
  }): Promise<void> {
    await pool.query(
      `INSERT INTO signing_participants (
        participant_id, session_id, device_id, role,
        signer_index, biometric_verified
      ) VALUES ($1, $2, $3, $4, $5, $6)`,
      [
        participant.participant_id,
        participant.session_id,
        participant.device_id,
        participant.role,
        participant.signer_index,
        participant.biometric_verified,
      ]
    );
  }

  static async getSigningParticipants(session_id: string): Promise<any[]> {
    const result = await pool.query(
      'SELECT * FROM signing_participants WHERE session_id = $1 ORDER BY signer_index',
      [session_id]
    );
    return result.rows;
  }

  static async getSigningParticipantCount(session_id: string): Promise<number> {
    const result = await pool.query(
      'SELECT COUNT(*) as count FROM signing_participants WHERE session_id = $1',
      [session_id]
    );
    return parseInt(result.rows[0].count);
  }

  static async updateSigningParticipantNonce(
    participant_id: string,
    nonce_point: string
  ): Promise<void> {
    await pool.query(
      `UPDATE signing_participants SET nonce_point = $1 WHERE participant_id = $2`,
      [nonce_point, participant_id]
    );
  }

  static async updateSigningParticipantSignature(
    participant_id: string,
    partial_signature: string
  ): Promise<void> {
    await pool.query(
      `UPDATE signing_participants
       SET partial_signature = $1, completed_at = NOW()
       WHERE participant_id = $2`,
      [partial_signature, participant_id]
    );
  }

  static async updateSigningSessionStatus(
    session_id: string,
    status: string,
    updates: {
      signature?: { r: string; s: string; v: number };
      tx_hash?: string;
      completed_at?: Date;
      started_at?: Date;
      error_code?: string;
      error_message?: string;
    }
  ): Promise<void> {
    const fields: string[] = ['status = $1'];
    const values: any[] = [status, session_id];
    let paramIndex = 2;

    if (updates.signature) {
      fields.push(`signature = $${++paramIndex}`);
      values.push(JSON.stringify(updates.signature));
    }
    if (updates.tx_hash) {
      fields.push(`tx_hash = $${++paramIndex}`);
      values.push(updates.tx_hash);
    }
    if (updates.completed_at) {
      fields.push(`completed_at = $${++paramIndex}`);
      values.push(updates.completed_at);
    }
    if (updates.started_at) {
      fields.push(`started_at = $${++paramIndex}`);
      values.push(updates.started_at);
    }
    if (updates.error_code) {
      fields.push(`error_code = $${++paramIndex}`);
      values.push(updates.error_code);
    }
    if (updates.error_message) {
      fields.push(`error_message = $${++paramIndex}`);
      values.push(updates.error_message);
    }

    await pool.query(
      `UPDATE signing_sessions SET ${fields.join(', ')} WHERE session_id = $2`,
      values
    );
  }
}