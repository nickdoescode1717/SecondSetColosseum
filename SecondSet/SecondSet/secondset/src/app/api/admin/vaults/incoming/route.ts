import { NextRequest, NextResponse } from 'next/server';
import { requireAuth } from '@/lib/rbac';
import { prisma } from '@/lib/db';

export async function GET(req: NextRequest) {
  try {
    const user = await requireAuth();
    const { searchParams } = new URL(req.url);

    const limit = Math.min(parseInt(searchParams.get('limit') ?? '20', 10), 100);
    const offset = parseInt(searchParams.get('offset') ?? '0', 10);
    const vaultId = searchParams.get('vaultId') ?? undefined;

    const where = {
      orgId: user.orgId,
      ...(vaultId ? { vaultId } : {}),
    };

    const [transactions, total] = await Promise.all([
      prisma.incomingTransaction.findMany({
        where,
        orderBy: { detectedAt: 'desc' },
        take: limit,
        skip: offset,
        include: {
          vault: {
            select: { id: true, name: true, address: true, chainName: true },
          },
        },
      }),
      prisma.incomingTransaction.count({ where }),
    ]);

    return NextResponse.json({ transactions, total, limit, offset });
  } catch (error) {
    const msg = error instanceof Error ? error.message : 'Unknown error';
    return NextResponse.json({ error: msg }, { status: 401 });
  }
}
