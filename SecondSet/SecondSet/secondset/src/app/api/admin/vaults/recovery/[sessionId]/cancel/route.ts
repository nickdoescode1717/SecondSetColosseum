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

    const session = await prisma.recoverySession.findFirst({
      where: { id: sessionId, orgId: user.orgId },
    });

    if (!session) {
      return NextResponse.json({ error: 'Recovery session not found' }, { status: 404 });
    }

    // Only allow cancellation of active sessions
    const terminalStatuses = ['COMPLETED', 'FAILED', 'CANCELLED', 'EXPIRED'];
    if (terminalStatuses.includes(session.status)) {
      return NextResponse.json(
        { error: `Session already ${session.status}` },
        { status: 409 }
      );
    }

    // Update local DB
    await prisma.recoverySession.update({
      where: { id: session.id },
      data: {
        status: 'CANCELLED',
        completedAt: new Date(),
      },
    });

    // Best-effort cancel on coordinator
    try {
      const coordinator = new CoordinatorClient();
      await coordinator.cancelRecoverySession(session.coordinatorSessionId);
    } catch (err) {
      console.error('Failed to cancel recovery on coordinator (best-effort):', err);
    }

    await createAuditEvent({
      orgId: user.orgId,
      userId: user.id,
      eventType: 'RECOVERY_CANCELLED',
      metadata: {
        recoverySessionId: session.id,
        cancelledAt: new Date().toISOString(),
      },
    });

    return NextResponse.json({ status: 'CANCELLED', sessionId: session.id });
  } catch (error: any) {
    console.error('Recovery cancel error:', error);
    return NextResponse.json(
      { error: error.message || 'Internal server error' },
      { status: 500 }
    );
  }
}
