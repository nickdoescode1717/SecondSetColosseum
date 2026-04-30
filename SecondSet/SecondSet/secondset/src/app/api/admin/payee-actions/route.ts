import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { prisma } from '@/lib/db';
import { NextResponse } from 'next/server';

export async function POST(request: Request) {
  const session = await getServerSession(authOptions);
  
  if (!session) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const user = session.user as any;

  // Check if user is an admin
  if (!user.roles?.includes('ADMIN')) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  try {
    const body = await request.json();
    const { payeeId, actionType, proposedChanges } = body;

    // Validate
    if (!payeeId || !actionType) {
      return NextResponse.json({ error: 'Missing required fields' }, { status: 400 });
    }

    if (!['EDIT', 'DELETE'].includes(actionType)) {
      return NextResponse.json({ error: 'Invalid action type' }, { status: 400 });
    }

    // Check if payee exists
    const payee = await prisma.payee.findUnique({
      where: { id: payeeId },
    });

    if (!payee || payee.orgId !== user.orgId) {
      return NextResponse.json({ error: 'Payee not found' }, { status: 404 });
    }

    // Create the action request
    const action = await prisma.payeeAction.create({
      data: {
        orgId: user.orgId,
        payeeId,
        actionType,
        requestedBy: user.id,
        proposedChanges: actionType === 'EDIT' ? proposedChanges : null,
      },
    });

    // Create audit event
    await prisma.auditEvent.create({
      data: {
        orgId: user.orgId,
        eventType: actionType === 'EDIT' ? 'PAYEE_EDIT_REQUESTED' : 'PAYEE_DELETE_REQUESTED',
        userId: user.id,
        metadata: {
          payeeId,
          payeeName: payee.name,
          actionType,
          proposedChanges: actionType === 'EDIT' ? proposedChanges : null,
        },
        eventHash: '', // Will be set by trigger
      },
    });

    return NextResponse.json({ action });
  } catch (error) {
    console.error('Error creating payee action:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
