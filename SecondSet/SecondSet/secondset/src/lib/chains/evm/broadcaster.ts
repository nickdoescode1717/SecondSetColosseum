import { createPublicClient, http, Hash } from 'viem';
import { mainnet, base, sepolia, baseSepolia } from 'viem/chains';
import { SupportedChain, getExplorerUrl } from './builder';

const CHAIN_CONFIG = {
  ethereum: { chain: mainnet, rpcUrl: process.env.ETHEREUM_RPC_URL! },
  sepolia: { chain: sepolia, rpcUrl: process.env.SEPOLIA_RPC_URL || process.env.ETHEREUM_RPC_URL! },
  base: { chain: base, rpcUrl: process.env.BASE_RPC_URL! },
  'base-sepolia': { chain: baseSepolia, rpcUrl: process.env.BASE_SEPOLIA_RPC_URL || process.env.BASE_RPC_URL! },
};

/**
 * Broadcast a signed transaction to the blockchain
 *
 * Transaction signing happens via CoordinatorClient with mobile signers (2-of-3 threshold)
 * This function only broadcasts the already-signed transaction
 */
export async function broadcastSignedTransaction(params: {
  chainName: SupportedChain;
  signedTx: string; // Serialized signed transaction from coordinator
}): Promise<{ txHash: Hash; explorerUrl: string }> {
  const { chainName, signedTx } = params;

  const config = CHAIN_CONFIG[chainName];
  if (!config) {
    throw new Error(`Unsupported chain: ${chainName}`);
  }

  const { chain, rpcUrl } = config;

  const publicClient = createPublicClient({
    chain,
    transport: http(rpcUrl),
  });

  // Broadcast the signed transaction
  const txHash = await publicClient.sendRawTransaction({
    serializedTransaction: signedTx as `0x${string}`,
  });

  const explorerUrl = getExplorerUrl(chainName, txHash);

  return { txHash, explorerUrl };
}

/**
 * Check transaction confirmation status
 */
export async function checkTransactionConfirmation(params: {
  chainName: SupportedChain;
  txHash: string;
  requiredConfirmations?: number;
}): Promise<{
  confirmed: boolean;
  confirmations: number;
  status: 'success' | 'reverted' | 'pending';
}> {
  const { chainName, txHash, requiredConfirmations = 12 } = params;

  const config = CHAIN_CONFIG[chainName];
  if (!config) {
    throw new Error(`Unsupported chain: ${chainName}`);
  }

  const { chain, rpcUrl } = config;

  const publicClient = createPublicClient({
    chain,
    transport: http(rpcUrl),
  });

  // Get transaction receipt - viem throws TransactionReceiptNotFoundError
  // if the transaction hasn't been mined yet
  let receipt;
  try {
    receipt = await publicClient.getTransactionReceipt({
      hash: txHash as `0x${string}`,
    });
  } catch (err: any) {
    if (err.name === 'TransactionReceiptNotFoundError') {
      return {
        confirmed: false,
        confirmations: 0,
        status: 'pending',
      };
    }
    throw err;
  }

  // Get current block number
  const currentBlock = await publicClient.getBlockNumber();
  const confirmations = Number(currentBlock - receipt.blockNumber);

  return {
    confirmed: confirmations >= requiredConfirmations,
    confirmations,
    status: receipt.status === 'success' ? 'success' : 'reverted',
  };
}

// Re-export SupportedChain type for convenience
export type { SupportedChain } from './builder';