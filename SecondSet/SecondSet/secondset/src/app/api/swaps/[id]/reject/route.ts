import { requireRoles } from '@/lib/rbac';
import { prisma } from '@/lib/db';
import { NextResponse } from 'next/server';
import { createAuditEvent } from '@/lib/audit';

export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const user = await requireRoles(['APPROVER', 'SIGNER', 'ADMIN']);
    const { id } = await params;
    const body = await req.json().catch(() => ({}));

    const swapRequest = await prisma.swapRequest.findFirst({
      where: { id, orgId: user.orgId },
    });

    if (!swapRequest) {
      return NextResponse.json({ error: 'Swap request not found' }, { status: 404 });
    }

    if (!['REQUESTED', 'APPROVED'].includes(swapRequest.status)) {
      return NextResponse.json(
        { error: `Cannot reject swap in ${swapRequest.status} status` },
        { status: 400 }
      );
    }

    const updated = await prisma.swapRequest.update({
      where: { id },
      data: {
        status: 'CANCELLED',
        cancelledAt: new Date(),
        errorMessage: body.reason || 'Rejected',
      },
    });

    await createAuditEvent({
      orgId: user.orgId,
      userId: user.id,
      eventType: 'SWAP_CANCELLED',
      swapRequestId: id,
      metadata: { reason: body.reason || 'Rejected' },
    });

    return NextResponse.json(updated);
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 400 });
  }
}
