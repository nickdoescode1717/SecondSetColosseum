import { requireRoles } from '@/lib/rbac';
import { prisma } from '@/lib/db';
import { NextResponse } from 'next/server';
import { createAuditEvent } from '@/lib/audit';

export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const user = await requireRoles(['APPROVER', 'ADMIN']);
    const { id } = await params;

    const swapRequest = await prisma.swapRequest.findFirst({
      where: { id, orgId: user.orgId },
    });

    if (!swapRequest) {
      return NextResponse.json({ error: 'Swap request not found' }, { status: 404 });
    }

    if (swapRequest.status !== 'REQUESTED') {
      return NextResponse.json(
        { error: `Cannot approve swap in ${swapRequest.status} status` },
        { status: 400 }
      );
    }

    // Self-approval check: creator cannot approve their own swap
    if (swapRequest.createdBy === user.id) {
      return NextResponse.json(
        { error: 'Cannot approve your own swap request' },
        { status: 403 }
      );
    }

    // Approve intent — NO tx is built here (quotes expire)
    const updated = await prisma.swapRequest.update({
      where: { id },
      data: {
        status: 'APPROVED',
        approvedBy: user.id,
        approvedAt: new Date(),
      },
      include: {
        vault: true,
        creator: { select: { name: true, email: true, id: true } },
        approver: { select: { name: true, email: true, id: true } },
      },
    });

    await createAuditEvent({
      orgId: user.orgId,
      userId: user.id,
      eventType: 'SWAP_APPROVED',
      swapRequestId: id,
      metadata: {
        fromToken: swapRequest.fromToken,
        toToken: swapRequest.toToken,
        fromAmount: swapRequest.fromAmount,
      },
    });

    return NextResponse.json(updated);
  } catch (error: any) {
    const status = error.message?.includes('Forbidden') ? 403 : 400;
    return NextResponse.json({ error: error.message }, { status });
  }
}
