import { createWalletClient, http, serializeTransaction } from 'viem';
import { privateKeyToAccount } from 'viem/accounts';
import { mainnet, base, sepolia, baseSepolia } from 'viem/chains';
import { SupportedChain } from './builder';

const CHAIN_CONFIG = {
  ethereum: { chain: mainnet, rpcUrl: process.env.ETHEREUM_RPC_URL! },
  sepolia: { chain: sepolia, rpcUrl: process.env.SEPOLIA_RPC_URL || process.env.ETHEREUM_RPC_URL! },
  base: { chain: base, rpcUrl: process.env.BASE_RPC_URL! },
  'base-sepolia': { chain: baseSepolia, rpcUrl: process.env.BASE_SEPOLIA_RPC_URL || process.env.BASE_RPC_URL! },
};

/**
 * Sign a transaction using TEST_SIGNER_PRIVATE_KEY (development only)
 *
 * WARNING: This is for development/testing only. Production should use
 * CoordinatorClient with mobile signers and threshold signatures.
 */
export async function signTransactionWithTestKey(params: {
  chainName: SupportedChain;
  unsignedTx: any;
}): Promise<string> {
  const { chainName, unsignedTx } = params;

  const privateKey = process.env.TEST_SIGNER_PRIVATE_KEY;

  if (!privateKey) {
    throw new Error('TEST_SIGNER_PRIVATE_KEY not configured');
  }

  const config = CHAIN_CONFIG[chainName];
  if (!config) {
    throw new Error(`Unsupported chain: ${chainName}`);
  }

  const { chain, rpcUrl } = config;

  // Create account from private key
  const account = privateKeyToAccount(privateKey as `0x${string}`);

  // Create wallet client
  const walletClient = createWalletClient({
    account,
    chain,
    transport: http(rpcUrl),
  });

  // Sign the transaction
  const signedTx = await walletClient.signTransaction({
    to: unsignedTx.to as `0x${string}`,
    data: unsignedTx.data as `0x${string}`,
    value: BigInt(unsignedTx.value || '0'),
    gas: BigInt(unsignedTx.gasLimit),
    maxFeePerGas: BigInt(unsignedTx.maxFeePerGas),
    maxPriorityFeePerGas: BigInt(unsignedTx.maxPriorityFeePerGas),
    nonce: unsignedTx.nonce,
    chainId: chain.id,
  });

  return signedTx;
}

/**
 * Check if test signer mode is available
 */
export function isTestSignerAvailable(): boolean {
  return !!process.env.TEST_SIGNER_PRIVATE_KEY;
}
