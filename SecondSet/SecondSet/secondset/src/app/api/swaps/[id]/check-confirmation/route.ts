import { NextResponse } from 'next/server';
import { requireRoles } from '@/lib/rbac';
import { prisma } from '@/lib/db';
import { createPublicClient, http } from 'viem';
import { mainnet, base, sepolia, baseSepolia } from 'viem/chains';
import { createAuditEvent } from '@/lib/audit';

const CHAIN_CONFIG: Record<string, { chain: any; rpcUrl: string }> = {
  ethereum: { chain: mainnet, rpcUrl: process.env.ETHEREUM_RPC_URL! },
  sepolia: { chain: sepolia, rpcUrl: process.env.SEPOLIA_RPC_URL || process.env.ETHEREUM_RPC_URL! },
  base: { chain: base, rpcUrl: process.env.BASE_RPC_URL! },
  'base-sepolia': { chain: baseSepolia, rpcUrl: process.env.BASE_SEPOLIA_RPC_URL || process.env.BASE_RPC_URL! },
};

const REQUIRED_CONFIRMATIONS = 12;

export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const user = await requireRoles(['SIGNER', 'ADMIN']);
    const { id: swapId } = await params;

    const swapRequest = await prisma.swapRequest.findFirst({
      where: { id: swapId, orgId: user.orgId },
      include: { vault: true },
    });

    if (!swapRequest) {
      return NextResponse.json({ error: 'Not found' }, { status: 404 });
    }

    if (swapRequest.status !== 'RELEASED') {
      return NextResponse.json(
        { error: `Cannot check confirmation in ${swapRequest.status} status` },
        { status: 400 }
      );
    }

    if (!swapRequest.txHash) {
      return NextResponse.json({ error: 'No transaction hash' }, { status: 400 });
    }

    const config = CHAIN_CONFIG[swapRequest.chainName];
    if (!config) throw new Error(`Unsupported chain: ${swapRequest.chainName}`);

    const client = createPublicClient({
      chain: config.chain,
      transport: http(config.rpcUrl),
    });

    try {
      const receipt = await client.getTransactionReceipt({
        hash: swapRequest.txHash as `0x${string}`,
      });

      if (!receipt) {
        return NextResponse.json({
          confirmed: false,
          confirmations: 0,
          status: 'pending',
        });
      }

      // Check if reverted
      if (receipt.status === 'reverted') {
        await prisma.swapRequest.update({
          where: { id: swapId },
          data: {
            status: 'FAILED',
            errorMessage: 'Transaction reverted on-chain',
          },
        });

        await createAuditEvent({
          orgId: user.orgId,
          userId: user.id,
          eventType: 'SWAP_FAILED',
          swapRequestId: swapId,
          metadata: { reason: 'Transaction reverted' },
        });

        return NextResponse.json({
          confirmed: false,
          confirmations: 0,
          status: 'reverted',
        });
      }

      // Check confirmations
      const currentBlock = await client.getBlockNumber();
      const confirmations = Number(currentBlock - receipt.blockNumber);

      if (confirmations >= REQUIRED_CONFIRMATIONS) {
        await prisma.swapRequest.update({
          where: { id: swapId },
          data: {
            status: 'CONFIRMED',
            confirmedAt: new Date(),
          },
        });

        await createAuditEvent({
          orgId: user.orgId,
          userId: user.id,
          eventType: 'SWAP_CONFIRMED',
          swapRequestId: swapId,
          metadata: {
            txHash: swapRequest.txHash,
            confirmations,
          },
        });

        return NextResponse.json({
          confirmed: true,
          confirmations,
          status: 'confirmed',
        });
      }

      return NextResponse.json({
        confirmed: false,
        confirmations,
        status: 'pending',
      });
    } catch (error: any) {
      // Transaction receipt not found — tx not yet mined
      if (error.name === 'TransactionReceiptNotFoundError') {
        return NextResponse.json({
          confirmed: false,
          confirmations: 0,
          status: 'pending',
        });
      }
      throw error;
    }
  } catch (error: any) {
    console.error('Check swap confirmation error:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
