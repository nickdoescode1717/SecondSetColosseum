import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { prisma } from '@/lib/db';

// GET /api/vaults - Fetch all vaults for the org
export async function GET(req: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    
    if (!session?.user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const user = session.user as any;
    
    const vaults = await prisma.vault.findMany({
      where: { orgId: user.orgId },
      orderBy: { createdAt: 'desc' },
      select: {
        id: true,
        name: true,
        chain: true,
        chainName: true,
        address: true,
        turnkeyWalletId: true,
        createdAt: true,
      },
    });

    return NextResponse.json({ vaults });
  } catch (error) {
    console.error('Error fetching vaults:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}