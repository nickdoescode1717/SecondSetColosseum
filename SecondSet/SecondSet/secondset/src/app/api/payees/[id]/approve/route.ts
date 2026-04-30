import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { prisma } from '@/lib/db';
import { NextResponse } from 'next/server';
import { createAuditEvent } from '@/lib/audit';

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await getServerSession(authOptions);
  
  if (!session) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const user = session.user as any;
  const { id } = await params;

  // Check if user is an approver
  if (!user.roles?.includes('APPROVER')) {
    return NextResponse.json(
      { error: 'Only approvers can approve payees' },
      { status: 403 }
    );
  }

  const payee = await prisma.payee.findUnique({
    where: { id },
  });

  if (!payee || payee.orgId !== user.orgId) {
    return NextResponse.json({ error: 'Payee not found' }, { status: 404 });
  }

  if (payee.status !== 'PENDING') {
    return NextResponse.json(
      { error: 'Payee is not pending approval' },
      { status: 400 }
    );
  }

  // Prevent self-approval
  if (payee.createdBy === user.id) {
    return NextResponse.json(
      { error: 'You cannot approve your own payee' },
      { status: 403 }
    );
  }

  // Approve the payee
  const updatedPayee = await prisma.payee.update({
    where: { id },
    data: {
      status: 'APPROVED',
      approvedBy: user.id,
      approvedAt: new Date(),
    },
  });

  // Create audit event
  await createAuditEvent({
    orgId: user.orgId,
    userId: user.id,
    eventType: 'PAYEE_APPROVED',
    metadata: {
      payeeId: payee.id,
      payeeName: payee.name,
    },
  });

  return NextResponse.json({ payee: updatedPayee });
}