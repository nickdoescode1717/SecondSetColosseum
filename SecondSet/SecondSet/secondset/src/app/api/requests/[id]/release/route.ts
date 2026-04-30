import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { prisma } from '@/lib/db';
import { jwtVerify } from 'jose';
import { CoordinatorClient } from '@/lib/coordinator';
import { createAuditEvent } from '@/lib/audit';
import { signTransactionWithTestKey, isTestSignerAvailable } from '@/lib/chains/evm/signer';
import { broadcastSignedTransaction } from '@/lib/chains/evm/broadcaster';
import { serializeTransaction, keccak256 } from 'viem';
import { resolveVaultChain } from '@/lib/chains/utils';
import { refreshSolanaBlockhash } from '@/lib/chains/solana/builder';

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

    // Check SIGNER role
    if (!user.roles?.includes('SIGNER')) {
      return NextResponse.json(
        { error: 'Forbidden: requires SIGNER role' },
        { status: 403 }
      );
    }

    const body = await req.json();
    const { releaseToken } = body;

    if (!releaseToken) {
      return NextResponse.json(
        { error: 'Release token required' },
        { status: 400 }
      );
    }

    // Fetch the request
    const request = await prisma.paymentRequest.findUnique({
      where: { id: requestId },
      include: {
        vault: true,
        payee: true,
        creator: { select: { name: true } },
      },
    });

    if (!request) {
      return NextResponse.json({ error: 'Request not found' }, { status: 404 });
    }

    // Verify request belongs to user's org
    if (request.orgId !== user.orgId) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    // Verify status is READY_TO_RELEASE
    if (request.status !== 'READY_TO_RELEASE') {
      return NextResponse.json(
        { error: `Cannot release request with status ${request.status}` },
        { status: 400 }
      );
    }

    // Check signer conflict (cannot be creator or approver)
    if (request.createdBy === user.id || request.approvedBy === user.id) {
      return NextResponse.json(
        { error: 'Signer cannot be creator or approver of this request' },
        { status: 403 }
      );
    }

    // Verify release token
    try {
      const secret = new TextEncoder().encode(process.env.RELEASE_TOKEN_SECRET);
      const { payload } = await jwtVerify(releaseToken, secret);

      // Verify token matches request
      if (payload.requestId !== request.id) {
        throw new Error('Token request mismatch');
      }

      // Verify tx digest hasn't changed
      if (payload.txDigest !== request.txDigest) {
        throw new Error('Transaction has been modified');
      }

      // Check token expiration
      if (request.releaseTokenExpiresAt && request.releaseTokenExpiresAt < new Date()) {
        throw new Error('Release token expired');
      }

    } catch (error: any) {
      return NextResponse.json(
        { error: `Invalid release token: ${error.message}` },
        { status: 400 }
      );
    }

    // Check if we should use test signer mode (development)
    const useTestSigner = isTestSignerAvailable() && (!process.env.COORDINATOR_API_URL || process.env.COORDINATOR_API_URL === 'http://localhost:3000');

    if (useTestSigner) {
      // DEVELOPMENT MODE: Use TEST_SIGNER_PRIVATE_KEY
      console.log('⚠️  Using TEST_SIGNER mode (development only)');
      console.log('🔐 Signing transaction for request:', requestId);

      try {
        // Sign transaction with test key
        const signedTx = await signTransactionWithTestKey({
          chainName: request.vault.chainName as any,
          unsignedTx: request.unsignedTx,
        });

        console.log('✅ Transaction signed with test key');

        // Broadcast immediately
        console.log('📡 Broadcasting transaction...');
        const { txHash, explorerUrl } = await broadcastSignedTransaction({
          chainName: request.vault.chainName as any,
          signedTx,
        });

        console.log('✅ Transaction broadcasted:', txHash);

        // Update request
        await prisma.paymentRequest.update({
          where: { id: requestId },
          data: {
            status: 'BROADCASTED',
            releasedBy: user.id,
            releasedAt: new Date(),
            broadcastedAt: new Date(),
            txHash,
            explorerUrl,
          },
        });

        // Create audit events
        await createAuditEvent({
          orgId: user.orgId,
          userId: user.id,
          eventType: 'PAYMENT_RELEASED',
          requestId: request.id,
          metadata: {
            mode: 'test_signer',
          },
        });

        await createAuditEvent({
          orgId: user.orgId,
          userId: user.id,
          eventType: 'TRANSACTION_BROADCASTED',
          requestId: request.id,
          metadata: {
            txHash,
            explorerUrl,
          },
        });

        return NextResponse.json({
          status: 'BROADCASTED',
          txHash,
          explorerUrl,
          message: 'Transaction signed and broadcasted (test mode)',
        });
      } catch (error: any) {
        console.error('❌ Error in test signer mode:', error);

        await prisma.paymentRequest.update({
          where: { id: requestId },
          data: {
            status: 'FAILED_BROADCAST',
            errorMessage: error.message,
          },
        });

        return NextResponse.json(
          { error: `Failed to sign/broadcast: ${error.message}` },
          { status: 500 }
        );
      }
    }

    // PRODUCTION MODE: Use CoordinatorClient with mobile signers
    try {
      console.log('🔐 Creating signing session for request:', requestId);

      const coordinator = new CoordinatorClient();
      const webhookUrl = `${process.env.NEXTAUTH_URL}/api/coordinator/webhook`;

      const resolvedChain = resolveVaultChain(request.chain, request.vault.address);
      let signingDigest: string;
      let amountDisplay: string;

      if (resolvedChain === 'EVM') {
        // Compute the correct Ethereum signing hash (keccak256 of serialized unsigned EIP-1559 tx)
        const storedTx = typeof request.unsignedTx === 'string'
          ? JSON.parse(request.unsignedTx as string)
          : request.unsignedTx as any;

        signingDigest = keccak256(serializeTransaction({
          to: storedTx.to as `0x${string}`,
          value: BigInt(storedTx.value || '0'),
          data: storedTx.data as `0x${string}`,
          nonce: Number(storedTx.nonce),
          gas: BigInt(storedTx.gasLimit),
          maxFeePerGas: BigInt(storedTx.maxFeePerGas),
          maxPriorityFeePerGas: BigInt(storedTx.maxPriorityFeePerGas),
          chainId: Number(storedTx.chainId),
          type: 'eip1559' as const,
        }));

        console.log('🔑 Ethereum signing hash:', signingDigest);

        // Convert amountMinor to display format (6 decimals for stablecoins, 18 for ETH)
        const decimals = request.asset === 'ETH' ? 18 : 6;
        amountDisplay = request.amountMinor
          ? (BigInt(request.amountMinor) / BigInt(10 ** decimals)).toString()
          : '?';
      } else {
        // SOLANA: Refresh blockhash so it's valid when the signing ceremony completes
        // (Blockhashes expire after ~60-90 seconds; approve step may have been minutes ago)
        const storedSolanaTx = typeof request.unsignedTx === 'string'
          ? JSON.parse(request.unsignedTx as string)
          : request.unsignedTx as any;

        const refreshed = await refreshSolanaBlockhash(storedSolanaTx);
        signingDigest = refreshed.serializedMessage;

        console.log('🔑 Solana signing digest (fresh blockhash):', signingDigest.slice(0, 40) + '...');
        console.log('   Old blockhash:', storedSolanaTx.recentBlockhash);
        console.log('   New blockhash:', refreshed.unsignedTx.recentBlockhash);

        // Update the stored transaction and digest with fresh blockhash
        await prisma.paymentRequest.update({
          where: { id: requestId },
          data: {
            unsignedTx: refreshed.unsignedTx,
            txDigest: refreshed.serializedMessage,
          },
        });

        // SOL has 9 decimals, USDC has 6 decimals
        const decimals = request.asset === 'SOL' ? 9 : 6;
        amountDisplay = request.amountMinor
          ? (BigInt(request.amountMinor) / BigInt(10 ** decimals)).toString()
          : '?';
      }

      const signingResponse = await coordinator.createSigningSession({
        orgId: user.orgId,
        walletAddress: request.vault.address,
        requestId: request.id,
        txDigest: signingDigest,
        unsignedTx: request.unsignedTx,
        chain: resolvedChain,
        threshold: 2,
        webhookUrl,
        displayInfo: {
          amount: amountDisplay,
          token: request.asset || 'USDC',
          chain: request.vault.chainName || request.chain,
          recipientAddress: request.payee.address,
          recipientName: request.payee.name || undefined,
          requestedBy: request.creator?.name || undefined,
        },
      });

      console.log('✅ Signing session created:', signingResponse.sessionId);

      // Delete any stale signing session for this request (unique constraint on requestId)
      await prisma.signingSession.deleteMany({
        where: { requestId: request.id },
      });

      // Store signing session
      const signingSession = await prisma.signingSession.create({
        data: {
          orgId: user.orgId,
          requestId: request.id,
          coordinatorSessionId: signingResponse.sessionId,
          qrCodeData: signingResponse.qrCodeData,
          status: 'PENDING',
          initiatedBy: user.id,
          expiresAt: new Date(signingResponse.expiresAt),
        },
      });

      // Create audit event
      await createAuditEvent({
        orgId: user.orgId,
        userId: user.id,
        eventType: 'SIGNING_INITIATED',
        requestId: request.id,
        metadata: {
          sessionId: signingSession.id,
        },
      });

      // Return session for client polling
      return NextResponse.json({
        signingSessionId: signingSession.id,
        qrCodeData: signingSession.qrCodeData,
        status: 'PENDING',
        message: 'Signing session created. Scan QR code with mobile signers.',
      });
    } catch (error: any) {
      console.error('❌ Error creating signing session:', error);

      // Update request with error
      await prisma.paymentRequest.update({
        where: { id: requestId },
        data: {
          status: 'FAILED_BROADCAST',
          errorMessage: error.message,
        },
      });

      return NextResponse.json(
        { error: `Failed to create signing session: ${error.message}` },
        { status: 500 }
      );
    }
  } catch (error) {
    console.error('Error releasing request:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}