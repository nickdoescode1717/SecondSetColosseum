import { NextRequest, NextResponse } from 'next/server';
import { requireRoles } from '@/lib/rbac';
import { prisma } from '@/lib/db';

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ sessionId: string }> }
) {
  try {
    const user = await requireRoles(['ADMIN']);
    const { sessionId } = await params;

    const session = await prisma.keygenSession.findUnique({
      where: { id: sessionId },
      include: { vault: true },
    });

    if (!session) {
      return NextResponse.json({ error: 'Session not found' }, { status: 404 });
    }

    if (session.orgId !== user.orgId) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    return NextResponse.json({
      status: session.status,
      walletAddress: session.walletAddress,
      vaultId: session.vaultId,
      error: session.errorMessage,
      expiresAt: session.expiresAt.toISOString(),
      createdAt: session.createdAt.toISOString(),
      completedAt: session.completedAt?.toISOString(),
    });
  } catch (error: any) {
    console.error('❌ Error fetching keygen session:', error);
    return NextResponse.json(
      { error: error.message || 'Internal server error' },
      { status: 500 }
    );
  }
}
