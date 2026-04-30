import { requireRoles } from '@/lib/rbac';
import { prisma } from '@/lib/db';
import { NextResponse } from 'next/server';
import { createAuditEvent } from '@/lib/audit';
import { CoordinatorClient } from '@/lib/coordinator';
import {
  getSwapQuote,
  getSwapTransaction,
  checkTokenAllowance,
  validateQuoteDeviation,
} from '@/lib/chains/evm/swap';
import { getUniswapRouterAddress } from '@/lib/chains/evm/tokens';
import { serializeTransactionForDigest } from '@/lib/chains/evm/builder';
import { keccak256, toHex } from 'viem';
import jwt from 'jsonwebtoken';
import { v4 as uuidv4 } from 'uuid';
import { formatUnits } from 'viem';

export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const user = await requireRoles(['SIGNER', 'ADMIN']);
    const { id } = await params;

    const swapRequest = await prisma.swapRequest.findFirst({
      where: { id, orgId: user.orgId },
      include: {
        vault: true,
        creator: { select: { name: true, email: true, id: true } },
      },
    });

    if (!swapRequest) {
      return NextResponse.json({ error: 'Swap request not found' }, { status: 404 });
    }

    if (swapRequest.status !== 'APPROVED') {
      return NextResponse.json(
        { error: `Cannot release swap in ${swapRequest.status} status` },
        { status: 400 }
      );
    }

    // Signer conflict: cannot be creator or approver
    if (swapRequest.createdBy === user.id) {
      return NextResponse.json(
        { error: 'Signer cannot be the creator of this swap' },
        { status: 403 }
      );
    }
    if (swapRequest.approvedBy === user.id) {
      return NextResponse.json(
        { error: 'Signer cannot be the approver of this swap' },
        { status: 403 }
      );
    }

    const chainName = swapRequest.chainName;
    const routerAddress = getUniswapRouterAddress(chainName);
    if (!routerAddress) {
      return NextResponse.json(
        { error: `No Uniswap router configured for ${chainName}` },
        { status: 400 }
      );
    }

    // 1. Check ERC-20 allowance
    const allowance = await checkTokenAllowance(
      chainName,
      swapRequest.fromTokenAddress,
      swapRequest.vault.address,
      routerAddress
    );

    if (allowance < BigInt(swapRequest.fromAmount)) {
      return NextResponse.json(
        {
          error: 'TOKEN_APPROVAL_NEEDED',
          message: `Vault needs to approve ${swapRequest.fromToken} for the Uniswap Router. Current allowance: ${allowance.toString()}`,
          routerAddress,
          tokenAddress: swapRequest.fromTokenAddress,
          tokenSymbol: swapRequest.fromToken,
          requiredAmount: swapRequest.fromAmount,
        },
        { status: 428 } // Precondition Required
      );
    }

    // 2. Fetch fresh Uniswap quote
    const freshQuote = await getSwapQuote({
      chainName,
      fromAddress: swapRequest.vault.address,
      tokenIn: swapRequest.fromTokenAddress,
      tokenOut: swapRequest.toTokenAddress,
      amountIn: swapRequest.fromAmount,
      slippageBps: swapRequest.slippageBps,
    });

    // 3. Validate fresh quote vs original (if original exists)
    if (swapRequest.expectedOutput) {
      const deviationError = validateQuoteDeviation(
        swapRequest.expectedOutput,
        freshQuote.amountOut
      );
      if (deviationError) {
        return NextResponse.json(
          { error: deviationError },
          { status: 409 } // Conflict
        );
      }
    }

    // 4. Build unsigned swap tx via Uniswap /swap endpoint
    const unsignedTx = await getSwapTransaction(chainName, freshQuote);

    // 5. Compute keccak256 signing digest
    const serializedTx = serializeTransactionForDigest(unsignedTx);
    const txDigest = keccak256(toHex(serializedTx));

    // 6. Generate release token
    const releaseNonce = uuidv4();
    const releaseToken = jwt.sign(
      {
        swapRequestId: id,
        txDigest,
        nonce: releaseNonce,
      },
      process.env.RELEASE_TOKEN_SECRET!,
      { expiresIn: '1h' }
    );

    // 7. Store tx + quote in SwapRequest
    // Convert BigInt values to strings for JSON storage
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

    await prisma.swapRequest.update({
      where: { id },
      data: {
        unsignedTx: unsignedTxForStorage,
        txDigest,
        releaseToken,
        releaseTokenExpiresAt: new Date(Date.now() + 60 * 60 * 1000),
        releaseQuoteOutput: freshQuote.amountOut,
        releaseQuoteMinOutput: freshQuote.amountOutMin,
        releaseQuoteTimestamp: new Date(),
      },
    });

    // 8. Create coordinator signing session
    // Format display amounts for mobile
    const fromAmountFormatted = formatUnits(
      BigInt(swapRequest.fromAmount),
      swapRequest.fromTokenDecimals
    );
    const toAmountFormatted = formatUnits(
      BigInt(freshQuote.amountOut),
      swapRequest.toTokenDecimals
    );
    const minReceivedFormatted = formatUnits(
      BigInt(freshQuote.amountOutMin),
      swapRequest.toTokenDecimals
    );

    // Include swap-specific display fields in the tx object passed to coordinator.
    // The CoordinatorClient spreads unsignedTx into tx_details, so these fields
    // will be visible to the mobile app alongside the standard display_* fields.
    const txWithSwapDisplay = {
      ...unsignedTxForStorage,
      display_type: 'swap',
      display_from_token: swapRequest.fromToken,
      display_from_amount: fromAmountFormatted,
      display_to_token: swapRequest.toToken,
      display_to_amount: toAmountFormatted,
      display_min_received: minReceivedFormatted,
      display_slippage: `${swapRequest.slippageBps / 100}%`,
    };

    const coordinator = new CoordinatorClient();
    const signingResponse = await coordinator.createSigningSession({
      orgId: user.orgId,
      walletAddress: swapRequest.vault.address,
      requestId: swapRequest.id,
      txDigest,
      unsignedTx: txWithSwapDisplay,
      chain: 'EVM',
      threshold: 2,
      webhookUrl: `${process.env.NEXTAUTH_URL}/api/coordinator/webhook`,
      displayInfo: {
        amount: fromAmountFormatted,
        token: swapRequest.fromToken,
        chain: chainName,
        recipientAddress: routerAddress,
        recipientName: 'Uniswap Router',
        requestedBy: swapRequest.creator?.name || 'Unknown',
      },
    });

    // 9. Create SwapSigningSession
    await prisma.swapSigningSession.create({
      data: {
        orgId: user.orgId,
        swapRequestId: id,
        coordinatorSessionId: signingResponse.sessionId,
        qrCodeData: signingResponse.qrCodeData || null,
        status: 'PENDING',
        initiatedBy: user.id,
        expiresAt: new Date(signingResponse.expiresAt),
      },
    });

    await createAuditEvent({
      orgId: user.orgId,
      userId: user.id,
      eventType: 'SWAP_RELEASED',
      swapRequestId: id,
      metadata: {
        signingSessionId: signingResponse.sessionId,
        freshQuoteOutput: freshQuote.amountOut,
        freshQuoteMinOutput: freshQuote.amountOutMin,
      },
    });

    return NextResponse.json({
      signingSessionId: signingResponse.sessionId,
      qrCodeData: signingResponse.qrCodeData,
      freshQuote: {
        amountOut: freshQuote.amountOut,
        amountOutMin: freshQuote.amountOutMin,
        priceImpact: freshQuote.priceImpact,
      },
    });
  } catch (error: any) {
    console.error('Swap release error:', error);
    const status = error.message?.includes('Unauthorized') ? 401
      : error.message?.includes('Forbidden') ? 403
      : error.message?.includes('Signer cannot') ? 403
      : 400;
    return NextResponse.json({ error: error.message }, { status });
  }
}
