// coordinator/src/server.ts

import 'dotenv/config';
import express, { Request, Response, NextFunction } from 'express';
import { Server as HTTPServer } from 'http';
import { WebSocketServer } from 'ws';
import cors from 'cors';
import helmet from 'helmet';
import { v4 as uuidv4 } from 'uuid';
import jwt from 'jsonwebtoken';
import {
  CreateKeygenSessionRequest,
  CreateKeygenSessionResponse,
  JoinKeygenSessionRequest,
  JoinKeygenSessionResponse,
  SignerRole,
  ChainType,
  curveForChain,
} from './types';
import { DatabaseService } from './services/DatabaseService';
import { WebSocketManager } from './services/WebSocketManager';
import signingRoutes from './routes/signing.routes';
import recoveryRoutes from './routes/recovery.routes';
import pushRoutes from './routes/push.routes';
import { requireApiKey, rateLimit } from './middleware/auth';

const app = express();
const PORT = process.env.PORT || 3000;
const JWT_SECRET = process.env.JWT_SECRET || 'change-me-in-production';

// Middleware
app.use(helmet());
app.use(cors());
app.use(express.json());

// ============================================================================
// HEALTH CHECK
// ============================================================================

app.get('/health', async (req: Request, res: Response) => {
  const dbHealthy = await DatabaseService.healthCheck();
  res.json({ 
    status: dbHealthy ? 'ok' : 'degraded',
    database: dbHealthy ? 'connected' : 'disconnected',
    timestamp: new Date().toISOString() 
  });
});

// ============================================================================
// KEYGEN ENDPOINTS
// ============================================================================

app.post(
  '/api/v1/keygen/sessions',
  requireApiKey,
  rateLimit(50, 60000), // Max 50 requests per minute
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const request: CreateKeygenSessionRequest = req.body;

      // Determine chain and curve type
      const chain: ChainType = request.chain || 'EVM';
      const curve_type = curveForChain(chain);
      const vault_id = request.vault_id;

      // Generate session data
      const session_id = uuidv4();
      const join_token = generateSecureToken();
      const short_code = generateShortCode();
      const expiry = new Date(Date.now() + 10 * 60 * 1000); // 10 minutes

      // Save to database
      await DatabaseService.createKeygenSession({
        session_id,
        org_id: request.org_id,
        admin_user_id: request.admin_user_id,
        status: 'waiting_for_participants',
        join_token,
        short_code,
        expires_at: expiry,
        chain,
        curve_type,
        vault_id,
      });

      // Log audit event
      await DatabaseService.logAuditEvent({
        org_id: request.org_id,
        event_type: 'keygen_session_created',
        session_id,
        user_id: request.admin_user_id,
        ip_address: request.initiated_by_ip,
        details: { role_assignments: request.role_assignments, chain, curve_type },
      });

      const qr_code_data = JSON.stringify({
        session_id,
        org_id: request.org_id,
        join_token,
        expiry: expiry.toISOString(),
        chain,
        curve_type,
        vault_id,
      });

      const response: CreateKeygenSessionResponse = {
        session_id,
        join_token,
        qr_code_data,
        short_code,
        expiry: expiry.toISOString(),
        status: 'waiting_for_participants',
      };

      console.log('✅ Created keygen session:', session_id, `(${chain}/${curve_type})`);
      res.status(201).json(response);
    } catch (error) {
      next(error);
    }
  }
);

app.post(
  '/api/v1/keygen/sessions/:session_id/join',
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { session_id } = req.params;
      const request: JoinKeygenSessionRequest = req.body;

      // Verify session exists and is not expired
      const session = await DatabaseService.getKeygenSession(session_id);
      if (!session) {
        return res.status(404).json({ error: 'Session not found' });
      }

      if (new Date() > new Date(session.expires_at)) {
        return res.status(410).json({ error: 'Session expired' });
      }

      if (session.status !== 'waiting_for_participants') {
        return res.status(409).json({ error: 'Session already in progress or complete' });
      }

      // Check how many participants already joined
      const participantCount = await DatabaseService.getParticipantCount(session_id);
      if (participantCount >= 3) {
        return res.status(409).json({ error: 'Session already has 3 participants' });
      }

      // NEW: Check if this role already joined
      const existingParticipants = await DatabaseService.getParticipants(session_id);
      const roleAlreadyJoined = existingParticipants.some(p => p.role === request.role);
      
      if (roleAlreadyJoined) {
        return res.status(409).json({ 
          error: `Role '${request.role}' has already joined this session`,
          details: 'Each role (cfo, controller, backup) can only join once per ceremony'
        });
      }

      // Generate participant data
      const participant_id = uuidv4();
      const signer_index = (participantCount + 1) as 1 | 2 | 3;

      // Add participant to database
      await DatabaseService.addParticipant({
        participant_id,
        session_id,
        device_id: request.device_id,
        role: request.role,
        signer_index,
        device_public_key: request.device_public_key,
        device_os: request.device_info.os,
        device_os_version: request.device_info.os_version,
        app_version: request.device_info.app_version,
      });

      // Log audit event
      await DatabaseService.logAuditEvent({
        org_id: session.org_id,
        event_type: 'participant_joined',
        session_id,
        device_id: request.device_id,
        details: { role: request.role, signer_index },
      });

      // Generate WS token (includes org_id for audit context)
      const ws_token = jwt.sign(
        {
          sub: participant_id,
          session_id,
          role: request.role,
          org_id: session.org_id,
          jti: uuidv4(),
        },
        JWT_SECRET,
        { expiresIn: '15m' }
      );

      const response: JoinKeygenSessionResponse = {
        participant_id,
        signer_index,
        ws_url: `ws://${req.headers.host}/ws`,
        ws_token,
        org_name: 'Test Organization', // TODO: Get from org service
        session_expiry: session.expires_at.toISOString(),
      };

      console.log('✅ Participant joined:', participant_id, request.role, `(${participantCount + 1}/3)`);
      res.status(200).json(response);
    } catch (error) {
      next(error);
    }
  }
);

app.get(
  '/api/v1/keygen/sessions/:session_id/status',
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { session_id } = req.params;

      const session = await DatabaseService.getKeygenSession(session_id);
      if (!session) {
        return res.status(404).json({ error: 'Session not found' });
      }

      const participants = await DatabaseService.getParticipants(session_id);

      const status = {
        session_id: session.session_id,
        org_id: session.org_id,
        status: session.status,
        participants: participants.map(p => ({
          role: p.role,
          joined_at: p.joined_at,
          status: p.connection_status || 'disconnected',
        })),
        current_round: null,
        result: session.wallet_address ? {
          wallet_address: session.wallet_address,
          public_key: session.public_key,
          created_at: session.completed_at,
        } : undefined,
        error: session.error_code ? {
          code: session.error_code,
          message: session.error_message,
        } : undefined,
      };

      res.status(200).json(status);
    } catch (error) {
      next(error);
    }
  }
);

// ============================================================================
// KEYGEN CANCEL ENDPOINT
// ============================================================================

app.post(
  '/api/v1/keygen/sessions/:session_id/cancel',
  requireApiKey,
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { session_id } = req.params;

      const session = await DatabaseService.getKeygenSession(session_id);
      if (!session) {
        return res.status(404).json({ error: 'Session not found' });
      }

      // Only allow cancellation of active sessions
      if (['complete', 'failed', 'cancelled'].includes(session.status)) {
        return res.status(409).json({
          error: `Session already ${session.status}`,
        });
      }

      // Update status in database
      await DatabaseService.updateSessionStatus(session_id, 'cancelled', {
        error_code: 'admin_cancelled',
        error_message: 'Session cancelled by admin before completion',
        completed_at: new Date(),
      });

      // Broadcast cancellation to connected mobile devices and close WS connections
      wsManager.cancelSession(session_id);

      // Log audit event
      await DatabaseService.logAuditEvent({
        org_id: session.org_id,
        event_type: 'keygen_session_cancelled',
        session_id,
        user_id: session.admin_user_id,
        details: { cancelled_at: new Date().toISOString() },
      });

      console.log('🚫 Keygen session cancelled:', session_id);
      res.status(200).json({ status: 'cancelled', session_id });
    } catch (error) {
      next(error);
    }
  }
);

// ============================================================================
// SIGNING ENDPOINTS
// ============================================================================

app.use('/api/v1/signing', signingRoutes);
app.use('/api/v1/sign', signingRoutes); // alias for mobile app compatibility

// ============================================================================
// RECOVERY ENDPOINTS
// ============================================================================

app.use('/api/v1/recovery', recoveryRoutes);

// ============================================================================
// PUSH NOTIFICATION ENDPOINTS
// ============================================================================

app.use('/api/v1/push', pushRoutes);

// ============================================================================
// ERROR HANDLING
// ============================================================================

app.use((err: Error, req: Request, res: Response, next: NextFunction) => {
  console.error('❌ Error:', err);
  res.status(500).json({
    error: 'Internal server error',
    message: process.env.NODE_ENV === 'development' ? err.message : undefined,
  });
});

// ============================================================================
// WEBSOCKET SERVER
// ============================================================================

const server = new HTTPServer(app);
const wss = new WebSocketServer({ server, path: '/ws' });

// Initialize WebSocketManager
const wsManager = new WebSocketManager(wss);

// Make wsManager accessible to route handlers via req.app.get('wsManager')
app.set('wsManager', wsManager);

// Export for use by route handlers (e.g. recovery cancel)
export { wsManager };

console.log('✅ WebSocketManager initialized');

// ============================================================================
// SERVER STARTUP
// ============================================================================

server.listen(PORT, () => {
  console.log(`✅ Coordinator server running on port ${PORT}`);
  console.log(`   Health check: http://localhost:${PORT}/health`);
  console.log(`   WebSocket: ws://localhost:${PORT}/ws`);
  console.log(`   Database: ${process.env.DATABASE_URL ? 'configured' : 'NOT configured'}`);
});

// ============================================================================
// UTILITY FUNCTIONS
// ============================================================================

function generateSecureToken(): string {
  return uuidv4().replace(/-/g, '');
}

function generateShortCode(): string {
  const words = ['WOLF', 'TIGER', 'EAGLE', 'BEAR', 'LION', 'HAWK'];
  const code = [
    words[Math.floor(Math.random() * words.length)],
    words[Math.floor(Math.random() * words.length)],
    words[Math.floor(Math.random() * words.length)],
    Math.floor(Math.random() * 100),
  ].join('-');
  return code;
}