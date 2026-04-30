import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { prisma } from '@/lib/db';
import { createHash, randomBytes } from 'crypto';
import { SignJWT } from 'jose';
import { buildEVMUSDCTransfer, buildEVMETHTransfer, serializeTransactionForDigest, SupportedChain } from '@/lib/chains/evm/builder';
import { buildSolanaSOLTransfer, buildSolanaSPLTransfer, getUSDCMint } from '@/lib/chains/solana/builder';
import { resolveVaultChain } from '@/lib/chains/utils';
import { createAuditEvent } from '@/lib/audit';

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await getServerSession(authOptions);
    
    if (!session?.user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const user = session.user as any;
    const { id: requestId } = await params;

    // Check APPROVER role
    if (!user.roles?.includes('APPROVER')) {
      return NextResponse.json(
        { error: 'Forbidden: requires APPROVER role' },
        { status: 403 }
      );
    }

    // Fetch the request
    const request = await prisma.paymentRequest.findUnique({
      where: { id: requestId },
      include: {
        vault: true,
        payee: true,
      },
    });

    if (!request) {
      return NextResponse.json({ error: 'Request not found' }, { status: 404 });
    }

    // Verify request belongs to user's org
    if (request.orgId !== user.orgId) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    // Verify status is SUBMITTED
    if (request.status !== 'SUBMITTED') {
      return NextResponse.json(
        { error: `Cannot approve request with status ${request.status}` },
        { status: 400 }
      );
    }

    // Check self-approval
    if (request.createdBy === user.id) {
      return NextResponse.json(
        { error: 'Cannot approve own request' },
        { status: 403 }
      );
    }

    // Build unsigned transaction using real EVM builder
    let unsignedTx;
    let txDigest;

    try {
      const resolvedChain = resolveVaultChain(request.chain, request.vault.address);

      if (resolvedChain === 'EVM') {
        let evmTx;

        // Determine if this is ETH or token transfer
        if (request.asset === 'ETH') {
          evmTx = await buildEVMETHTransfer({
            chainName: (request.vault.chainName || 'sepolia') as SupportedChain,
            fromAddress: request.vault.address,
            toAddress: request.payee.address,
            amountWei: request.amountMinor, // For ETH, amountMinor is in wei (18 decimals)
          });
        } else {
          // USDC, USDT, EURC, etc. (all 6 decimals for stablecoins)
          evmTx = await buildEVMUSDCTransfer({
            chainName: (request.vault.chainName || 'sepolia') as SupportedChain,
            fromAddress: request.vault.address,
            toAddress: request.payee.address,
            amountMinor: request.amountMinor,
          });
        }

        // Convert BigInt to strings for JSON storage
        unsignedTx = {
          to: evmTx.to,
          from: evmTx.from,
          value: evmTx.value.toString(),
          data: evmTx.data,
          nonce: evmTx.nonce,
          gasLimit: evmTx.gasLimit.toString(),
          maxFeePerGas: evmTx.maxFeePerGas.toString(),
          maxPriorityFeePerGas: evmTx.maxPriorityFeePerGas.toString(),
          chainId: evmTx.chainId,
          type: evmTx.type,
        };

        // Compute canonical tx digest
        const canonical = serializeTransactionForDigest(evmTx);
        txDigest = createHash('sha256').update(canonical).digest('hex');
      } else if (resolvedChain === 'SOLANA') {
        const network = request.vault.chainName || 'solana-devnet';
        let solTx;

        if (request.asset === 'SOL') {
          solTx = await buildSolanaSOLTransfer({
            network,
            fromAddress: request.vault.address,
            toAddress: request.payee.address,
            amountLamports: request.amountMinor,
          });
        } else {
          // USDC SPL token transfer
          solTx = await buildSolanaSPLTransfer({
            network,
            fromAddress: request.vault.address,
            toAddress: request.payee.address,
            mintAddress: getUSDCMint(network),
            amountMinor: request.amountMinor,
          });
        }

        unsignedTx = solTx.unsignedTx;
        txDigest = solTx.serializedMessage; // hex of message bytes — what Ed25519 signs
      } else {
        return NextResponse.json(
          { error: `Unsupported chain: ${request.chain}` },
          { status: 400 }
        );
      }
    } catch (error: any) {
      console.error('Error building transaction:', error);
      return NextResponse.json(
        { error: `Failed to build transaction: ${error.message}` },
        { status: 500 }
      );
    }

    // Generate release token (JWT)
    const nonce = randomBytes(32).toString('hex');
    const secret = new TextEncoder().encode(process.env.RELEASE_TOKEN_SECRET);
    
    const releaseToken = await new SignJWT({
      requestId: request.id,
      txDigest,
      policyVersion: request.policyVersion,
      nonce,
    })
      .setProtectedHeader({ alg: 'HS256' })
      .setExpirationTime('1h') // 1 hour for testing
      .sign(secret);

    // Update to APPROVED → READY_TO_RELEASE
    const updated = await prisma.paymentRequest.update({
      where: { id: requestId },
      data: {
        status: 'READY_TO_RELEASE',
        approvedBy: user.id,
        approvedAt: new Date(),
        unsignedTx,
        txDigest,
        releaseToken,
        releaseTokenExpiresAt: new Date(Date.now() + 60 * 60 * 1000), // 1 hour
        releaseNonce: nonce,
      },
      include: {
        payee: true,
        vault: true,
        creator: { select: { name: true } },
        approver: { select: { name: true } },
      },
    });

    // Create audit event
    await createAuditEvent({
      orgId: user.orgId,
      userId: user.id,
      eventType: 'REQUEST_APPROVED',
      requestId: updated.id,
      metadata: {
        txDigest,
      },
    });

    return NextResponse.json({ request: updated });
  } catch (error) {
    console.error('Error approving request:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}