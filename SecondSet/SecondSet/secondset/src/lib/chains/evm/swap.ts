import { createPublicClient, http, encodeFunctionData, Address } from 'viem';
import { mainnet, base, sepolia, baseSepolia } from 'viem/chains';
import {
  getTokenAddress,
  getUniswapRouterAddress,
  isSwapSupportedOnChain,
  EVM_TOKENS,
  EXPLORER_URLS,
} from './tokens';
import type { SupportedChain, UnsignedEVMTransaction } from './builder';

// ─── Configuration ──────────────────────────────────────────────────────────

const UNISWAP_API_URL =
  process.env.UNISWAP_API_URL || 'https://trade-api.uniswap.org/v1';

const DEFAULT_SLIPPAGE_BPS = parseInt(
  process.env.UNISWAP_DEFAULT_SLIPPAGE_BPS || '50',
  10
);

const TX_DEADLINE_SECONDS = parseInt(
  process.env.UNISWAP_TX_DEADLINE_SECONDS || '1800',
  10
);

const QUOTE_DEVIATION_MAX_BPS = parseInt(
  process.env.UNISWAP_QUOTE_DEVIATION_MAX_BPS || '500',
  10
);

// ─── Chain config (reuses same pattern as builder.ts) ───────────────────────

const CHAIN_MAP: Record<string, { chain: any; rpcUrl: string; chainId: number }> = {
  ethereum: {
    chain: mainnet,
    rpcUrl: process.env.ETHEREUM_RPC_URL!,
    chainId: 1,
  },
  sepolia: {
    chain: sepolia,
    rpcUrl: process.env.SEPOLIA_RPC_URL || process.env.ETHEREUM_RPC_URL!,
    chainId: 11155111,
  },
  base: {
    chain: base,
    rpcUrl: process.env.BASE_RPC_URL!,
    chainId: 8453,
  },
  'base-sepolia': {
    chain: baseSepolia,
    rpcUrl: process.env.BASE_SEPOLIA_RPC_URL || process.env.BASE_RPC_URL!,
    chainId: 84532,
  },
};

// ─── ABI fragments ─────────────────────────────────────────────────────────

const ERC20_ABI = [
  {
    name: 'allowance',
    type: 'function',
    stateMutability: 'view',
    inputs: [
      { name: 'owner', type: 'address' },
      { name: 'spender', type: 'address' },
    ],
    outputs: [{ name: '', type: 'uint256' }],
  },
  {
    name: 'approve',
    type: 'function',
    stateMutability: 'nonpayable',
    inputs: [
      { name: 'spender', type: 'address' },
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

const MAX_UINT256 =
  115792089237316195423570985008687907853269984665640564039457584007913129639935n;

// ─── Types ──────────────────────────────────────────────────────────────────

export interface SwapQuote {
  amountIn: string;
  amountOut: string;
  amountOutMin: string;
  priceImpact: string;
  route: any;
  gasEstimate: string;
  estimatedGasFeeUsd: string;
  /** Not present in /quote response — populated after calling /swap */
  calldata: string;
  routerAddress: string;
  value: string;
  deadline: number;
  quoteId?: string;
  expiresAt: Date;
  /** Raw /quote API response — passed back to /swap to build the transaction */
  rawQuote: any;
}

export interface SwapTransactionParams {
  chainName: string;
  fromAddress: string;
  tokenIn: string;
  tokenOut: string;
  amountIn: string;
  slippageBps: number;
  deadline?: number;
}

// ─── Helper: create viem client ─────────────────────────────────────────────

function getClient(chainName: string) {
  const cfg = CHAIN_MAP[chainName];
  if (!cfg) throw new Error(`Unsupported chain: ${chainName}`);
  return createPublicClient({ chain: cfg.chain, transport: http(cfg.rpcUrl) });
}

// ─── Core functions ─────────────────────────────────────────────────────────

/**
 * Fetch a swap quote from the Uniswap API.
 * Requires UNISWAP_API_KEY environment variable.
 */
export async function getSwapQuote(
  params: SwapTransactionParams
): Promise<SwapQuote> {
  const apiKey = process.env.UNISWAP_API_KEY;
  if (!apiKey) {
    throw new Error(
      'Uniswap API key not configured. Set UNISWAP_API_KEY environment variable.'
    );
  }

  const cfg = CHAIN_MAP[params.chainName];
  if (!cfg) throw new Error(`Unsupported chain: ${params.chainName}`);

  if (!isSwapSupportedOnChain(params.chainName)) {
    throw new Error(`Swaps are not supported on ${params.chainName}`);
  }

  const routerAddress = getUniswapRouterAddress(params.chainName);
  if (!routerAddress) {
    throw new Error(`No Uniswap router configured for ${params.chainName}`);
  }

  const deadline =
    Math.floor(Date.now() / 1000) + (params.deadline || TX_DEADLINE_SECONDS);

  // Trade API expects slippage as a percentage (e.g. 0.5 for 0.5%), not a fraction
  const slippageTolerance = params.slippageBps / 100;

  const requestBody = {
    tokenInChainId: cfg.chainId,
    tokenOutChainId: cfg.chainId,
    tokenIn: params.tokenIn,
    tokenOut: params.tokenOut,
    amount: params.amountIn,
    type: 'EXACT_INPUT',
    swapper: params.fromAddress,
    slippageTolerance,
  };

  const response = await fetch(`${UNISWAP_API_URL}/quote`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': apiKey,
    },
    body: JSON.stringify(requestBody),
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(
      `Uniswap API error (${response.status}): ${errorText}`
    );
  }

  const data = await response.json();

  // Trading API v1 /quote response shape:
  // data.routing                          — routing strategy (CLASSIC, DUTCH_V2, etc.)
  // data.requestId                        — unique request ID
  // data.quote.output.amount              — output token amount (raw units)
  // data.quote.slippage.minOutput.amount  — minimum output after slippage
  // data.quote.priceImpact                — price impact as a number (e.g. 0.01 = 0.01%)
  // data.quote.gasFee.gasUseEstimate      — gas units estimate
  // data.quote.gasFee.quoteDecimals       — gas cost in USD (human-readable)
  // Calldata is NOT in the quote — it comes from a separate POST /swap call.
  const q = data.quote || {};

  const amountOut = q.output?.amount || '0';
  const amountOutMin =
    q.slippage?.minOutput?.amount ||
    calculateMinOutput(amountOut, params.slippageBps);

  const quote: SwapQuote = {
    amountIn: params.amountIn,
    amountOut,
    amountOutMin,
    priceImpact: q.priceImpact?.toString() || '0',
    route: data.routing || null,
    gasEstimate: q.gasFee?.gasUseEstimate || '0',
    estimatedGasFeeUsd: q.gasFee?.quoteDecimals || '0',
    calldata: '', // populated after calling /swap
    routerAddress,
    value: '0',  // populated after calling /swap
    deadline,
    quoteId: q.quoteId || data.requestId || undefined,
    expiresAt: new Date(Date.now() + 30 * 60 * 1000), // 30 min expiry
    rawQuote: data, // full response passed back to /swap to build the transaction
  };

  return quote;
}

/**
 * Convert a swap quote into an unsigned EIP-1559 transaction by calling
 * the Uniswap Trading API POST /swap endpoint.
 *
 * The /swap endpoint returns a complete TransactionRequest (to, from, data,
 * value, gasLimit, maxFeePerGas, maxPriorityFeePerGas). We fetch the nonce
 * from the chain and assemble the final UnsignedEVMTransaction.
 *
 * Docs: https://api-docs.uniswap.org/guides/integration_guide
 */
export async function getSwapTransaction(
  chainName: string,
  quote: SwapQuote
): Promise<UnsignedEVMTransaction> {
  const apiKey = process.env.UNISWAP_API_KEY;
  if (!apiKey) {
    throw new Error(
      'Uniswap API key not configured. Set UNISWAP_API_KEY environment variable.'
    );
  }

  const cfg = CHAIN_MAP[chainName];
  if (!cfg) throw new Error(`Unsupported chain: ${chainName}`);

  if (!quote.rawQuote) {
    throw new Error('Quote is missing rawQuote — cannot call /swap.');
  }

  const response = await fetch(`${UNISWAP_API_URL}/swap`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': apiKey,
    },
    // Send the full /quote response back as-is; optionally add deadline
    body: JSON.stringify({
      quote: quote.rawQuote,
      deadline: quote.deadline,
    }),
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Uniswap /swap API error (${response.status}): ${errorText}`);
  }

  const data = await response.json();

  // /swap response: { swap: { to, from, data, value, chainId, gasLimit,
  //                           maxFeePerGas, maxPriorityFeePerGas }, ... }
  const tx = data.swap || data;

  // Docs: "The data field must be a non-empty hex string (not '' or '0x')"
  if (!tx.data || tx.data === '' || tx.data === '0x') {
    throw new Error(
      'Uniswap /swap returned empty calldata. The swap cannot be executed.'
    );
  }

  const client = getClient(chainName);
  const fromAddress = tx.from as Address;

  const nonce = await client.getTransactionCount({ address: fromAddress });

  return {
    to: tx.to as Address,
    from: fromAddress,
    value: BigInt(tx.value || '0'),
    data: tx.data as `0x${string}`,
    nonce,
    // Apply a 20% gas buffer on top of Uniswap's estimate
    gasLimit: (BigInt(tx.gasLimit || '300000') * 120n) / 100n,
    maxFeePerGas: BigInt(tx.maxFeePerGas),
    maxPriorityFeePerGas: BigInt(tx.maxPriorityFeePerGas),
    chainId: tx.chainId || cfg.chainId,
    type: 2,
  };
}

/**
 * Check ERC-20 allowance for a spender.
 */
export async function checkTokenAllowance(
  chainName: string,
  tokenAddress: string,
  ownerAddress: string,
  spenderAddress: string
): Promise<bigint> {
  const client = getClient(chainName);

  const allowance = await client.readContract({
    address: tokenAddress as Address,
    abi: ERC20_ABI,
    functionName: 'allowance',
    args: [ownerAddress as Address, spenderAddress as Address],
  });

  return allowance as bigint;
}

/**
 * Check ERC-20 balance for an account.
 */
export async function checkTokenBalance(
  chainName: string,
  tokenAddress: string,
  ownerAddress: string
): Promise<bigint> {
  const client = getClient(chainName);

  const balance = await client.readContract({
    address: tokenAddress as Address,
    abi: ERC20_ABI,
    functionName: 'balanceOf',
    args: [ownerAddress as Address],
  });

  return balance as bigint;
}

/**
 * Build an unsigned ERC-20 approve transaction for the Uniswap Router.
 */
export async function buildApproveTransaction(
  chainName: string,
  tokenAddress: string,
  spenderAddress: string,
  ownerAddress: string,
  amount: bigint = MAX_UINT256
): Promise<UnsignedEVMTransaction> {
  const cfg = CHAIN_MAP[chainName];
  if (!cfg) throw new Error(`Unsupported chain: ${chainName}`);

  const client = getClient(chainName);

  const data = encodeFunctionData({
    abi: ERC20_ABI,
    functionName: 'approve',
    args: [spenderAddress as Address, amount],
  });

  const nonce = await client.getTransactionCount({
    address: ownerAddress as Address,
  });

  const gasEstimate = await client.estimateGas({
    account: ownerAddress as Address,
    to: tokenAddress as Address,
    data,
    value: 0n,
  });

  const feeData = await client.estimateFeesPerGas();
  const maxPriorityFeePerGas =
    ((feeData.maxPriorityFeePerGas || 0n) * 150n) / 100n;
  const maxFeePerGas = ((feeData.maxFeePerGas || 0n) * 120n) / 100n;

  return {
    to: tokenAddress as Address,
    from: ownerAddress as Address,
    value: 0n,
    data,
    nonce,
    gasLimit: (gasEstimate * 120n) / 100n,
    maxFeePerGas,
    maxPriorityFeePerGas,
    chainId: cfg.chainId,
    type: 2,
  };
}

// ─── Validation helpers ─────────────────────────────────────────────────────

/**
 * Validate that a fresh quote hasn't deviated too far from the original.
 * Returns an error message or null if acceptable.
 */
export function validateQuoteDeviation(
  originalExpectedOutput: string,
  freshAmountOut: string,
  maxDeviationBps: number = QUOTE_DEVIATION_MAX_BPS
): string | null {
  const original = BigInt(originalExpectedOutput);
  const fresh = BigInt(freshAmountOut);

  if (original === 0n) return null; // can't compare

  // Calculate percentage deviation: (original - fresh) / original * 10000
  const deviation =
    original > fresh
      ? ((original - fresh) * 10000n) / original
      : ((fresh - original) * 10000n) / original;

  if (deviation > BigInt(maxDeviationBps)) {
    const pct = (Number(deviation) / 100).toFixed(2);
    const maxPct = (maxDeviationBps / 100).toFixed(2);
    return `Quote has deviated ${pct}% from original (max allowed: ${maxPct}%). Please create a new swap request.`;
  }

  return null;
}

/**
 * Calculate minimum output given slippage in basis points.
 */
function calculateMinOutput(amountOut: string, slippageBps: number): string {
  const amount = BigInt(amountOut);
  const minAmount = (amount * BigInt(10000 - slippageBps)) / 10000n;
  return minAmount.toString();
}

/**
 * Re-export for convenience.
 */
export {
  isSwapSupportedOnChain,
  getUniswapRouterAddress,
  QUOTE_DEVIATION_MAX_BPS,
  DEFAULT_SLIPPAGE_BPS,
};
