import { NextResponse } from 'next/server';
import { requireRoles } from '@/lib/rbac';
import { prisma } from '@/lib/db';
import { createAuditEvent } from '@/lib/audit';
import { resolveVaultChain } from '@/lib/chains/utils';
import { scanEVMIncomingTransfers } from '@/lib/chains/evm/incoming';
import { scanSolanaIncomingTransfers } from '@/lib/chains/solana/incoming';
import { SupportedChain } from '@/lib/chains/evm/builder';
import { createPublicClient, http } from 'viem';
import { mainnet, base, sepolia, baseSepolia } from 'viem/chains';

// Default lookback for EVM vaults that have never been scanned (≈ 4 hours on Ethereum, ~50 min on Base)
const EVM_DEFAULT_LOOKBACK = 1000n;

const EVM_CHAIN_RPC: Record<string, { chain: any; rpcUrl: string }> = {
  ethereum: { chain: mainnet, rpcUrl: process.env.ETHEREUM_RPC_URL! },
  sepolia: { chain: sepolia, rpcUrl: process.env.SEPOLIA_RPC_URL || process.env.ETHEREUM_RPC_URL! },
  base: { chain: base, rpcUrl: process.env.BASE_RPC_URL! },
  'base-sepolia': { chain: baseSepolia, rpcUrl: process.env.BASE_SEPOLIA_RPC_URL || process.env.BASE_RPC_URL! },
};

interface VaultScanResult {
  vaultId: string;
  address: string;
  found: number;
  newRecords: number;
  error?: string;
}

export async function POST() {
  try {
    const user = await requireRoles(['ADMIN']);

    const vaults = await prisma.vault.findMany({
      where: { orgId: user.orgId },
    });

    const vaultResults: VaultScanResult[] = [];
    let totalFound = 0;
    let totalNew = 0;

    for (const vault of vaults) {
      const resolvedChain = resolveVaultChain(vault.chain, vault.address);
      const chainName = vault.chainName ?? (resolvedChain === 'EVM' ? 'sepolia' : 'solana-devnet');

      const result: VaultScanResult = {
        vaultId: vault.id,
        address: vault.address,
        found: 0,
        newRecords: 0,
      };

      try {
        if (resolvedChain === 'EVM') {
          // Determine fromBlock
          let fromBlock: bigint;
          if (vault.lastCheckedBlock != null) {
            fromBlock = vault.lastCheckedBlock + 1n;
          } else {
            const config = EVM_CHAIN_RPC[chainName];
            if (!config) throw new Error(`No RPC config for chain: ${chainName}`);
            const client = createPublicClient({ chain: config.chain, transport: http(config.rpcUrl) });
            const currentBlock = await client.getBlockNumber();
            fromBlock = currentBlock > EVM_DEFAULT_LOOKBACK
              ? currentBlock - EVM_DEFAULT_LOOKBACK
              : 0n;
          }

          const transfers = await scanEVMIncomingTransfers(
            chainName as SupportedChain,
            vault.address,
            fromBlock
          );

          result.found = transfers.length;

          // Upsert each transfer
          let maxBlock = vault.lastCheckedBlock ?? fromBlock;
          for (const transfer of transfers) {
            const created = await upsertIncomingTx({
              orgId: user.orgId,
              vaultId: vault.id,
              txHash: transfer.txHash,
              fromAddress: transfer.fromAddress,
              asset: transfer.asset,
              amount: transfer.amount,
              amountRaw: transfer.amountRaw,
              chainName,
              blockNumber: transfer.blockNumber,
            });

            if (created) {
              result.newRecords++;
              await createAuditEvent({
                orgId: user.orgId,
                userId: user.id,
                eventType: 'PAYMENT_RECEIVED',
                metadata: {
                  txHash: transfer.txHash,
                  fromAddress: transfer.fromAddress,
                  asset: transfer.asset,
                  amount: transfer.amount,
                  chainName,
                  vaultId: vault.id,
                  vaultAddress: vault.address,
                  blockNumber: transfer.blockNumber.toString(),
                },
              });
            }

            if (transfer.blockNumber > maxBlock) maxBlock = transfer.blockNumber;
          }

          // Update checkpoint to the latest block seen (or the end of scan range)
          const config = EVM_CHAIN_RPC[chainName];
          if (config) {
            const client = createPublicClient({ chain: config.chain, transport: http(config.rpcUrl) });
            const currentBlock = await client.getBlockNumber();
            await prisma.vault.update({
              where: { id: vault.id },
              data: { lastCheckedBlock: currentBlock },
            });
          }
        } else {
          // Solana
          const transfers = await scanSolanaIncomingTransfers(
            chainName,
            vault.address,
            vault.lastCheckedSignature ?? undefined
          );

          result.found = transfers.length;

          for (const transfer of transfers) {
            const created = await upsertIncomingTx({
              orgId: user.orgId,
              vaultId: vault.id,
              txHash: transfer.txHash,
              fromAddress: transfer.fromAddress,
              asset: transfer.asset,
              amount: transfer.amount,
              amountRaw: transfer.amountRaw,
              chainName,
              blockNumber: null,
            });

            if (created) {
              result.newRecords++;
              await createAuditEvent({
                orgId: user.orgId,
                userId: user.id,
                eventType: 'PAYMENT_RECEIVED',
                metadata: {
                  txHash: transfer.txHash,
                  fromAddress: transfer.fromAddress,
                  asset: transfer.asset,
                  amount: transfer.amount,
                  chainName,
                  vaultId: vault.id,
                  vaultAddress: vault.address,
                },
              });
            }
          }

          // Update checkpoint to the most recent signature (first in list = newest)
          if (transfers.length > 0) {
            await prisma.vault.update({
              where: { id: vault.id },
              data: { lastCheckedSignature: transfers[0].txHash },
            });
          }
        }
      } catch (err) {
        console.error(`[check-incoming] Error scanning vault ${vault.address}:`, err);
        result.error = err instanceof Error ? err.message : String(err);
      }

      totalFound += result.found;
      totalNew += result.newRecords;
      vaultResults.push(result);
    }

    return NextResponse.json({
      scanned: vaults.length,
      found: totalFound,
      newRecords: totalNew,
      vaultResults,
    });
  } catch (error) {
    const msg = error instanceof Error ? error.message : 'Unknown error';
    return NextResponse.json({ error: msg }, { status: 401 });
  }
}

interface UpsertParams {
  orgId: string;
  vaultId: string;
  txHash: string;
  fromAddress: string;
  asset: string;
  amount: string;
  amountRaw: string;
  chainName: string;
  blockNumber: bigint | null;
}

/**
 * Attempt to insert an IncomingTransaction. Returns true if a new record was created,
 * false if it already existed (idempotent).
 */
async function upsertIncomingTx(params: UpsertParams): Promise<boolean> {
  const existing = await prisma.incomingTransaction.findUnique({
    where: {
      txHash_vaultId_asset: {
        txHash: params.txHash,
        vaultId: params.vaultId,
        asset: params.asset,
      },
    },
    select: { id: true },
  });

  if (existing) return false;

  await prisma.incomingTransaction.create({
    data: {
      orgId: params.orgId,
      vaultId: params.vaultId,
      txHash: params.txHash,
      fromAddress: params.fromAddress,
      asset: params.asset,
      amount: params.amount,
      amountRaw: params.amountRaw,
      chainName: params.chainName,
      blockNumber: params.blockNumber,
    },
  });

  return true;
}
