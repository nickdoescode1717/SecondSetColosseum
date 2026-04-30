// coordinator/src/services/WebSocketManager.ts

import { WebSocketServer, WebSocket } from 'ws';
import { IncomingMessage } from 'http';
import jwt from 'jsonwebtoken';
import { DatabaseService } from './DatabaseService';
import { WebhookService } from './WebhookService';
import { Pool } from 'pg';

const JWT_SECRET = process.env.JWT_SECRET || 'change-me-in-production';

// ============================================================================
// SIGNATURE AGGREGATION UTILITIES
// ============================================================================

/**
 * Compute modular multiplicative inverse using Extended Euclidean Algorithm
 * Returns: a^(-1) mod m
 */
function modInverse(a: bigint, m: bigint): bigint {
  a = ((a % m) + m) % m;
  let [oldR, r] = [a, m];
  let [oldS, s] = [1n, 0n];

  while (r !== 0n) {
    const quotient = oldR / r;
    [oldR, r] = [r, oldR - quotient * r];
    [oldS, s] = [s, oldS - quotient * s];
  }

  return ((oldS % m) + m) % m;
}

/**
 * secp256k1 curve order
 */
const CURVE_ORDER = BigInt('0xFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFEBAAEDCE6AF48A03BBFD25E8CD0364141');

/**
 * Ed25519 curve order (l)
 */
const ED25519_ORDER = BigInt('0x1000000000000000000000000000000014DEF9DEA2F79CD65812631A5CF5D3ED');

/**
 * secp256k1 field modulus
 */
const FIELD_MODULUS = BigInt('0xFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFEFFFFFC2F');

/**
 * Combine two elliptic curve points (uncompressed format: 04 + x + y)
 * Uses the secp256k1 curve addition formula
 */
function combineNoncePoints(point1Hex: string, point2Hex: string): string {
  const p1 = point1Hex.startsWith('0x') ? point1Hex.slice(2) : point1Hex;
  const p2 = point2Hex.startsWith('0x') ? point2Hex.slice(2) : point2Hex;

  const p1Buf = Buffer.from(p1, 'hex');
  const p2Buf = Buffer.from(p2, 'hex');

  const x1 = BigInt('0x' + p1Buf.slice(1, 33).toString('hex'));
  const y1 = BigInt('0x' + p1Buf.slice(33, 65).toString('hex'));
  const x2 = BigInt('0x' + p2Buf.slice(1, 33).toString('hex'));
  const y2 = BigInt('0x' + p2Buf.slice(33, 65).toString('hex'));

  const p = FIELD_MODULUS;
  let x3: bigint, y3: bigint;

  if (x1 === x2) {
    if (y1 === y2) {
      // Point doubling
      const num = (3n * x1 * x1) % p;
      const den = (2n * y1) % p;
      const slope = (num * modInverse(den, p)) % p;
      x3 = ((slope * slope - 2n * x1) % p + p) % p;
      y3 = ((slope * (x1 - x3) - y1) % p + p) % p;
    } else {
      throw new Error('Points are inverses');
    }
  } else {
    const num = ((y2 - y1) % p + p) % p;
    const den = ((x2 - x1) % p + p) % p;
    const slope = (num * modInverse(den, p)) % p;
    x3 = ((slope * slope - x1 - x2) % p + p) % p;
    y3 = ((slope * (x1 - x3) - y1) % p + p) % p;
  }

  const x3Hex = x3.toString(16).padStart(64, '0');
  const y3Hex = y3.toString(16).padStart(64, '0');
  return '04' + x3Hex + y3Hex;
}

/**
 * Reconstruct full signature from 2 partial signatures using Lagrange interpolation
 * s = s1 * L1 + s2 * L2 (mod n)
 * where L_i are Lagrange coefficients for threshold secret sharing reconstruction
 */
function reconstructSignature(
  s1: bigint,
  index1: number,
  s2: bigint,
  index2: number
): bigint {
  const x1Big = BigInt(index1);
  const x2Big = BigInt(index2);

  // Lagrange coefficient for index1: L1 = x2 / (x2 - x1)
  const numerator1 = x2Big;
  const denominator1 = (x2Big - x1Big + CURVE_ORDER) % CURVE_ORDER;
  const L1 = (numerator1 * modInverse(denominator1, CURVE_ORDER)) % CURVE_ORDER;

  // Lagrange coefficient for index2: L2 = -x1 / (x2 - x1) = (n - x1) / (x2 - x1)
  const numerator2 = (CURVE_ORDER - x1Big) % CURVE_ORDER;
  const L2 = (numerator2 * modInverse(denominator1, CURVE_ORDER)) % CURVE_ORDER;

  // Combine: s = s1 * L1 + s2 * L2 (mod n)
  const term1 = (s1 * L1) % CURVE_ORDER;
  const term2 = (s2 * L2) % CURVE_ORDER;

  return (term1 + term2) % CURVE_ORDER;
}

/**
 * Combine Ed25519 partial signatures: s = s_1 + s_2 (mod l)
 * Ed25519 signers pre-multiply their key shares by Lagrange coefficients,
 * so the coordinator simply sums partial signatures (no interpolation needed).
 */
function combineEdDSAPartialSignatures(s1: bigint, s2: bigint): bigint {
  return (s1 + s2) % ED25519_ORDER;
}

/**
 * Combine two Ed25519 nonce points (compressed 32-byte format)
 * Uses @noble/curves for proper twisted Edwards point addition
 */
let _ed25519CombinePoints: ((p1Hex: string, p2Hex: string) => string) | null = null;

async function getEd25519PointCombiner(): Promise<(p1Hex: string, p2Hex: string) => string> {
  if (!_ed25519CombinePoints) {
    const { ed25519 } = await import('@noble/curves/ed25519.js');
    _ed25519CombinePoints = (p1Hex: string, p2Hex: string): string => {
      const p1 = ed25519.Point.fromHex(p1Hex);
      const p2 = ed25519.Point.fromHex(p2Hex);
      const combined = p1.add(p2);
      return Buffer.from(combined.toBytes()).toString('hex');
    };
  }
  return _ed25519CombinePoints;
}

// ============================================================================

interface WebSocketClient extends WebSocket {
  participantId?: string;
  sessionId?: string;
  role?: string;
  orgId?: string;
  isAlive?: boolean;
}

interface KeygenRoundMessage {
  type: 'keygen_round';
  from_participant: string;
  to_participant: string;
  round: number;
  payload: string;
  timestamp: string;
}

interface KeygenCompleteMessage {
  type: 'keygen_complete';
  participant_id: string;
  wallet_address: string;
  public_key_share: string;
}

interface SignRoundMessage {
  type: 'sign_round';
  from_participant: string;
  to_participant: string;
  round: number;
  payload: string;
  timestamp: string;
}

interface SignCompleteMessage {
  type: 'sign_complete';
  participant_id: string;
  partial_signature: string;
  nonce_point: string;
}

interface RecoveryRoundMessage {
  type: 'recovery_round';
  from_participant: string;
  to_participant: string;
  round: number;
  payload: string;
  timestamp: string;
}

interface RecoveryCompleteMessage {
  type: 'recovery_complete';
  participant_id: string;
  participant_type: 'old_signer' | 'new_signer';
  reported_address?: string;
  share_deletion_confirmed?: boolean;
}

type ClientMessage =
  | { type: 'ping' }
  | KeygenRoundMessage
  | KeygenCompleteMessage
  | SignRoundMessage
  | SignCompleteMessage
  | RecoveryRoundMessage
  | RecoveryCompleteMessage;

export class WebSocketManager {
  private wss: WebSocketServer;
  private clients: Map<string, WebSocketClient> = new Map();
  private db: Pool;

  constructor(wss: WebSocketServer) {
    this.wss = wss;
    this.db = new Pool({
      connectionString: process.env.DATABASE_URL,
    });

    this.setupWebSocketServer();
    this.startHeartbeat();
  }

  private setupWebSocketServer() {
    this.wss.on('connection', async (ws: WebSocketClient, req: IncomingMessage) => {
      try {
        const token = this.extractToken(req);
        if (!token) {
          ws.close(1008, 'Authentication required');
          return;
        }

        const payload = this.verifyToken(token);
        if (!payload) {
          ws.close(1008, 'Invalid token');
          return;
        }

        ws.participantId = payload.sub;
        ws.sessionId = payload.session_id;
        ws.role = payload.role;
        ws.orgId = payload.org_id;
        ws.isAlive = true;

        this.clients.set(payload.sub, ws);

        console.log(`✅ WebSocket connected: ${ws.role} (${ws.participantId?.slice(0, 8)}...)`);

        // Update connection status in database
        if (ws.participantId) {
          await this.updateConnectionStatus(ws.participantId, 'connected');
        }

        // Send connected message
        this.sendToClient(ws, {
          type: 'connected',
          participant_id: ws.participantId,
          session_id: ws.sessionId,
          role: ws.role,
        });

        // Check if we should start a ceremony or signing session
        if (ws.sessionId) {
          await this.checkAndStartSession(ws.sessionId);
        }

        // Handle incoming messages
        ws.on('message', async (data: Buffer) => {
          try {
            const message: ClientMessage = JSON.parse(data.toString());
            await this.handleMessage(ws, message);
          } catch (error) {
            console.error('Error handling message:', error);
          }
        });

        // Handle pong responses
        ws.on('pong', () => {
          ws.isAlive = true;
        });

        // Handle disconnection
        ws.on('close', async () => {
          console.log(`❌ WebSocket disconnected: ${ws.role}`);
          this.clients.delete(ws.participantId!);
          if (ws.participantId) {
            await this.updateConnectionStatus(ws.participantId, 'disconnected');
          }
        });

      } catch (error) {
        console.error('WebSocket connection error:', error);
        ws.close(1011, 'Internal server error');
      }
    });
  }

  private extractToken(req: IncomingMessage): string | null {
    const url = new URL(req.url!, `http://${req.headers.host}`);
    return url.searchParams.get('token');
  }

  private verifyToken(token: string): any {
    try {
      return jwt.verify(token, JWT_SECRET);
    } catch (error) {
      return null;
    }
  }

  private async updateConnectionStatus(participantId: string, status: string) {
    try {
      // Try keygen participants first
      const keygenResult = await this.db.query(
        `UPDATE keygen_participants SET connection_status = $1, last_seen_at = NOW() 
         WHERE participant_id = $2`,
        [status, participantId]
      );

      // If not found in keygen, try signing participants
      if (keygenResult.rowCount === 0) {
        const signingResult = await this.db.query(
          `UPDATE signing_participants SET connection_status = $1, last_seen_at = NOW()
           WHERE participant_id = $2`,
          [status, participantId]
        );

        // If not found in signing, try recovery participants
        if (signingResult.rowCount === 0) {
          await this.db.query(
            `UPDATE recovery_participants SET connection_status = $1, last_seen_at = NOW()
             WHERE participant_id = $2`,
            [status, participantId]
          );
        }
      }
    } catch (error) {
      console.error('Error updating connection status:', error);
    }
  }

  private async checkAndStartSession(sessionId: string) {
    // Check if it's a keygen session
    const keygenSession = await DatabaseService.getKeygenSession(sessionId);
    if (keygenSession) {
      const participantCount = await DatabaseService.getParticipantCount(sessionId);
      console.log(`��� Session ${sessionId.slice(0, 8)}: ${participantCount}/3 participants connected`);

      if (participantCount === 3) {
        console.log('��� All 3 participants connected! Starting keygen ceremony...');
        await this.startKeygenCeremony(sessionId);
      }
      return;
    }

    // Check if it's a signing session
    const signingResult = await this.db.query(
      `SELECT * FROM signing_sessions WHERE session_id = $1`,
      [sessionId]
    );

    if (signingResult.rows.length > 0) {
      const session = signingResult.rows[0];
      const participantCount = await this.db.query(
        `SELECT COUNT(*) as count FROM signing_participants WHERE session_id = $1`,
        [sessionId]
      );

      const count = parseInt(participantCount.rows[0].count);
      console.log(`��� Signing session ${sessionId.slice(0, 8)}: ${count}/${session.required_signers} signers connected`);

      if (count >= session.required_signers) {
        console.log('��� Enough signers connected! Starting signing session...');
        await this.startSigningSession(sessionId);
      }
      return;
    }

    // Check if it's a recovery session (status = 'locked' means waiting for WS connections)
    const recoveryResult = await this.db.query(
      `SELECT * FROM recovery_sessions WHERE session_id = $1 AND status = 'locked'`,
      [sessionId]
    );

    if (recoveryResult.rows.length > 0) {
      const session = recoveryResult.rows[0];
      const connectedCount = await this.db.query(
        `SELECT COUNT(*) as count FROM recovery_participants
         WHERE session_id = $1 AND connection_status = 'connected'`,
        [sessionId]
      );
      const totalExpected = (session.computed_old_n || 0) + (session.computed_new_n || 0);
      const count = parseInt(connectedCount.rows[0].count);
      console.log(`Recovery session ${sessionId.slice(0, 8)}: ${count}/${totalExpected} participants connected`);

      if (count >= totalExpected) {
        console.log('All recovery participants connected! Starting recovery ceremony...');
        await this.startRecoveryCeremony(sessionId);
      }
    }
  }

  private async startKeygenCeremony(sessionId: string) {
    try {
      await DatabaseService.updateSessionStatus(sessionId, 'in_progress', {});

      const participants = await DatabaseService.getParticipants(sessionId);
      const session = await DatabaseService.getKeygenSession(sessionId);
      const curve_type = session?.curve_type || 'secp256k1';
      const protocol_version = curve_type === 'ed25519' ? 'tss-eddsa-v1' : 'tss-ecdsa-v1';

      const message = {
        type: 'keygen_start',
        participants: participants.map(p => ({
          participant_id: p.participant_id,
          index: p.signer_index,
          role: p.role,
        })),
        protocol_version,
        curve_type,
      };

      this.broadcastToSession(sessionId, message);
    } catch (error) {
      console.error('Error starting keygen ceremony:', error);
    }
  }

  private async startSigningSession(sessionId: string) {
    try {
      await this.db.query(
        `UPDATE signing_sessions SET status = 'in_progress', started_at = NOW() WHERE session_id = $1`,
        [sessionId]
      );

      const sessionResult = await this.db.query(
        `SELECT * FROM signing_sessions WHERE session_id = $1`,
        [sessionId]
      );

      const session = sessionResult.rows[0];
      const curve_type = session.curve_type || 'secp256k1';
      const protocol_version = curve_type === 'ed25519' ? 'tss-eddsa-v1' : 'tss-ecdsa-v1';

      const participantsResult = await this.db.query(
        `SELECT * FROM signing_participants WHERE session_id = $1`,
        [sessionId]
      );

      const participants = participantsResult.rows;

      const message = {
        type: 'signing_start',
        participants: participants.map(p => ({
          participant_id: p.participant_id,
          index: p.signer_index,
          role: p.role,
        })),
        tx_digest: session.tx_digest,
        tx_details: session.tx_details,
        protocol_version,
        curve_type,
      };

      this.broadcastToSession(sessionId, message);
    } catch (error) {
      console.error('Error starting signing session:', error);
    }
  }

  private async handleMessage(ws: WebSocketClient, message: ClientMessage) {
    console.log(`��� Message from ${ws.role}:`, message.type);

    switch (message.type) {
      case 'ping':
        this.sendToClient(ws, { type: 'pong' });
        break;

      case 'keygen_round':
        await this.handleKeygenRound(ws, message);
        break;

      case 'keygen_complete':
        await this.handleKeygenComplete(ws, message);
        break;

      case 'sign_round':
        await this.handleSignRound(ws, message);
        break;

      case 'sign_complete':
        await this.handleSignComplete(ws, message);
        break;

      case 'recovery_round':
        await this.handleRecoveryRound(ws, message);
        break;

      case 'recovery_complete':
        await this.handleRecoveryComplete(ws, message);
        break;

      default:
        console.warn('Unknown message type:', message);
    }
  }

  private async handleKeygenRound(ws: WebSocketClient, message: KeygenRoundMessage) {
    if (message.to_participant === '*') {
      this.broadcastToSession(ws.sessionId!, {
        type: 'keygen_round',
        from_participant: message.from_participant,
        round: message.round,
        payload: message.payload,
        timestamp: message.timestamp,
      }, message.from_participant);
    } else {
      const targetClient = this.clients.get(message.to_participant);
      if (targetClient) {
        this.sendToClient(targetClient, {
          type: 'keygen_round',
          from_participant: message.from_participant,
          round: message.round,
          payload: message.payload,
          timestamp: message.timestamp,
        });
      }
    }
  }

  private async handleKeygenComplete(ws: WebSocketClient, message: KeygenCompleteMessage) {
    try {
      await DatabaseService.updateParticipantAddress(
        message.participant_id,
        message.wallet_address
      );

      const participants = await DatabaseService.getParticipants(ws.sessionId!);
      const completedParticipants = participants.filter(p => p.reported_address);

      if (completedParticipants.length === 3) {
        const addresses = completedParticipants.map(p => p.reported_address);
        const allMatch = addresses.every(addr => addr === addresses[0]);

        if (allMatch) {
          console.log('��� Keygen ceremony complete! Wallet address:', addresses[0]);

          await DatabaseService.updateSessionStatus(ws.sessionId!, 'complete', {
            wallet_address: addresses[0]!,
            public_key: message.public_key_share,
          });

          this.broadcastToSession(ws.sessionId!, {
            type: 'keygen_success',
            wallet_address: addresses[0],
            public_key: message.public_key_share,
          });

          // Send webhook to web app
          const session = await DatabaseService.getKeygenSession(ws.sessionId!);
          if (session) {
            await WebhookService.notifyKeygenComplete(
              ws.sessionId!,
              session.org_id,
              addresses[0]!,
              message.public_key_share
            );
          }
        } else {
          console.error('��� CRITICAL: Address mismatch detected!');
          console.error('Addresses:', addresses);

          await DatabaseService.updateSessionStatus(ws.sessionId!, 'failed', {
            error_code: 'address_mismatch',
            error_message: 'Participants reported different wallet addresses',
          });

          this.broadcastToSession(ws.sessionId!, {
            type: 'keygen_failed',
            reason: 'address_mismatch',
            details: 'Security check failed: address mismatch',
          });

          // Send failure webhook to web app
          const session = await DatabaseService.getKeygenSession(ws.sessionId!);
          if (session) {
            await WebhookService.notifyKeygenFailed(
              ws.sessionId!,
              session.org_id,
              'address_mismatch',
              'Participants reported different wallet addresses'
            );
          }
        }
      }
    } catch (error) {
      console.error('Error handling keygen complete:', error);
    }
  }

  private async handleSignRound(ws: WebSocketClient, message: SignRoundMessage) {
    if (message.to_participant === '*') {
      this.broadcastToSession(ws.sessionId!, {
        type: 'sign_round',
        from_participant: message.from_participant,
        round: message.round,
        payload: message.payload,
        timestamp: message.timestamp,
      }, message.from_participant);
    } else {
      const targetClient = this.clients.get(message.to_participant);
      if (targetClient) {
        this.sendToClient(targetClient, {
          type: 'sign_round',
          from_participant: message.from_participant,
          round: message.round,
          payload: message.payload,
          timestamp: message.timestamp,
        });
      }
    }
  }

  private async handleSignComplete(ws: WebSocketClient, message: SignCompleteMessage) {
    try {
      // Store partial signature and nonce point
      await this.db.query(
        `UPDATE signing_participants SET partial_signature = $1, nonce_point = $2, completed_at = NOW()
         WHERE participant_id = $3`,
        [message.partial_signature, message.nonce_point, message.participant_id]
      );

      // Check if we have enough signatures
      const signaturesResult = await this.db.query(
        `SELECT sp.*, ss.required_signers, ss.curve_type
         FROM signing_participants sp
         JOIN signing_sessions ss ON sp.session_id = ss.session_id
         WHERE sp.session_id = $1 AND sp.partial_signature IS NOT NULL`,
        [ws.sessionId]
      );

      const signatures = signaturesResult.rows;
      const required = signatures[0]?.required_signers || 2;
      const curveType = signatures[0]?.curve_type || 'secp256k1';

      if (signatures.length >= required) {
        console.log('Signing session complete! Combining signatures...');

        let combinedSignature: any;

        if (curveType === 'ed25519') {
          // EdDSA (Ed25519) signature combination
          // Signers pre-multiply by Lagrange coefficients, so we just SUM
          const noncePoint1 = signatures[0].nonce_point;
          const noncePoint2 = signatures[1].nonce_point;
          if (!noncePoint1 || !noncePoint2) {
            throw new Error('Missing nonce_point in partial signature');
          }

          console.log('[Ed25519 Diag] Signer 1: index=%d, nonce_point=%s, partial_sig=%s',
            signatures[0].signer_index,
            noncePoint1.slice(0, 20) + '...',
            signatures[0].partial_signature.slice(0, 20) + '...');
          console.log('[Ed25519 Diag] Signer 2: index=%d, nonce_point=%s, partial_sig=%s',
            signatures[1].signer_index,
            noncePoint2.slice(0, 20) + '...',
            signatures[1].partial_signature.slice(0, 20) + '...');

          const combinePoints = await getEd25519PointCombiner();
          const combinedR = combinePoints(noncePoint1, noncePoint2);

          const s1Hex = signatures[0].partial_signature.startsWith('0x')
            ? signatures[0].partial_signature.slice(2)
            : signatures[0].partial_signature;
          const s2Hex = signatures[1].partial_signature.startsWith('0x')
            ? signatures[1].partial_signature.slice(2)
            : signatures[1].partial_signature;

          const s1 = BigInt('0x' + s1Hex);
          const s2 = BigInt('0x' + s2Hex);

          const s = combineEdDSAPartialSignatures(s1, s2);
          const sHex = s.toString(16).padStart(64, '0');

          combinedSignature = { R: combinedR, s: sHex };
          console.log('[Ed25519 Diag] Combined R: %s', combinedR.slice(0, 40) + '...');
          console.log('[Ed25519 Diag] Combined s: %s', sHex.slice(0, 40) + '...');

          // Self-verify: check the combined signature before sending
          try {
            const sessionData = await this.db.query(
              `SELECT tx_digest, wallet_address FROM signing_sessions WHERE session_id = $1`,
              [ws.sessionId]
            );
            if (sessionData.rows.length > 0) {
              const { tx_digest, wallet_address } = sessionData.rows[0];
              const { ed25519: ed25519Lib } = await import('@noble/curves/ed25519.js');

              // Build 64-byte signature: R (32 bytes) + s (32 bytes little-endian)
              const rBytes = Buffer.from(combinedR, 'hex');
              const sBigEndian = Buffer.from(sHex, 'hex');
              const sLittleEndian = Buffer.from(sBigEndian).reverse();
              const sig64 = new Uint8Array(Buffer.concat([rBytes, sLittleEndian]));

              // Message = raw bytes from tx_digest hex
              const cleanDigest = tx_digest.startsWith('0x') ? tx_digest.slice(2) : tx_digest;
              const msgBytes = new Uint8Array(Buffer.from(cleanDigest, 'hex'));

              // Public key from base58 wallet address
              const bs58Mod = await import('bs58');
              const bs58Default = bs58Mod.default || bs58Mod;
              const pubKeyBytes = bs58Default.decode(wallet_address);

              console.log('[Ed25519 Diag] Self-verify inputs:');
              console.log('  R bytes (%d): %s', rBytes.length, combinedR.slice(0, 40));
              console.log('  s LE bytes (%d): %s', sLittleEndian.length, Buffer.from(sLittleEndian).toString('hex').slice(0, 40));
              console.log('  msg bytes (%d): %s', msgBytes.length, cleanDigest.slice(0, 40));
              console.log('  pubKey bytes (%d): %s', pubKeyBytes.length, Buffer.from(pubKeyBytes).toString('hex').slice(0, 40));
              console.log('  wallet_address: %s', wallet_address);

              const isValid = ed25519Lib.verify(sig64, msgBytes, new Uint8Array(pubKeyBytes));
              console.log('[Ed25519 Diag] SELF-VERIFY RESULT: %s', isValid ? 'VALID' : 'INVALID');

              if (!isValid) {
                // Also try without reversing s (in case mobile already sends LE)
                const sigNoReverse = new Uint8Array(Buffer.concat([rBytes, sBigEndian]));
                const isValidBE = ed25519Lib.verify(sigNoReverse, msgBytes, new Uint8Array(pubKeyBytes));
                console.log('[Ed25519 Diag] SELF-VERIFY (s as BE): %s', isValidBE ? 'VALID' : 'INVALID');
              }
            }
          } catch (verifyError) {
            console.error('[Ed25519 Diag] Self-verify error:', verifyError);
          }
        } else {
          // ECDSA (secp256k1) signature combination
          const noncePoint1 = signatures[0].nonce_point;
          const noncePoint2 = signatures[1].nonce_point;
          if (!noncePoint1 || !noncePoint2) {
            throw new Error('Missing nonce_point in partial signature');
          }

          const combinedNoncePoint = combineNoncePoints(noncePoint1, noncePoint2);
          const nonceHex = combinedNoncePoint.startsWith('0x') ? combinedNoncePoint.slice(2) : combinedNoncePoint;
          const nonceBytes = Buffer.from(nonceHex, 'hex');

          if (nonceBytes[0] !== 0x04) {
            throw new Error('Combined nonce point must be in uncompressed format (0x04 prefix)');
          }

          const r = BigInt('0x' + nonceBytes.slice(1, 33).toString('hex'));
          const rHex = '0x' + r.toString(16).padStart(64, '0');

          const s1Hex = signatures[0].partial_signature.startsWith('0x')
            ? signatures[0].partial_signature.slice(2)
            : signatures[0].partial_signature;
          const s2Hex = signatures[1].partial_signature.startsWith('0x')
            ? signatures[1].partial_signature.slice(2)
            : signatures[1].partial_signature;

          const s1 = BigInt('0x' + s1Hex);
          const s2 = BigInt('0x' + s2Hex);
          const index1 = signatures[0].signer_index;
          const index2 = signatures[1].signer_index;

          let s = reconstructSignature(s1, index1, s2, index2);

          const yCoordinate = BigInt('0x' + nonceBytes.slice(33, 65).toString('hex'));
          let v = (yCoordinate % 2n === 0n) ? 27 : 28;

          const HALF_CURVE = CURVE_ORDER / 2n;
          if (s > HALF_CURVE) {
            s = CURVE_ORDER - s;
            v = (v === 27) ? 28 : 27;
          }

          const sHex = '0x' + s.toString(16).padStart(64, '0');
          combinedSignature = { r: rHex, s: sHex, v };
          console.log('Combined ECDSA signature:', combinedSignature);
        }

        const tx_hash = undefined;

        await this.db.query(
          `UPDATE signing_sessions SET
           status = 'complete',
           completed_at = NOW(),
           signature = $1,
           tx_hash = $2
           WHERE session_id = $3`,
          [JSON.stringify(combinedSignature), tx_hash, ws.sessionId]
        );

        this.broadcastToSession(ws.sessionId!, {
          type: 'signing_success',
          signature: combinedSignature,
          tx_hash,
        });

        const sessionResult = await this.db.query(
          `SELECT ss.*, ss.request_id, ss.org_id
           FROM signing_sessions ss
           WHERE ss.session_id = $1`,
          [ws.sessionId]
        );

        if (sessionResult.rows.length > 0) {
          const session = sessionResult.rows[0];
          await WebhookService.notifySigningComplete(
            ws.sessionId!,
            session.org_id,
            session.request_id,
            JSON.stringify(combinedSignature),
            tx_hash
          );
        }
      }
    } catch (error) {
      console.error('Error handling sign complete:', error);

      // Send failure webhook on error
      try {
        const sessionResult = await this.db.query(
          `SELECT org_id, request_id FROM signing_sessions WHERE session_id = $1`,
          [ws.sessionId]
        );

        if (sessionResult.rows.length > 0) {
          const session = sessionResult.rows[0];
          await WebhookService.notifySigningFailed(
            ws.sessionId!,
            session.org_id,
            session.request_id,
            'protocol_error',
            error instanceof Error ? error.message : 'Unknown error during signing'
          );
        }
      } catch (webhookError) {
        console.error('Failed to send failure webhook:', webhookError);
      }
    }
  }

  // ============================================================================
  // RECOVERY CEREMONY METHODS
  // ============================================================================

  private async startRecoveryCeremony(sessionId: string) {
    try {
      // Atomic transition: only proceed if session is still in 'locked' status
      const transitionResult = await this.db.query(
        `UPDATE recovery_sessions SET status = 'in_progress', started_at = NOW() WHERE session_id = $1 AND status = 'locked' RETURNING *`,
        [sessionId]
      );

      if (transitionResult.rows.length === 0) {
        console.log(`Recovery session ${sessionId} already past 'locked' status, skipping start`);
        return;
      }

      const sessionResult = await this.db.query(
        `SELECT * FROM recovery_sessions WHERE session_id = $1`,
        [sessionId]
      );
      const session = sessionResult.rows[0];

      const participantsResult = await this.db.query(
        `SELECT * FROM recovery_participants WHERE session_id = $1 ORDER BY participant_type, COALESCE(old_signer_index, new_signer_index)`,
        [sessionId]
      );
      const participants = participantsResult.rows;

      const oldSigners = participants
        .filter((p: any) => p.participant_type === 'old_signer')
        .map((p: any) => ({
          participant_id: p.participant_id,
          old_signer_index: p.old_signer_index,
          device_public_key: p.device_public_key,
        }));

      const newSigners = participants
        .filter((p: any) => p.participant_type === 'new_signer')
        .map((p: any) => ({
          participant_id: p.participant_id,
          new_signer_index: p.new_signer_index,
          device_public_key: p.device_public_key,
        }));

      const curveType = session.curve_type || 'secp256k1';
      const protocolVersion = curveType === 'ed25519' ? 'tss-recovery-eddsa-v1' : 'tss-recovery-ecdsa-v1';

      const message = {
        type: 'recovery_start',
        session_id: sessionId,
        old_signers: oldSigners,
        new_signers: newSigners,
        old_t: session.old_threshold || 2,
        new_t: session.computed_m,
        new_n: session.computed_new_n,
        curve_type: curveType,
        wallet_address: session.wallet_address,
        protocol_version: protocolVersion,
      };

      this.broadcastToSession(sessionId, message);

      await DatabaseService.logAuditEvent({
        org_id: session.org_id,
        event_type: 'recovery_started',
        session_id: sessionId,
        details: {
          old_signers: oldSigners.length,
          new_signers: newSigners.length,
          new_threshold: session.computed_m,
          curve_type: curveType,
        },
      });

      console.log(`Recovery ceremony started: ${sessionId.slice(0, 8)} (${curveType})`);
    } catch (error) {
      console.error('Error starting recovery ceremony:', error);
    }
  }

  private async handleRecoveryRound(ws: WebSocketClient, message: RecoveryRoundMessage) {
    // Use authenticated identity (ws.participantId) instead of client-provided from_participant
    const authenticatedParticipantId = ws.participantId!;

    if (message.to_participant === '*') {
      this.broadcastToSession(ws.sessionId!, {
        type: 'recovery_round',
        from_participant: authenticatedParticipantId,
        round: message.round,
        payload: message.payload,
        timestamp: message.timestamp,
      }, authenticatedParticipantId);
    } else {
      const targetClient = this.clients.get(message.to_participant);
      if (targetClient) {
        this.sendToClient(targetClient, {
          type: 'recovery_round',
          from_participant: authenticatedParticipantId,
          round: message.round,
          payload: message.payload,
          timestamp: message.timestamp,
        });
      }
    }
  }

  private async handleRecoveryComplete(ws: WebSocketClient, message: RecoveryCompleteMessage) {
    try {
      // Use authenticated identity instead of client-provided participant_id
      const authenticatedParticipantId = ws.participantId!;
      const authenticatedSessionId = ws.sessionId!;

      // Look up participant's actual type from database (don't trust client-provided value)
      const participantLookup = await this.db.query(
        `SELECT participant_type FROM recovery_participants WHERE participant_id = $1 AND session_id = $2`,
        [authenticatedParticipantId, authenticatedSessionId]
      );
      if (participantLookup.rows.length === 0) {
        console.error(`Participant ${authenticatedParticipantId} not found in session ${authenticatedSessionId}`);
        return;
      }
      const actualParticipantType = participantLookup.rows[0].participant_type;

      // Update participant record — scoped by both participant_id AND session_id
      const updates: string[] = ['recovery_completed = true', 'completed_at = NOW()'];
      const values: any[] = [];
      let paramIdx = 0;

      if (message.reported_address) {
        updates.push(`reported_address = $${++paramIdx}`);
        values.push(message.reported_address);
      }
      if (message.share_deletion_confirmed !== undefined) {
        updates.push(`old_share_deletion_confirmed = $${++paramIdx}`);
        values.push(message.share_deletion_confirmed);
      }

      values.push(authenticatedParticipantId);
      values.push(authenticatedSessionId);
      await this.db.query(
        `UPDATE recovery_participants SET ${updates.join(', ')} WHERE participant_id = $${++paramIdx} AND session_id = $${++paramIdx}`,
        values
      );

      // Log share deletion confirmation for old signers
      if (actualParticipantType === 'old_signer' && message.share_deletion_confirmed) {
        const sessionResult = await this.db.query(
          `SELECT org_id FROM recovery_sessions WHERE session_id = $1`,
          [authenticatedSessionId]
        );
        if (sessionResult.rows.length > 0) {
          await DatabaseService.logAuditEvent({
            org_id: sessionResult.rows[0].org_id,
            event_type: 'recovery_share_deleted',
            session_id: authenticatedSessionId,
            device_id: authenticatedParticipantId,
            details: { participant_type: 'old_signer' },
          });
        }
      }

      // Check if all participants have completed
      const allParticipants = await this.db.query(
        `SELECT * FROM recovery_participants WHERE session_id = $1`,
        [authenticatedSessionId]
      );

      const allCompleted = allParticipants.rows.every((p: any) => p.recovery_completed);

      if (allCompleted) {
        // Atomic transition to verifying state — prevents duplicate consensus checks
        const transitionResult = await this.db.query(
          `UPDATE recovery_sessions SET status = 'verifying', verifying_at = NOW() WHERE session_id = $1 AND status = 'in_progress' RETURNING *`,
          [authenticatedSessionId]
        );

        // If rowCount is 0, another handler already transitioned — bail out
        if (transitionResult.rows.length === 0) {
          console.log(`Recovery session ${authenticatedSessionId} already transitioned past in_progress`);
          return;
        }

        // Check address consensus among new signers
        const newSigners = allParticipants.rows.filter((p: any) => p.participant_type === 'new_signer');
        const reportedAddresses = newSigners.map((p: any) => p.reported_address).filter(Boolean);

        const sessionResult = await this.db.query(
          `SELECT * FROM recovery_sessions WHERE session_id = $1`,
          [authenticatedSessionId]
        );
        const session = sessionResult.rows[0];

        if (reportedAddresses.length === newSigners.length) {
          const allMatch = reportedAddresses.every((addr: string) => addr === reportedAddresses[0]);
          const matchesVault = reportedAddresses[0] === session.wallet_address;

          if (allMatch && matchesVault) {
            console.log('Recovery ceremony complete! Address verified:', session.wallet_address);

            // Build recovery record
            const recoveryRecord = {
              recovery_session_id: session.session_id,
              org_id: session.org_id,
              vault_id: session.vault_id,
              wallet_address: session.wallet_address,
              chain: session.chain,
              curve_type: session.curve_type,
              reason: session.reason,
              old_threshold: `${session.old_threshold}-of-3`,
              new_threshold: `${session.computed_m}-of-${session.computed_new_n}`,
              ceremony_timestamp: new Date().toISOString(),
              old_signers: allParticipants.rows
                .filter((p: any) => p.participant_type === 'old_signer')
                .map((p: any) => ({
                  device_id: p.device_id,
                  role: p.role,
                  old_signer_index: p.old_signer_index,
                  share_deletion_confirmed: p.old_share_deletion_confirmed,
                })),
              new_signers: allParticipants.rows
                .filter((p: any) => p.participant_type === 'new_signer')
                .map((p: any) => ({
                  device_id: p.device_id,
                  role: p.role,
                  new_signer_index: p.new_signer_index,
                  reported_address: p.reported_address,
                })),
            };

            await this.db.query(
              `UPDATE recovery_sessions SET status = 'complete', completed_at = NOW(), recovery_record = $1 WHERE session_id = $2`,
              [JSON.stringify(recoveryRecord), authenticatedSessionId]
            );

            this.broadcastToSession(authenticatedSessionId, {
              type: 'recovery_success',
              wallet_address: session.wallet_address,
              new_threshold: session.computed_m,
              new_n: session.computed_new_n,
              revoke_old_shares: true,
              ceremony_timestamp: new Date().toISOString(),
            });

            // Send webhook to web app
            await WebhookService.notifyRecoveryComplete(
              authenticatedSessionId,
              session.org_id,
              session.wallet_address,
              session.chain,
              session.curve_type,
              session.computed_m,
              session.computed_new_n,
              recoveryRecord
            );
          } else {
            console.error('Recovery FAILED: address mismatch!');
            console.error('Expected:', session.wallet_address, 'Got:', reportedAddresses);

            await this.db.query(
              `UPDATE recovery_sessions SET status = 'failed', completed_at = NOW(), error_code = 'address_mismatch', error_message = $1 WHERE session_id = $2`,
              [`Expected ${session.wallet_address}, got ${reportedAddresses.join(', ')}`, authenticatedSessionId]
            );

            this.broadcastToSession(authenticatedSessionId, {
              type: 'recovery_failed',
              reason: 'address_mismatch',
              details: 'New signers derived different wallet addresses or address does not match vault',
            });

            await WebhookService.notifyRecoveryFailed(
              authenticatedSessionId,
              session.org_id,
              'address_mismatch',
              'Address consensus check failed'
            );
          }
        }
      }
    } catch (error) {
      console.error('Error handling recovery complete:', error);
    }
  }

  /**
   * Cancel a recovery session: broadcast cancellation and close connections.
   */
  public cancelRecoverySession(sessionId: string): void {
    this.broadcastToSession(sessionId, {
      type: 'recovery_cancelled',
      reason: 'Session cancelled by admin',
    });

    for (const [participantId, client] of this.clients.entries()) {
      if (client.sessionId === sessionId) {
        client.close(1000, 'Recovery session cancelled');
        this.clients.delete(participantId);
      }
    }
  }

  /**
   * Cancel a session: broadcast cancellation to all connected participants and close their connections.
   */
  public cancelSession(sessionId: string): void {
    this.broadcastToSession(sessionId, {
      type: 'keygen_cancelled',
      reason: 'Session cancelled by admin',
    });

    for (const [participantId, client] of this.clients.entries()) {
      if (client.sessionId === sessionId) {
        client.close(1000, 'Session cancelled');
        this.clients.delete(participantId);
      }
    }
  }

  private broadcastToSession(sessionId: string, message: any, excludeParticipantId?: string) {
    for (const [participantId, client] of this.clients.entries()) {
      if (client.sessionId === sessionId && participantId !== excludeParticipantId) {
        this.sendToClient(client, message);
      }
    }
  }

  private sendToClient(client: WebSocketClient, message: any) {
    if (client.readyState === WebSocket.OPEN) {
      client.send(JSON.stringify(message));
    }
  }

  private startHeartbeat() {
    setInterval(() => {
      for (const [participantId, client] of this.clients.entries()) {
        if (!client.isAlive) {
          console.log(`��� Heartbeat timeout: ${participantId.slice(0, 8)}`);
          client.terminate();
          this.clients.delete(participantId);
          return;
        }

        client.isAlive = false;
        client.ping();
      }
    }, 30000);
  }
}
