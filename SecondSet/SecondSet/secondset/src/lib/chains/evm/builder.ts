import { createPublicClient, http, encodeFunctionData, parseUnits, Address } from 'viem';
import { mainnet, base, sepolia, baseSepolia } from 'viem/chains';
import { getTokenAddress } from './tokens';

// ERC-20 transfer ABI
const ERC20_ABI = [
  {
    name: 'transfer',
    type: 'function',
    stateMutability: 'nonpayable',
    inputs: [
      { name: 'to', type: 'address' },
      { name: 'amount', type: 'uint256' },
    ],
    outputs: [{ name: '', type: 'bool' }],
  },
  {
    name: 'balanceOf',
    type: 'function',
    stateMutability: 'view',
    inputs: [{ name: 'account', type: 'address' }],
    outputs: [{ name: '', type: 'uint256' }],
  },
] as const;

const CHAIN_CONFIG = {
  ethereum: {
    chain: mainnet,
    usdcAddress: getTokenAddress('USDC', 'ethereum')!,
    rpcUrl: process.env.ETHEREUM_RPC_URL!,
  },
  sepolia: {
    chain: sepolia,
    usdcAddress: getTokenAddress('USDC', 'sepolia')!,
    rpcUrl: process.env.SEPOLIA_RPC_URL || process.env.ETHEREUM_RPC_URL!,
  },
  base: {
    chain: base,
    usdcAddress: getTokenAddress('USDC', 'base')!,
    rpcUrl: process.env.BASE_RPC_URL!,
  },
  'base-sepolia': {
    chain: baseSepolia,
    usdcAddress: getTokenAddress('USDC', 'base-sepolia')!,
    rpcUrl: process.env.BASE_SEPOLIA_RPC_URL || process.env.BASE_RPC_URL!,
  },
};

export type SupportedChain = keyof typeof CHAIN_CONFIG;

export interface UnsignedEVMTransaction {
  to: Address;
  from: Address;
  value: bigint;
  data: `0x${string}`;
  nonce: number;
  gasLimit: bigint;
  maxFeePerGas: bigint;
  maxPriorityFeePerGas: bigint;
  chainId: number;
  type: number;
}

/**
 * Build an unsigned USDC transfer transaction for EVM chains
 */
export async function buildEVMUSDCTransfer(params: {
  chainName: SupportedChain;
  fromAddress: string;
  toAddress: string;
  amountMinor: string; // Amount in minor units (6 decimals for USDC)
}): Promise<UnsignedEVMTransaction> {
  const { chainName, fromAddress, toAddress, amountMinor } = params;
  
  const config = CHAIN_CONFIG[chainName];
  if (!config) {
    throw new Error(`Unsupported chain: ${chainName}`);
  }

  const { chain, usdcAddress, rpcUrl } = config;

  // Create public client
  const client = createPublicClient({
    chain,
    transport: http(rpcUrl),
  });

  // 1. Encode USDC transfer calldata
  const data = encodeFunctionData({
    abi: ERC20_ABI,
    functionName: 'transfer',
    args: [toAddress as Address, BigInt(amountMinor)],
  });

  // 2. Get current nonce
  const nonce = await client.getTransactionCount({
    address: fromAddress as Address,
  });

  // 3. Estimate gas for the USDC transfer
  const gasEstimate = await client.estimateGas({
    account: fromAddress as Address,
    to: usdcAddress as Address,
    data,
    value: 0n,
  });

  // 4. Get current gas prices (EIP-1559)
  const feeData = await client.estimateFeesPerGas();

  // Bump fees to ensure fast inclusion:
  // - maxPriorityFeePerGas (tip): 50% buffer so validators prioritize us
  // - maxFeePerGas: 20% buffer to stay competitive across several blocks
  const maxPriorityFeePerGas = ((feeData.maxPriorityFeePerGas || 0n) * 150n) / 100n;
  const maxFeePerGas = ((feeData.maxFeePerGas || 0n) * 120n) / 100n;

  // 5. Check USDC balance (optional but recommended)
  const balance = await client.readContract({
    address: usdcAddress as Address,
    abi: ERC20_ABI,
    functionName: 'balanceOf',
    args: [fromAddress as Address],
  });

  if (balance < BigInt(amountMinor)) {
    throw new Error(
      `Insufficient USDC balance. Have: ${balance.toString()}, Need: ${amountMinor}`
    );
  }

  // 6. Build unsigned transaction
  const unsignedTx: UnsignedEVMTransaction = {
    to: usdcAddress as Address,
    from: fromAddress as Address,
    value: 0n, // No ETH sent, just USDC
    data,
    nonce,
    gasLimit: (gasEstimate * 120n) / 100n, // Add 20% buffer
    maxFeePerGas,
    maxPriorityFeePerGas,
    chainId: chain.id,
    type: 2, // EIP-1559
  };

  return unsignedTx;
}

/**
 * Build an unsigned ETH transfer transaction for EVM chains
 */
export async function buildEVMETHTransfer(params: {
  chainName: SupportedChain;
  fromAddress: string;
  toAddress: string;
  amountWei: string; // Amount in wei (18 decimals for ETH)
}): Promise<UnsignedEVMTransaction> {
  const { chainName, fromAddress, toAddress, amountWei } = params;

  const config = CHAIN_CONFIG[chainName];
  if (!config) {
    throw new Error(`Unsupported chain: ${chainName}`);
  }

  const { chain, rpcUrl } = config;

  // Create public client
  const client = createPublicClient({
    chain,
    transport: http(rpcUrl),
  });

  // 1. Get current nonce
  const nonce = await client.getTransactionCount({
    address: fromAddress as Address,
  });

  const value = BigInt(amountWei);

  // 2. Estimate gas for the ETH transfer (simple transfer, no data)
  const gasEstimate = await client.estimateGas({
    account: fromAddress as Address,
    to: toAddress as Address,
    value,
  });

  // 3. Get current gas prices (EIP-1559)
  const feeData = await client.estimateFeesPerGas();

  // Bump fees to ensure fast inclusion:
  // - maxPriorityFeePerGas (tip): 50% buffer so validators prioritize us
  // - maxFeePerGas: 20% buffer to stay competitive across several blocks
  const maxPriorityFeePerGas = ((feeData.maxPriorityFeePerGas || 0n) * 150n) / 100n;
  const maxFeePerGas = ((feeData.maxFeePerGas || 0n) * 120n) / 100n;

  // 4. Check ETH balance (optional but recommended)
  const balance = await client.getBalance({
    address: fromAddress as Address,
  });

  // Calculate total cost including gas
  const gasLimit = (gasEstimate * 120n) / 100n; // Add 20% buffer
  const maxGasCost = gasLimit * maxFeePerGas;
  const totalCost = value + maxGasCost;

  if (balance < totalCost) {
    throw new Error(
      `Insufficient ETH balance. Have: ${balance.toString()}, Need: ${totalCost.toString()} (${amountWei} + ${maxGasCost.toString()} gas)`
    );
  }

  // 5. Build unsigned transaction
  const unsignedTx: UnsignedEVMTransaction = {
    to: toAddress as Address,
    from: fromAddress as Address,
    value, // ETH amount to send
    data: '0x', // No calldata for simple ETH transfer
    nonce,
    gasLimit,
    maxFeePerGas,
    maxPriorityFeePerGas,
    chainId: chain.id,
    type: 2, // EIP-1559
  };

  return unsignedTx;
}

/**
 * Get explorer URL for a transaction
 */
export function getExplorerUrl(chainName: SupportedChain, txHash: string): string {
  const explorers: Record<SupportedChain, string> = {
    ethereum: `https://etherscan.io/tx/${txHash}`,
    sepolia: `https://sepolia.etherscan.io/tx/${txHash}`,
    base: `https://basescan.org/tx/${txHash}`,
    'base-sepolia': `https://sepolia.basescan.org/tx/${txHash}`,
  };

  return explorers[chainName] || '';
}

/**
 * Serialize transaction for canonical hash computation
 */
export function serializeTransactionForDigest(tx: UnsignedEVMTransaction): string {
  return JSON.stringify({
    to: tx.to,
    from: tx.from,
    value: tx.value.toString(),
    data: tx.data,
    nonce: tx.nonce,
    gasLimit: tx.gasLimit.toString(),
    maxFeePerGas: tx.maxFeePerGas.toString(),
    maxPriorityFeePerGas: tx.maxPriorityFeePerGas.toString(),
    chainId: tx.chainId,
    type: tx.type,
  });
}