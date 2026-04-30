import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { prisma } from '@/lib/db';
import { createAuditEvent } from '@/lib/audit';

// GET /api/admin/vaults - List all vaults
export async function GET(req: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    
    if (!session?.user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const user = session.user as any;

    // Check ADMIN role
    if (!user.roles?.includes('ADMIN')) {
      return NextResponse.json(
        { error: 'Forbidden: requires ADMIN role' },
        { status: 403 }
      );
    }

    const vaults = await prisma.vault.findMany({
      where: { orgId: user.orgId },
      orderBy: { createdAt: 'desc' },
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

// POST /api/admin/vaults - Create a new vault
export async function POST(req: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    
    if (!session?.user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const user = session.user as any;

    // Check ADMIN role
    if (!user.roles?.includes('ADMIN')) {
      return NextResponse.json(
        { error: 'Forbidden: requires ADMIN role' },
        { status: 403 }
      );
    }

    const body = await req.json();
    const { name, chain, chainName, address, turnkeyWalletId } = body;

    // Validate required fields
    if (!chain || !chainName || !address) {
      return NextResponse.json(
        { error: 'Missing required fields: chain, chainName, address' },
        { status: 400 }
      );
    }

    // Validate chain
    if (chain !== 'EVM' && chain !== 'SOLANA') {
      return NextResponse.json(
        { error: 'Invalid chain. Must be EVM or SOLANA' },
        { status: 400 }
      );
    }

    // Validate chainName for EVM
    if (chain === 'EVM') {
      const validChainNames = ['ethereum', 'sepolia', 'base', 'base-sepolia'];
      if (!validChainNames.includes(chainName)) {
        return NextResponse.json(
          { error: `Invalid chainName for EVM. Must be one of: ${validChainNames.join(', ')}` },
          { status: 400 }
        );
      }
    }

    // Check if vault with this address already exists
    const existing = await prisma.vault.findFirst({
      where: {
        orgId: user.orgId,
        address: address.toLowerCase(),
      },
    });

    if (existing) {
      return NextResponse.json(
        { error: 'Vault with this address already exists' },
        { status: 400 }
      );
    }

    // Create vault
    const vault = await prisma.vault.create({
      data: {
        orgId: user.orgId,
        chain,
        chainName,
        address: address.toLowerCase(),
        name: name || `${chainName} Vault`,
        turnkeyWalletId: turnkeyWalletId || 'manual-wallet', // For manually added wallets
      },
    });

    // Create audit event
    await createAuditEvent({
      orgId: user.orgId,
      userId: user.id,
      eventType: 'VAULT_CREATED',
      metadata: {
        vaultId: vault.id,
        chain: vault.chain,
        chainName: vault.chainName,
        address: vault.address,
      },
    });

    return NextResponse.json({ vault }, { status: 201 });
  } catch (error) {
    console.error('Error creating vault:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}