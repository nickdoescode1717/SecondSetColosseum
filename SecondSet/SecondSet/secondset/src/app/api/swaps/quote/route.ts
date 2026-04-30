import { requireRoles } from '@/lib/rbac';
import { prisma } from '@/lib/db';
import { NextResponse } from 'next/server';
import { getTokenAddress, validateSwapPair, EVM_TOKENS } from '@/lib/chains/evm/tokens';
import { getSwapQuote } from '@/lib/chains/evm/swap';
import { resolveVaultChain } from '@/lib/chains/utils';

export async function POST(req: Request) {
  try {
    const user = await requireRoles(['INITIATOR', 'ADMIN']);
    const body = await req.json();
    const { vaultId, fromToken, toToken, fromAmount, slippageBps } = body;

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

    // Must be EVM vault
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

    const tokenInAddress = getTokenAddress(fromToken, chainName);
    const tokenOutAddress = getTokenAddress(toToken, chainName);
    if (!tokenInAddress || !tokenOutAddress) {
      return NextResponse.json(
        { error: 'Token address not found for this chain' },
        { status: 400 }
      );
    }

    // Get quote from Uniswap
    const quote = await getSwapQuote({
      chainName,
      fromAddress: vault.address,
      tokenIn: tokenInAddress,
      tokenOut: tokenOutAddress,
      amountIn: fromAmount,
      slippageBps: slippageBps || 50,
    });

    return NextResponse.json({
      quote,
      fromToken: EVM_TOKENS[fromToken],
      toToken: EVM_TOKENS[toToken],
      chainName,
    });
  } catch (error: any) {
    console.error('Swap quote error:', error);
    const status = error.message?.includes('Unauthorized') ? 401
      : error.message?.includes('Forbidden') ? 403
      : 400;
    return NextResponse.json({ error: error.message }, { status });
  }
}
