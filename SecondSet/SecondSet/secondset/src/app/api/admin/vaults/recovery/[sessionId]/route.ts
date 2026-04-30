import { NextRequest, NextResponse } from 'next/server';
import { requireRoles } from '@/lib/rbac';
import { prisma } from '@/lib/db';
import { CoordinatorClient } from '@/lib/coordinator';

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ sessionId: string }> }
) {
  try {
    const user = await requireRoles(['ADMIN']);
    const { sessionId } = await params;

    const session = await prisma.recoverySession.findFirst({
      where: { id: sessionId, orgId: user.orgId },
      include: { vault: true },
    });

    if (!session) {
      return NextResponse.json({ error: 'Recovery session not found' }, { status: 404 });
    }

    // If session is in an active state, poll the coordinator for latest status
    let coordinatorStatus = null;
    if (['OPEN', 'LOCKED', 'IN_PROGRESS', 'VERIFYING'].includes(session.status)) {
      try {
        const coordinator = new CoordinatorClient();
        coordinatorStatus = await coordinator.getRecoverySessionStatus(session.coordinatorSessionId);

        // Sync terminal states from coordinator
        if (coordinatorStatus.status === 'complete' && session.status !== 'COMPLETED') {
          await prisma.recoverySession.update({
            where: { id: session.id },
            data: {
              status: 'COMPLETED',
              completedAt: new Date(),
              computedM: coordinatorStatus.computed_m,
              computedOldN: coordinatorStatus.computed_old_n,
              computedNewN: coordinatorStatus.computed_new_n,
            },
          });
          session.status = 'COMPLETED' as any;
        } else if (coordinatorStatus.status === 'failed' && session.status !== 'FAILED') {
          await prisma.recoverySession.update({
            where: { id: session.id },
            data: {
              status: 'FAILED',
              errorMessage: coordinatorStatus.error_message || coordinatorStatus.error || 'Recovery failed',
              completedAt: new Date(),
            },
          });
          session.status = 'FAILED' as any;
        } else if (coordinatorStatus.status === 'expired' && session.status !== 'EXPIRED') {
          await prisma.recoverySession.update({
            where: { id: session.id },
            data: { status: 'EXPIRED', completedAt: new Date() },
          });
          session.status = 'EXPIRED' as any;
        }
      } catch (err) {
        // Coordinator polling failure is non-fatal
        console.error('Failed to poll coordinator recovery status:', err);
      }
    }

    return NextResponse.json({
      sessionId: session.id,
      coordinatorSessionId: session.coordinatorSessionId,
      vaultId: session.vaultId,
      walletAddress: session.vault?.address,
      chain: session.chain,
      status: session.status,
      reason: session.reason,
      qrCodeData: session.qrCodeData,
      computedM: session.computedM,
      computedOldN: session.computedOldN,
      computedNewN: session.computedNewN,
      thresholdPolicy: session.thresholdPolicy,
      recoveryRecord: session.recoveryRecord,
      errorMessage: session.errorMessage,
      createdAt: session.createdAt.toISOString(),
      lockedAt: session.lockedAt?.toISOString(),
      completedAt: session.completedAt?.toISOString(),
      participants: coordinatorStatus?.participants || [],
    });
  } catch (error: any) {
    console.error('Recovery status error:', error);
    return NextResponse.json(
      { error: error.message || 'Internal server error' },
      { status: 500 }
    );
  }
}
