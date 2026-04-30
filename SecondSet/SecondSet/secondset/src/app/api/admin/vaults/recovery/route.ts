import { NextRequest, NextResponse } from 'next/server';
import { requireRoles } from '@/lib/rbac';
import { prisma } from '@/lib/db';
import { CoordinatorClient } from '@/lib/coordinator';
import { createAuditEvent } from '@/lib/audit';

const VAULT_RECOVERY_ENABLED = process.env.VAULT_RECOVERY_ENABLED !== 'false';

export async function POST(req: NextRequest) {
  try {
    if (!VAULT_RECOVERY_ENABLED) {
      return NextResponse.json({ error: 'Vault recovery is not enabled' }, { status: 403 });
    }

    const user = await requireRoles(['ADMIN']);
    const body = await req.json();
    const { vaultId, reason } = body;

    if (!vaultId) {
      return NextResponse.json({ error: 'vaultId is required' }, { status: 400 });
    }

    if (!reason || reason.trim().length < 5) {
      return NextResponse.json(
        { error: 'A reason for recovery is required (minimum 5 characters)' },
        { status: 400 }
      );
    }

    // Fetch vault
    const vault = await prisma.vault.findFirst({
      where: { id: vaultId, orgId: user.orgId },
    });

    if (!vault) {
      return NextResponse.json({ error: 'Vault not found' }, { status: 404 });
    }

    // Check for existing active recovery session for this vault
    const existingSession = await prisma.recoverySession.findFirst({
      where: {
        vaultId,
        status: { in: ['PENDING', 'OPEN', 'LOCKED', 'IN_PROGRESS', 'VERIFYING'] },
      },
    });

    if (existingSession) {
      return NextResponse.json(
        { error: 'An active recovery session already exists for this vault' },
        { status: 409 }
      );
    }

    const clientIp = req.headers.get('x-forwarded-for')?.split(',')[0] ||
                     req.headers.get('x-real-ip') ||
                     '127.0.0.1';

    const coordinator = new CoordinatorClient();

    const coordinatorResponse = await coordinator.createRecoverySession({
      orgId: user.orgId,
      vaultId: vault.id,
      walletAddress: vault.address,
      chain: vault.chain,
      adminUserId: user.id,
      initiatedByIp: clientIp,
      reason,
    });

    // Store session
    const session = await prisma.recoverySession.create({
      data: {
        orgId: user.orgId,
        vaultId: vault.id,
        coordinatorSessionId: coordinatorResponse.session_id,
        qrCodeData: coordinatorResponse.qr_code_data,
        status: 'OPEN',
        chain: vault.chain,
        reason,
        thresholdPolicy: { formula: 'ceil_2n_3', min_threshold: 2, allow_m_one: false },
        initiatedBy: user.id,
      },
    });

    await createAuditEvent({
      orgId: user.orgId,
      userId: user.id,
      eventType: 'RECOVERY_INITIATED',
      metadata: {
        recoverySessionId: session.id,
        vaultId: vault.id,
        walletAddress: vault.address,
        chain: vault.chain,
        reason,
      },
    });

    return NextResponse.json({
      sessionId: session.id,
      coordinatorSessionId: coordinatorResponse.session_id,
      qrCodeData: session.qrCodeData,
      status: session.status,
    });
  } catch (error: any) {
    console.error('Recovery initiation error:', error);
    return NextResponse.json(
      { error: error.message || 'Internal server error' },
      { status: 500 }
    );
  }
}
