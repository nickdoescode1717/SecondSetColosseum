import { requireRoles } from '@/lib/rbac';
import { prisma } from '@/lib/db';
import { NextResponse } from 'next/server';
import { CoordinatorClient } from '@/lib/coordinator';
import { buildApproveTransaction } from '@/lib/chains/evm/swap';
import { getTokenAddress, getUniswapRouterAddress } from '@/lib/chains/evm/tokens';
import { serializeTransactionForDigest } from '@/lib/chains/evm/builder';
import { keccak256, toHex } from 'viem';

export async function POST(req: Request) {
  try {
    const user = await requireRoles(['SIGNER', 'ADMIN']);
    const body = await req.json();
    const { vaultId, tokenSymbol, chainName } = body;

    if (!vaultId || !tokenSymbol || !chainName) {
      return NextResponse.json(
        { error: 'vaultId, tokenSymbol, and chainName are required' },
        { status: 400 }
      );
    }

    const vault = await prisma.vault.findFirst({
      where: { id: vaultId, orgId: user.orgId },
    });
    if (!vault) {
      return NextResponse.json({ error: 'Vault not found' }, { status: 404 });
    }

    const tokenAddress = getTokenAddress(tokenSymbol, chainName);
    if (!tokenAddress) {
      return NextResponse.json(
        { error: `${tokenSymbol} not available on ${chainName}` },
        { status: 400 }
      );
    }

    const routerAddress = getUniswapRouterAddress(chainName);
    if (!routerAddress) {
      return NextResponse.json(
        { error: `Uniswap not available on ${chainName}` },
        { status: 400 }
      );
    }

    // Build ERC-20 approve(router, MAX_UINT256) tx
    const unsignedTx = await buildApproveTransaction(
      chainName,
      tokenAddress,
      routerAddress,
      vault.address
    );

    // Compute keccak256 digest
    const serializedTx = serializeTransactionForDigest(unsignedTx);
    const txDigest = keccak256(toHex(serializedTx));

    // Convert BigInt values to strings for JSON
    const unsignedTxForStorage = {
      to: unsignedTx.to,
      from: unsignedTx.from,
      value: unsignedTx.value.toString(),
      data: unsignedTx.data,
      nonce: unsignedTx.nonce,
      gasLimit: unsignedTx.gasLimit.toString(),
      maxFeePerGas: unsignedTx.maxFeePerGas.toString(),
      maxPriorityFeePerGas: unsignedTx.maxPriorityFeePerGas.toString(),
      chainId: unsignedTx.chainId,
      type: unsignedTx.type,
    };

    // Create coordinator signing session for the approve tx
    const coordinator = new CoordinatorClient();
    const signingResponse = await coordinator.createSigningSession({
      orgId: user.orgId,
      walletAddress: vault.address,
      requestId: `token-approval-${vaultId}-${tokenSymbol}-${Date.now()}`,
      txDigest,
      unsignedTx: unsignedTxForStorage,
      chain: 'EVM',
      threshold: 2,
      webhookUrl: `${process.env.NEXTAUTH_URL}/api/coordinator/webhook`,
      displayInfo: {
        amount: 'Unlimited',
        token: tokenSymbol,
        chain: chainName,
        recipientAddress: routerAddress,
        recipientName: 'Uniswap Router (Token Approval)',
        requestedBy: user.name || user.email || 'Unknown',
      },
    });

    return NextResponse.json({
      signingSessionId: signingResponse.sessionId,
      qrCodeData: signingResponse.qrCodeData,
      message: `Token approval for ${tokenSymbol} on ${chainName}. This is a one-time operation per token per vault.`,
    });
  } catch (error: any) {
    console.error('Token approval error:', error);
    return NextResponse.json({ error: error.message }, { status: 400 });
  }
}
