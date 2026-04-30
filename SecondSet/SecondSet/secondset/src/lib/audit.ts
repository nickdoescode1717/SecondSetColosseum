import { prisma } from './db';
import { createHash } from 'crypto';

export type AuditEventType =
  | 'REQUEST_CREATED'
  | 'REQUEST_SUBMITTED'
  | 'REQUEST_APPROVED'
  | 'REQUEST_REJECTED'
  | 'REQUEST_RELEASED'
  | 'REQUEST_BROADCASTED'
  | 'REQUEST_CONFIRMED'
  | 'REQUEST_FAILED'
  | 'PAYEE_CREATED'
  | 'PAYEE_APPROVED'
  | 'PAYEE_REJECTED'
  | 'PAYEE_UPDATED'
  | 'PAYEE_EDIT_REQUESTED'
  | 'PAYEE_DELETE_REQUESTED'
  | 'PAYEE_ACTION_APPROVED'
  | 'PAYEE_ACTION_REJECTED'
  | 'USER_CREATED'
  | 'USER_ROLES_UPDATED'
  | 'USER_ROLE_ASSIGNED'
  | 'USER_ROLE_REVOKED'
  | 'VAULT_CREATED'
  | 'KEYGEN_INITIATED'
  | 'KEYGEN_COMPLETED'
  | 'KEYGEN_FAILED'
  | 'KEYGEN_CANCELLED'
  | 'SIGNING_INITIATED'
  | 'SIGNING_COMPLETED'
  | 'SIGNING_FAILED'
  | 'SWAP_CREATED'
  | 'SWAP_REQUESTED'
  | 'SWAP_APPROVED'
  | 'SWAP_RELEASED'
  | 'SWAP_CONFIRMED'
  | 'SWAP_FAILED'
  | 'SWAP_CANCELLED'
  | 'ORG_CREATED'
  | 'INVITE_CREATED'
  | 'INVITE_ACCEPTED'
  | 'INVITE_REVOKED'
  | 'PAYMENT_RECEIVED';

interface CreateAuditEventParams {
  orgId: string;
  userId: string;
  eventType: AuditEventType;
  requestId?: string;
  swapRequestId?: string;
  metadata?: Record<string, any>;
}

/**
 * Create an audit log entry
 */
export async function createAuditEvent(params: CreateAuditEventParams) {
  const { orgId, userId, eventType, requestId, swapRequestId, metadata } = params;

  console.log('🔍 Creating audit event:', {
    orgId,
    userId,
    eventType,
    requestId,
    hasMetadata: !!metadata,
  });

  try {
    // Get the previous event's hash for chain verification
    const previousEvent = await prisma.auditEvent.findFirst({
      where: { orgId },
      orderBy: { createdAt: 'desc' },
      select: { eventHash: true },
    });

    const previousHash = previousEvent?.eventHash || null;

    // Build the event data
    const eventData = {
      orgId,
      userId,
      eventType,
      requestId: requestId || null,
      swapRequestId: swapRequestId || null,
      metadata: metadata || {},
      createdAt: new Date(),
      previousHash,
    };

    // Compute event hash (hash of all fields)
    const hashInput = JSON.stringify({
      orgId: eventData.orgId,
      userId: eventData.userId,
      eventType: eventData.eventType,
      requestId: eventData.requestId,
      metadata: eventData.metadata,
      previousHash: eventData.previousHash,
      timestamp: eventData.createdAt.toISOString(),
    });

    const eventHash = createHash('sha256').update(hashInput).digest('hex');

    // Add eventHash to data
    const data: any = {
      ...eventData,
      eventHash,
    };

    console.log('📝 About to create with data:', JSON.stringify(data, null, 2));

    const result = await prisma.auditEvent.create({
      data,
    });
    
    console.log(`✅ Audit event created successfully! ID: ${result.id}`);
  } catch (error) {
    console.error('❌ Failed to create audit event:', error);
    console.error('Error details:', JSON.stringify(error, null, 2));
    // Don't throw - audit logging should not break the main flow
  }
}