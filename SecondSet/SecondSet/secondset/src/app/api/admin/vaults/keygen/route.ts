import { NextRequest, NextResponse } from 'next/server';
import { requireRoles } from '@/lib/rbac';
import { prisma } from '@/lib/db';
import { CoordinatorClient } from '@/lib/coordinator';
import { createAuditEvent } from '@/lib/audit';

export async function POST(req: NextRequest) {
  try {
    const user = await requireRoles(['ADMIN']);
    const body = await req.json();
    const { chain, chainName, name } = body;

    // Validate
    if (!chain || !chainName) {
      return NextResponse.json(
        { error: 'chain and chainName required' },
        { status: 400 }
      );
    }

    // Validate chain type
    if (chain !== 'EVM' && chain !== 'SOLANA') {
      return NextResponse.json(
        { error: 'chain must be EVM or SOLANA' },
        { status: 400 }
      );
    }

    // Check for existing pending session
    const existingSession = await prisma.keygenSession.findFirst({
      where: {
        orgId: user.orgId,
        status: 'PENDING',
        expiresAt: { gt: new Date() },
      },
    });

    if (existingSession) {
      return NextResponse.json(
        { error: 'Pending keygen session already exists. Please wait for it to complete or expire.' },
        { status: 400 }
      );
    }

    // Call Coordinator
    const coordinator = new CoordinatorClient();

    // Get client IP address
    const clientIp = req.headers.get('x-forwarded-for')?.split(',')[0] ||
                     req.headers.get('x-real-ip') ||
                     '127.0.0.1';

    console.log('🔑 Initiating keygen session:', {
      orgId: user.orgId,
      chain,
      chainName,
      adminUserId: user.id,
      clientIp,
    });

    const coordinatorResponse = await coordinator.createKeygenSession({
      orgId: user.orgId,
      adminUserId: user.id,
      initiatedByIp: clientIp,
      chain,
    });

    console.log('✅ Coordinator keygen session created:', coordinatorResponse.session_id);

    // Store session
    const session = await prisma.keygenSession.create({
      data: {
        orgId: user.orgId,
        coordinatorSessionId: coordinatorResponse.session_id,
        qrCodeData: coordinatorResponse.qr_code_data,
        status: 'PENDING',
        chain,
        chainName,
        initiatedBy: user.id,
        expiresAt: new Date(coordinatorResponse.expiry),
      },
    });

    // Audit
    await createAuditEvent({
      orgId: user.orgId,
      userId: user.id,
      eventType: 'KEYGEN_INITIATED',
      metadata: {
        sessionId: session.id,
        chain,
        chainName,
      },
    });

    return NextResponse.json({
      sessionId: session.id,
      qrCodeData: session.qrCodeData,
      expiresAt: session.expiresAt.toISOString(),
      status: session.status,
    });
  } catch (error: any) {
    console.error('❌ Keygen initiation error:', error);
    return NextResponse.json(
      { error: error.message || 'Internal server error' },
      { status: 500 }
    );
  }
}
