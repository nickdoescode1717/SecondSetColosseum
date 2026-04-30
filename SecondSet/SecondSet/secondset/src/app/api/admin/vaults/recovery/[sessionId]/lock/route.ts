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

    if (session.status !== 'OPEN') {
      return NextResponse.json(
        { error: `Cannot lock session in status: ${session.status}` },
        { status: 409 }
      );
    }

    const coordinator = new CoordinatorClient();
    const lockResult = await coordinator.lockRecoverySession(
      session.coordinatorSessionId,
      user.id
    );

    // Update local session
    await prisma.recoverySession.update({
      where: { id: session.id },
      data: {
        status: 'LOCKED',
        computedM: lockResult.computed_m,
        computedOldN: lockResult.computed_old_n,
        computedNewN: lockResult.computed_new_n,
        lockedAt: new Date(),
      },
    });

    await createAuditEvent({
      orgId: user.orgId,
      userId: user.id,
      eventType: 'RECOVERY_LOCKED',
      metadata: {
        recoverySessionId: session.id,
        computedM: lockResult.computed_m,
        computedOldN: lockResult.computed_old_n,
        computedNewN: lockResult.computed_new_n,
      },
    });

    return NextResponse.json({
      sessionId: session.id,
      status: 'LOCKED',
      computedM: lockResult.computed_m,
      computedOldN: lockResult.computed_old_n,
      computedNewN: lockResult.computed_new_n,
    });
  } catch (error: any) {
    console.error('Recovery lock error:', error);
    return NextResponse.json(
      { error: error.message || 'Internal server error' },
      { status: 500 }
    );
  }
}
