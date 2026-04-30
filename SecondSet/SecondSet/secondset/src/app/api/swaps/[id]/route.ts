import { requireAuth } from '@/lib/rbac';
import { prisma } from '@/lib/db';
import { NextResponse } from 'next/server';

export async function GET(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const user = await requireAuth();
    const { id } = await params;

    const swapRequest = await prisma.swapRequest.findFirst({
      where: { id, orgId: user.orgId },
      include: {
        vault: true,
        creator: { select: { name: true, email: true, id: true } },
        submitter: { select: { name: true, email: true, id: true } },
        approver: { select: { name: true, email: true, id: true } },
        releaser: { select: { name: true, email: true, id: true } },
        signingSession: true,
      },
    });

    if (!swapRequest) {
      return NextResponse.json({ error: 'Swap request not found' }, { status: 404 });
    }

    return NextResponse.json(swapRequest);
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 400 });
  }
}
