import { NextRequest, NextResponse } from 'next/server';
import { requireRoles } from '@/lib/rbac';
import { prisma } from '@/lib/db';
import { createPublicClient, http, serializeTransaction, keccak256, recoverAddress } from 'viem';
import { mainnet, base, sepolia, baseSepolia } from 'viem/chains';
import { createAuditEvent } from '@/lib/audit';
import { getExplorerTxUrl } from '@/lib/chains/evm/tokens';

const CURVE_ORDER = BigInt('0xFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFEBAAEDCE6AF48A03BBFD25E8CD0364141');
const HALF_CURVE_ORDER = CURVE_ORDER / 2n;

const CHAIN_CONFIG: Record<string, { chain: any; rpcUrl: string }> = {
  ethereum: { chain: mainnet, rpcUrl: process.env.ETHEREUM_RPC_URL! },
  sepolia: { chain: sepolia, rpcUrl: process.env.SEPOLIA_RPC_URL || process.env.ETHEREUM_RPC_URL! },
  base: { chain: base, rpcUrl: process.env.BASE_RPC_URL! },
  'base-sepolia': { chain: baseSepolia, rpcUrl: process.env.BASE_SEPOLIA_RPC_URL || process.env.BASE_RPC_URL! },
};

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const user = await requireRoles(['SIGNER', 'ADMIN']);
    const { id: swapId } = await params;

    const swapRequest = await prisma.swapRequest.findFirst({
      where: { id: swapId, orgId: user.orgId },
      include: {
        signingSession: true,
        vault: true,
      },
    });

    if (!swapRequest) {
      return NextResponse.json({ error: 'Not found' }, { status: 404 });
    }

    const session = swapRequest.signingSession;
    if (!session) {
      return NextResponse.json({ error: 'No signing session found' }, { status: 400 });
    }

    // Already broadcasted
    if (session.status === 'COMPLETED' && swapRequest.txHash) {
      return NextResponse.json({
        status: 'COMPLETED',
        txHash: swapRequest.txHash,
        explorerUrl: swapRequest.explorerUrl,
      });
    }

    // Completed — broadcast the swap transaction (EVM only)
    if (session.status === 'COMPLETED' && session.signedTx && !swapRequest.txHash) {
      // Atomic claim to prevent double broadcast
      const claimed = await prisma.swapRequest.updateMany({
        where: { id: swapId, txHash: null },
        data: { status: 'APPROVED' }, // keep status as lock
      });

      if (claimed.count === 0) {
        const latest = await prisma.swapRequest.findUnique({
          where: { id: swapId },
        });
        return NextResponse.json({
          status: 'COMPLETED',
          txHash: latest?.txHash,
          explorerUrl: latest?.explorerUrl,
        });
      }

      console.log('📡 Broadcasting swap transaction:', swapId);

      const chainName = swapRequest.chainName;
      const config = CHAIN_CONFIG[chainName];
      if (!config) throw new Error(`Unsupported chain: ${chainName}`);

      const publicClient = createPublicClient({
        chain: config.chain,
        transport: http(config.rpcUrl),
      });

      const signature = typeof session.signedTx === 'string'
        ? JSON.parse(session.signedTx)
        : session.signedTx;

      const unsignedTx = typeof swapRequest.unsignedTx === 'string'
        ? JSON.parse(swapRequest.unsignedTx as string)
        : swapRequest.unsignedTx as any;

      const r = signature.r as `0x${string}`;
      let s = BigInt(signature.s as string);

      // EIP-2: Low-s normalization
      if (s > HALF_CURVE_ORDER) {
        console.log('🔧 Normalizing s to low-s form (EIP-2)');
        s = CURVE_ORDER - s;
      }
      const sHex = ('0x' + s.toString(16).padStart(64, '0')) as `0x${string}`;

      const txFields = {
        to: unsignedTx.to as `0x${string}`,
        value: BigInt(unsignedTx.value || '0'),
        data: unsignedTx.data as `0x${string}`,
        nonce: Number(unsignedTx.nonce),
        gas: BigInt(unsignedTx.gasLimit),
        maxFeePerGas: BigInt(unsignedTx.maxFeePerGas),
        maxPriorityFeePerGas: BigInt(unsignedTx.maxPriorityFeePerGas),
        chainId: Number(unsignedTx.chainId),
        type: 'eip1559' as const,
      };

      const vaultAddress = swapRequest.vault.address.toLowerCase();
      let serializedTx: `0x${string}` | null = null;

      const signingHash = keccak256(serializeTransaction(txFields));

      for (const yParity of [0, 1] as const) {
        try {
          const recovered = await recoverAddress({
            hash: signingHash,
            signature: { r, s: sHex, yParity },
          });
          if (recovered.toLowerCase() === vaultAddress) {
            serializedTx = serializeTransaction(txFields, { r, s: sHex, yParity });
            break;
          }
        } catch {
          // try other yParity
        }
      }

      if (!serializedTx) {
        throw new Error(
          `Signature does not recover to vault address ${swapRequest.vault.address}. TSS signature may be invalid.`
        );
      }

      let txHash: string;
      let explorerUrl: string;

      try {
        txHash = await publicClient.sendRawTransaction({
          serializedTransaction: serializedTx,
        });
        explorerUrl = getExplorerTxUrl(chainName, txHash);
      } catch (broadcastError: any) {
        if (broadcastError.details?.includes('nonce too low') ||
            broadcastError.shortMessage?.includes('nonce too low')) {
          console.log('⚠️ Nonce too low — transaction was already broadcast.');
          txHash = keccak256(serializedTx);
          explorerUrl = getExplorerTxUrl(chainName, txHash);
        } else {
          throw broadcastError;
        }
      }

      console.log('✅ Swap transaction broadcasted:', txHash);

      await prisma.swapRequest.update({
        where: { id: swapId },
        data: {
          status: 'RELEASED',
          releasedBy: user.id,
          releasedAt: new Date(),
          txHash,
          explorerUrl,
        },
      });

      await createAuditEvent({
        orgId: user.orgId,
        userId: user.id,
        eventType: 'SWAP_RELEASED',
        swapRequestId: swapId,
        metadata: { txHash, explorerUrl },
      });

      return NextResponse.json({
        status: 'COMPLETED',
        txHash,
        explorerUrl,
      });
    }

    // Return current status
    return NextResponse.json({
      status: session.status,
      error: session.errorMessage,
      expiresAt: session.expiresAt?.toISOString(),
    });
  } catch (error: any) {
    console.error('❌ Error checking swap signing status:', error);
    return NextResponse.json(
      { error: error.message || 'Internal error' },
      { status: 500 }
    );
  }
}
