import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { prisma } from '@/lib/db';
import { NextResponse } from 'next/server';

export async function GET() {
  const session = await getServerSession(authOptions);
  
  if (!session) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const user = session.user as any;

  const payees = await prisma.payee.findMany({
    where: { orgId: user.orgId },
    include: {
      creator: {
        select: { name: true, email: true },
      },
      approver: {
        select: { name: true, email: true },
      },
    },
    orderBy: { createdAt: 'desc' },
  });

  const canCreate = user.roles?.includes('INITIATOR') || user.roles?.includes('ADMIN');
  const isApprover = user.roles?.includes('APPROVER');

  return NextResponse.json({
    payees,
    canCreate,
    isApprover,
    userId: user.id,
  });
}

export async function POST(request: Request) {
  const session = await getServerSession(authOptions);
  
  if (!session) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const user = session.user as any;

  // Check if user can create payees
  if (!user.roles?.includes('INITIATOR') && !user.roles?.includes('ADMIN')) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  try {
    const body = await request.json();
    const { chain, address, name, contactEmail, notes } = body;

    // Validate required fields
    if (!chain || !address || !name) {
      return NextResponse.json({ error: 'Missing required fields' }, { status: 400 });
    }

    // Check if payee already exists
    const existingPayee = await prisma.payee.findUnique({
      where: {
        orgId_chain_address: {
          orgId: user.orgId,
          chain: chain,
          address: address,
        },
      },
    });

    if (existingPayee) {
      return NextResponse.json({ error: 'Payee with this address already exists' }, { status: 400 });
    }

    // Create payee with PENDING status
    const payee = await prisma.payee.create({
      data: {
        orgId: user.orgId,
        chain,
        address,
        name,
        contactEmail: contactEmail || null,
        notes: notes || null,
        status: 'PENDING',
        createdBy: user.id,
      },
    });

    // Create audit event
    await prisma.auditEvent.create({
      data: {
        orgId: user.orgId,
        eventType: 'PAYEE_CREATED',
        userId: user.id,
        metadata: {
          payeeId: payee.id,
          payeeName: payee.name,
          chain: payee.chain,
          address: payee.address,
        },
        eventHash: '',
      },
    });

    return NextResponse.json({ payee });
  } catch (error) {
    console.error('Error creating payee:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
