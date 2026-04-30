import { requireAuth } from '@/lib/rbac';
import { prisma } from '@/lib/db';
import { NextResponse } from 'next/server';
import { createAuditEvent } from '@/lib/audit';

export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const user = await requireAuth();
    const { id } = await params;

    const swapRequest = await prisma.swapRequest.findFirst({
      where: { id, orgId: user.orgId },
    });

    if (!swapRequest) {
      return NextResponse.json({ error: 'Swap request not found' }, { status: 404 });
    }

    // Only creator can submit
    if (swapRequest.createdBy !== user.id) {
      return NextResponse.json(
        { error: 'Only the creator can submit this swap request' },
        { status: 403 }
      );
    }

    if (swapRequest.status !== 'DRAFT') {
      return NextResponse.json(
        { error: `Cannot submit swap in ${swapRequest.status} status` },
        { status: 400 }
      );
    }

    const updated = await prisma.swapRequest.update({
      where: { id },
      data: {
        status: 'REQUESTED',
        submittedBy: user.id,
        submittedAt: new Date(),
      },
      include: {
        vault: true,
        creator: { select: { name: true, email: true, id: true } },
      },
    });

    await createAuditEvent({
      orgId: user.orgId,
      userId: user.id,
      eventType: 'SWAP_REQUESTED',
      swapRequestId: id,
    });

    return NextResponse.json(updated);
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 400 });
  }
}
