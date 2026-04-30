import { NextRequest, NextResponse } from 'next/server';
import { requireRoles } from '@/lib/rbac';
import { prisma } from '@/lib/db';
import { CoordinatorClient } from '@/lib/coordinator';
import { createAuditEvent } from '@/lib/audit';

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ sessionId: string }> }
) {
  try {
    const user = await requireRoles(['ADMIN']);
    const { sessionId } = await params;

    const session = await prisma.keygenSession.findUnique({
      where: { id: sessionId },
    });

    if (!session) {
      return NextResponse.json({ error: 'Session not found' }, { status: 404 });
    }

    if (session.orgId !== user.orgId) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    // Only cancel sessions that are still active
    if (session.status !== 'PENDING') {
      return NextResponse.json(
        { error: `Session already ${session.status.toLowerCase()}` },
        { status: 409 }
      );
    }

    // Cancel on coordinator (best-effort — still mark cancelled locally even if this fails)
    try {
      const coordinator = new CoordinatorClient();
      await coordinator.cancelKeygenSession(session.coordinatorSessionId);
    } catch (error) {
      console.warn('⚠️ Could not cancel on coordinator (may already be expired):', error);
    }

    // Update local DB
    await prisma.keygenSession.update({
      where: { id: session.id },
      data: {
        status: 'CANCELLED',
        errorMessage: 'Cancelled by admin',
        completedAt: new Date(),
      },
    });

    await createAuditEvent({
      orgId: user.orgId,
      userId: user.id,
      eventType: 'KEYGEN_CANCELLED',
      metadata: {
        sessionId: session.id,
        coordinatorSessionId: session.coordinatorSessionId,
      },
    });

    return NextResponse.json({ status: 'cancelled' });
  } catch (error: any) {
    console.error('❌ Error cancelling keygen session:', error);
    return NextResponse.json(
      { error: error.message || 'Internal server error' },
      { status: 500 }
    );
  }
}
