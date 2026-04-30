import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { prisma } from '@/lib/db';
import { NextResponse } from 'next/server';

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const session = await getServerSession(authOptions);
  
  if (!session) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const user = session.user as any;

  // Check if user is an approver
  if (!user.roles?.includes('APPROVER')) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  try {
    const action = await prisma.payeeAction.findUnique({
      where: { id },
      include: { payee: true },
    });

    if (!action || action.orgId !== user.orgId) {
      return NextResponse.json({ error: 'Action not found' }, { status: 404 });
    }

    // Cannot approve own request
    if (action.requestedBy === user.id) {
      return NextResponse.json({ error: 'Cannot approve your own request' }, { status: 403 });
    }

    if (action.status !== 'PENDING') {
      return NextResponse.json({ error: 'Action already processed' }, { status: 400 });
    }

    // Execute the action
    if (action.actionType === 'EDIT') {
      // Update payee
      await prisma.payee.update({
        where: { id: action.payeeId },
        data: action.proposedChanges as any,
      });
    } else if (action.actionType === 'DELETE') {
      // Soft delete: mark as rejected instead of hard delete
      // This prevents foreign key constraint violations
      await prisma.payee.update({
        where: { id: action.payeeId },
        data: {
          status: 'REJECTED',
          rejectedAt: new Date(),
        },
      });
    }

    // Update action status
    await prisma.payeeAction.update({
      where: { id },
      data: {
        status: 'APPROVED',
        approvedBy: user.id,
        approvedAt: new Date(),
      },
    });

    // Create audit event
    await prisma.auditEvent.create({
      data: {
        orgId: user.orgId,
        eventType: 'PAYEE_ACTION_APPROVED',
        userId: user.id,
        metadata: {
          payeeId: action.payeeId,
          payeeName: action.payee.name,
          actionType: action.actionType,
          proposedChanges: action.proposedChanges,
        },
        eventHash: '',
      },
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Error approving payee action:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
