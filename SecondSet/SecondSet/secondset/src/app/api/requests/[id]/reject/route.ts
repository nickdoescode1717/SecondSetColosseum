import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { prisma } from '@/lib/db';
import { createAuditEvent } from '@/lib/audit';

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

    const body = await req.json();
    const { reason } = body;

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

    // Handle rejection based on status
    if (request.status === 'SUBMITTED') {
      // APPROVER rejecting
      if (!user.roles?.includes('APPROVER')) {
        return NextResponse.json(
          { error: 'Forbidden: requires APPROVER role to reject submitted requests' },
          { status: 403 }
        );
      }
    } else if (request.status === 'READY_TO_RELEASE') {
      // SIGNER rejecting
      if (!user.roles?.includes('SIGNER')) {
        return NextResponse.json(
          { error: 'Forbidden: requires SIGNER role to reject ready requests' },
          { status: 403 }
        );
      }
      
      // Check signer conflict
      if (request.createdBy === user.id || request.approvedBy === user.id) {
        return NextResponse.json(
          { error: 'Cannot reject request you created or approved' },
          { status: 403 }
        );
      }
    } else {
      return NextResponse.json(
        { error: `Cannot reject request with status ${request.status}` },
        { status: 400 }
      );
    }

    // Update to REJECTED
    const updated = await prisma.paymentRequest.update({
      where: { id: requestId },
      data: {
        status: 'REJECTED',
        errorMessage: reason || 'Rejected',
      },
      include: {
        payee: true,
        vault: true,
        creator: { select: { name: true } },
      },
    });

    // Create audit event
    await createAuditEvent({
      orgId: user.orgId,
      userId: user.id,
      eventType: 'REQUEST_REJECTED',
      requestId: updated.id,
      metadata: {
        reason: reason || 'No reason provided',
        status: request.status,
      },
    });

    return NextResponse.json({ request: updated });
  } catch (error) {
    console.error('Error rejecting request:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}