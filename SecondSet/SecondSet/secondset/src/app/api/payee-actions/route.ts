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

  const actions = await prisma.payeeAction.findMany({
    where: {
      orgId: user.orgId,
      status: 'PENDING',
    },
    include: {
      payee: true,
      requestedByUser: {
        select: { name: true, email: true },
      },
    },
    orderBy: { createdAt: 'desc' },
  });

  return NextResponse.json({ actions });
}
