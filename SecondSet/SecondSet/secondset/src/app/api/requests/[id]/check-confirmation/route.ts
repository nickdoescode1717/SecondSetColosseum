import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { prisma } from '@/lib/db';
import { checkTransactionConfirmation, SupportedChain } from '@/lib/chains/evm/broadcaster';
import { resolveVaultChain } from '@/lib/chains/utils';
import { Connection } from '@solana/web3.js';
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

    // Fetch the request
    const request = await prisma.paymentRequest.findUnique({
      where: { id: requestId },
      include: {
        vault: true,
      },
    });

    if (!request) {
      return NextResponse.json({ error: 'Request not found' }, { status: 404 });
    }

    // Verify request belongs to user's org
    if (request.orgId !== user.orgId) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    // Only check confirmation for BROADCASTED status
    if (request.status !== 'BROADCASTED') {
      return NextResponse.json(
        { 
          error: `Cannot check confirmation for status ${request.status}`,
          status: request.status,
        },
        { status: 400 }
      );
    }

    // Must have tx hash
    if (!request.txHash) {
      return NextResponse.json(
        { error: 'No transaction hash found' },
        { status: 400 }
      );
    }

    // Check confirmation status
    let confirmationStatus: { confirmed: boolean; confirmations: number; status: string };
    const resolvedChain = resolveVaultChain(request.chain, request.vault.address);

    try {
      if (resolvedChain === 'EVM') {
        confirmationStatus = await checkTransactionConfirmation({
          chainName: (request.vault.chainName || 'sepolia') as SupportedChain,
          txHash: request.txHash,
          requiredConfirmations: 12, // Standard for finality
        });
      } else {
        // SOLANA: Check transaction confirmation status
        const network = request.vault.chainName || 'solana-devnet';
        const rpcUrl = network === 'solana-mainnet'
          ? (process.env.SOLANA_MAINNET_RPC_URL || 'https://api.mainnet-beta.solana.com')
          : (process.env.SOLANA_DEVNET_RPC_URL || 'https://api.devnet.solana.com');

        const connection = new Connection(rpcUrl, 'confirmed');
        const statuses = await connection.getSignatureStatuses([request.txHash]);
        const sigStatus = statuses.value[0];

        if (!sigStatus) {
          // Transaction not found yet — still pending
          confirmationStatus = { confirmed: false, confirmations: 0, status: 'pending' };
        } else if (sigStatus.err) {
          // Transaction failed on-chain
          confirmationStatus = { confirmed: false, confirmations: 0, status: 'reverted' };
        } else if (sigStatus.confirmationStatus === 'finalized') {
          // Finalized = equivalent to ~31 confirmations, fully confirmed
          confirmationStatus = { confirmed: true, confirmations: 32, status: 'confirmed' };
        } else {
          // 'processed' or 'confirmed' — not yet finalized
          const confirmations = sigStatus.confirmations || 0;
          confirmationStatus = { confirmed: false, confirmations, status: 'pending' };
        }
      }
    } catch (error: any) {
      console.error('Error checking confirmation:', error);
      return NextResponse.json(
        {
          error: `Failed to check confirmation: ${error.message}`,
          confirmations: 0,
          confirmed: false,
        },
        { status: 500 }
      );
    }

    // If transaction failed on-chain, update status
    if (confirmationStatus.status === 'reverted') {
      const updated = await prisma.paymentRequest.update({
        where: { id: requestId },
        data: {
          status: 'FAILED_BROADCAST',
          errorMessage: 'Transaction reverted on-chain',
        },
      });

      return NextResponse.json({
        confirmed: false,
        confirmations: confirmationStatus.confirmations,
        status: 'reverted',
        request: updated,
      });
    }

    // If confirmed, update to CONFIRMED
    if (confirmationStatus.confirmed) {
      const updated = await prisma.paymentRequest.update({
        where: { id: requestId },
        data: {
          status: 'CONFIRMED',
          confirmedAt: new Date(),
          confirmationCount: confirmationStatus.confirmations,
        },
        include: {
          payee: true,
          vault: true,
          creator: { select: { name: true } },
          approver: { select: { name: true } },
          releaser: { select: { name: true } },
        },
      });

      // Create audit event
      await createAuditEvent({
        orgId: user.orgId,
        userId: user.id,
        eventType: 'REQUEST_CONFIRMED',
        requestId: updated.id,
        metadata: {
          confirmations: confirmationStatus.confirmations,
          txHash: request.txHash,
        },
      });

      return NextResponse.json({
        confirmed: true,
        confirmations: confirmationStatus.confirmations,
        status: 'confirmed',
        request: updated,
      });
    }

    // Still pending
    return NextResponse.json({
      confirmed: false,
      confirmations: confirmationStatus.confirmations,
      status: 'pending',
      message: `${confirmationStatus.confirmations}/12 confirmations`,
    });

  } catch (error) {
    console.error('Error checking confirmation:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}