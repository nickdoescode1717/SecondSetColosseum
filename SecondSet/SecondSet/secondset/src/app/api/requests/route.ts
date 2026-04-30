import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { prisma } from '@/lib/db';
import { NextResponse } from 'next/server';
import { resolveVaultChain } from '@/lib/chains/utils';

export async function GET() {
  const session = await getServerSession(authOptions);
  
  if (!session) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const user = session.user as any;

  try {
    const requests = await prisma.paymentRequest.findMany({
      where: {
        orgId: user.orgId,
      },
      include: {
        vault: true,
        payee: true,
        creator: {
          select: { name: true, email: true },
        },
      },
      orderBy: {
        createdAt: 'desc',
      },
    });

    const canCreate = user.roles?.includes('INITIATOR');

    return NextResponse.json({
      requests,
      canCreate,
      userId: user.id,
    });
  } catch (error) {
    console.error('Error fetching requests:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

export async function POST(request: Request) {
  const session = await getServerSession(authOptions);

  if (!session) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const user = session.user as any;

  // Check if user is an INITIATOR (ADMIN cannot create requests)
  if (!user.roles?.includes('INITIATOR')) {
    return NextResponse.json({ error: 'Forbidden: Only INITIATOR role can create payment requests' }, { status: 403 });
  }

  try {
    const body = await request.json();
    const { vaultId, payeeId, asset, amountMinor, memo } = body;

    // Validate required fields
    if (!vaultId || !payeeId || !amountMinor) {
      return NextResponse.json({ error: 'Missing required fields' }, { status: 400 });
    }

    // Check if vault exists and belongs to org
    const vault = await prisma.vault.findUnique({
      where: { id: vaultId },
    });

    if (!vault || vault.orgId !== user.orgId) {
      return NextResponse.json({ error: 'Vault not found' }, { status: 404 });
    }

    // Validate asset based on chain
    const chain = resolveVaultChain(vault.chain, vault.address);
    const validAssets = chain === 'SOLANA' ? ['SOL', 'USDC'] : ['ETH', 'USDC', 'USDT', 'EURC'];
    if (asset && !validAssets.includes(asset)) {
      return NextResponse.json({ error: `Invalid asset '${asset}' for ${chain} chain. Valid: ${validAssets.join(', ')}` }, { status: 400 });
    }

    // Check if payee exists, is approved, and belongs to org
    const payee = await prisma.payee.findUnique({
      where: { id: payeeId },
    });

    if (!payee || payee.orgId !== user.orgId) {
      return NextResponse.json({ error: 'Payee not found' }, { status: 404 });
    }

    if (payee.status !== 'APPROVED') {
      return NextResponse.json({ error: 'Payee is not approved' }, { status: 400 });
    }

    // Check if payee chain matches vault chain
    if (payee.chain !== vault.chain) {
      return NextResponse.json({ error: 'Payee chain does not match vault chain' }, { status: 400 });
    }

    // Create payment request in DRAFT status
    const paymentRequest = await prisma.paymentRequest.create({
      data: {
        orgId: user.orgId,
        vaultId,
        payeeId,
        chain: vault.chain,
        asset: asset || 'USDC',
        amountMinor,
        memo: memo || null,
        status: 'DRAFT',
        createdBy: user.id,
      },
      include: {
        vault: true,
        payee: true,
        creator: {
          select: { name: true, email: true },
        },
      },
    });

    // Create audit event
    await prisma.auditEvent.create({
      data: {
        orgId: user.orgId,
        eventType: 'REQUEST_CREATED',
        userId: user.id,
        requestId: paymentRequest.id,
        metadata: {
          vaultId,
          payeeId,
          amount: amountMinor,
          asset: asset || 'USDC',
          memo,
        },
        eventHash: '', // Will be set by trigger
      },
    });

    return NextResponse.json({ request: paymentRequest });
  } catch (error) {
    console.error('Error creating payment request:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
