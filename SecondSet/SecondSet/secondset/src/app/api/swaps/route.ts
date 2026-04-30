import { requireAuth, requireRoles } from '@/lib/rbac';
import { prisma } from '@/lib/db';
import { NextResponse } from 'next/server';
import { getTokenAddress, validateSwapPair, EVM_TOKENS } from '@/lib/chains/evm/tokens';
import { checkTokenBalance } from '@/lib/chains/evm/swap';
import { resolveVaultChain } from '@/lib/chains/utils';
import { createAuditEvent } from '@/lib/audit';

export async function POST(req: Request) {
  try {
    const user = await requireRoles(['INITIATOR']);
    const body = await req.json();
    const {
      vaultId, fromToken, toToken, fromAmount,
      slippageBps, memo, quote,
    } = body;

    if (!vaultId || !fromToken || !toToken || !fromAmount) {
      return NextResponse.json(
        { error: 'vaultId, fromToken, toToken, and fromAmount are required' },
        { status: 400 }
      );
    }

    // Validate vault
    const vault = await prisma.vault.findFirst({
      where: { id: vaultId, orgId: user.orgId },
    });
    if (!vault) {
      return NextResponse.json({ error: 'Vault not found' }, { status: 404 });
    }

    // Must be EVM
    const chain = resolveVaultChain(vault.chain, vault.address);
    if (chain !== 'EVM') {
      return NextResponse.json(
        { error: 'Swaps are only supported on EVM chains' },
        { status: 400 }
      );
    }

    const chainName = vault.chainName || 'ethereum';

    // Validate swap pair
    const pairError = validateSwapPair(fromToken, toToken, chainName);
    if (pairError) {
      return NextResponse.json({ error: pairError }, { status: 400 });
    }

    const fromTokenConfig = EVM_TOKENS[fromToken];
    const toTokenConfig = EVM_TOKENS[toToken];
    const fromTokenAddress = getTokenAddress(fromToken, chainName)!;
    const toTokenAddress = getTokenAddress(toToken, chainName)!;

    // Balance check
    const balance = await checkTokenBalance(chainName, fromTokenAddress, vault.address);
    if (balance < BigInt(fromAmount)) {
      return NextResponse.json(
        { error: `Insufficient ${fromToken} balance. Have: ${balance.toString()}, Need: ${fromAmount}` },
        { status: 400 }
      );
    }

    // Create swap request
    const swapRequest = await prisma.swapRequest.create({
      data: {
        orgId: user.orgId,
        vaultId: vault.id,
        chain: 'EVM',
        chainName,
        fromToken,
        fromTokenAddress,
        fromTokenDecimals: fromTokenConfig.decimals,
        toToken,
        toTokenAddress,
        toTokenDecimals: toTokenConfig.decimals,
        fromAmount,
        slippageBps: slippageBps || 50,
        memo: memo || null,
        // Store quote details if provided
        expectedOutput: quote?.amountOut || null,
        minimumOutput: quote?.amountOutMin || null,
        priceImpact: quote?.priceImpact || null,
        route: quote?.route || null,
        quoteTimestamp: quote ? new Date() : null,
        quoteExpiresAt: quote?.expiresAt ? new Date(quote.expiresAt) : null,
        createdBy: user.id,
        status: 'DRAFT',
      },
      include: {
        vault: true,
        creator: { select: { name: true, email: true, id: true } },
      },
    });

    await createAuditEvent({
      orgId: user.orgId,
      userId: user.id,
      eventType: 'SWAP_CREATED',
      swapRequestId: swapRequest.id,
      metadata: { fromToken, toToken, fromAmount, chainName },
    });

    return NextResponse.json(swapRequest, { status: 201 });
  } catch (error: any) {
    console.error('Create swap error:', error);
    const status = error.message?.includes('Unauthorized') ? 401
      : error.message?.includes('Forbidden') ? 403
      : 400;
    return NextResponse.json({ error: error.message }, { status });
  }
}

export async function GET(req: Request) {
  try {
    const user = await requireAuth();
    const { searchParams } = new URL(req.url);
    const status = searchParams.get('status');

    const where: any = { orgId: user.orgId };
    if (status) where.status = status;

    const swapRequests = await prisma.swapRequest.findMany({
      where,
      include: {
        vault: true,
        creator: { select: { name: true, email: true, id: true } },
        approver: { select: { name: true, email: true, id: true } },
      },
      orderBy: { createdAt: 'desc' },
    });

    return NextResponse.json(swapRequests);
  } catch (error: any) {
    console.error('List swaps error:', error);
    return NextResponse.json({ error: error.message }, { status: 400 });
  }
}
