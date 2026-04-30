import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { prisma } from '@/lib/db';

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await getServerSession(authOptions);
    
    if (!session?.user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const user = session.user as any;
    const { id: requestId } = await params;

    // Fetch the request
    const request = await prisma.paymentRequest.findUnique({
      where: { id: requestId },
    });

    if (!request) {
      return NextResponse.json({ error: 'Request not found' }, { status: 404 });
    }

    // Verify request belongs to user's org
    if (request.orgId !== user.orgId) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    // Verify user is the creator
    if (request.createdBy !== user.id) {
      return NextResponse.json(
        { error: 'Only the creator can submit this request' },
        { status: 403 }
      );
    }

    // Verify status is DRAFT
    if (request.status !== 'DRAFT') {
      return NextResponse.json(
        { error: `Cannot submit request with status ${request.status}` },
        { status: 400 }
      );
    }

    // Update to SUBMITTED
    const updated = await prisma.paymentRequest.update({
      where: { id: requestId },
      data: {
        status: 'SUBMITTED',
        submittedBy: user.id,
        submittedAt: new Date(),
      },
      include: {
        payee: true,
        vault: true,
        creator: { select: { name: true } },
      },
    });

    return NextResponse.json({ request: updated });
  } catch (error) {
    console.error('Error submitting request:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}