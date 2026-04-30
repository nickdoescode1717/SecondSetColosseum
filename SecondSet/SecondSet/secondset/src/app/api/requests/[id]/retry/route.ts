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

    // Check SIGNER or ADMIN role
    const canRetry = user.roles?.includes('SIGNER') || user.roles?.includes('ADMIN');
    if (!canRetry) {
      return NextResponse.json(
        { error: 'Forbidden: requires SIGNER or ADMIN role' },
        { status: 403 }
      );
    }

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

    // Only allow retry for FAILED_BROADCAST
    if (request.status !== 'FAILED_BROADCAST') {
      return NextResponse.json(
        { error: `Cannot retry request with status ${request.status}` },
        { status: 400 }
      );
    }

    // Reset back to READY_TO_RELEASE
    const updated = await prisma.paymentRequest.update({
      where: { id: requestId },
      data: {
        status: 'READY_TO_RELEASE',
        errorMessage: null, // Clear error
      },
      include: {
        payee: true,
        vault: true,
        creator: { select: { name: true } },
        approver: { select: { name: true } },
      },
    });

    return NextResponse.json({ 
      request: updated,
      message: 'Request reset to READY_TO_RELEASE. You can try releasing again.',
    });
  } catch (error) {
    console.error('Error retrying request:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}