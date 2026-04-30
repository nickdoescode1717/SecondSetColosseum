import { Address } from 'viem';

/**
 * Centralized EVM token registry.
 * Single source of truth for token addresses, decimals, and swap eligibility.
 */

export interface TokenConfig {
  symbol: string;
  name: string;
  decimals: number;
  /** Contract address per chain. null = not available on that chain. */
  addresses: Record<string, Address | null>;
  isStablecoin: boolean;
  /** Whether this token can participate in Uniswap swaps */
  swapEnabled: boolean;
}

export const EVM_TOKENS: Record<string, TokenConfig> = {
  ETH: {
    symbol: 'ETH',
    name: 'Ether',
    decimals: 18,
    isStablecoin: false,
    swapEnabled: false,
    addresses: {
      ethereum: null, // native asset, no contract
      sepolia: null,
      base: null,
      'base-sepolia': null,
    },
  },
  USDC: {
    symbol: 'USDC',
    name: 'USD Coin',
    decimals: 6,
    isStablecoin: true,
    swapEnabled: true,
    addresses: {
      ethereum: '0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48',
      sepolia: '0x1c7D4B196Cb0C7B01d743Fbc6116a902379C7238',
      base: '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913',
      'base-sepolia': '0x036CbD53842c5426634e7929541eC2318f3dCF7e',
    },
  },
  USDT: {
    symbol: 'USDT',
    name: 'Tether USD',
    decimals: 6,
    isStablecoin: true,
    swapEnabled: true,
    addresses: {
      ethereum: '0xdAC17F958D2ee523a2206206994597C13D831ec7',
      sepolia: '0x7169D38820dfd117C3FA1f22a697dBA58d90BA06',
      base: '0xfde4C96c8593536E31F229EA8f37b2ADa2699bb2',
      'base-sepolia': null,
    },
  },
  EURC: {
    symbol: 'EURC',
    name: 'Euro Coin',
    decimals: 6,
    isStablecoin: true,
    swapEnabled: true,
    addresses: {
      ethereum: '0x1aBaEA1f7C830BD89Acc67eC4af516284b1bC33c',
      sepolia: '0x08210F9170F89Ab7658F0B5E3fF39b0E03C594D4',
      base: '0x60a3E35Cc302bFA44Cb288Bc5a4F316Fdb1adb42',
      'base-sepolia': null,
    },
  },
};

/** Uniswap Universal Router addresses per chain */
export const UNISWAP_ROUTER_ADDRESSES: Record<string, Address> = {
  ethereum: '0x3fC91A3afd70395Cd496C647d5a6CC9D4B2b7FAD',
  sepolia: '0x3fC91A3afd70395Cd496C647d5a6CC9D4B2b7FAD',
  base: '0x3fC91A3afd70395Cd496C647d5a6CC9D4B2b7FAD',
};

/** Chains where Uniswap swaps are supported */
export const SWAP_SUPPORTED_CHAINS = ['ethereum', 'sepolia', 'base'] as const;

/** Block explorer base URLs per chain */
export const EXPLORER_URLS: Record<string, string> = {
  ethereum: 'https://etherscan.io',
  sepolia: 'https://sepolia.etherscan.io',
  base: 'https://basescan.org',
  'base-sepolia': 'https://sepolia.basescan.org',
};

/**
 * Get tokens that are eligible for swaps on a given chain.
 * Returns only tokens where swapEnabled=true AND the token has an address on that chain.
 */
export function getSwappableTokens(chainName: string): TokenConfig[] {
  return Object.values(EVM_TOKENS).filter(
    (t) => t.swapEnabled && t.addresses[chainName] != null
  );
}

/**
 * Get a token's contract address on a specific chain.
 * Returns null if the token doesn't exist on that chain.
 */
export function getTokenAddress(symbol: string, chainName: string): Address | null {
  const token = EVM_TOKENS[symbol];
  if (!token) return null;
  return token.addresses[chainName] ?? null;
}

/**
 * Look up a token by its contract address on a given chain.
 */
export function getTokenByAddress(address: string, chainName: string): TokenConfig | null {
  const normalized = address.toLowerCase();
  for (const token of Object.values(EVM_TOKENS)) {
    const tokenAddr = token.addresses[chainName];
    if (tokenAddr && tokenAddr.toLowerCase() === normalized) {
      return token;
    }
  }
  return null;
}

/**
 * Get the Uniswap Universal Router address for a chain.
 * Returns null if swaps are not supported on that chain.
 */
export function getUniswapRouterAddress(chainName: string): Address | null {
  return UNISWAP_ROUTER_ADDRESSES[chainName] ?? null;
}

/**
 * Check if Uniswap swaps are supported on a given chain.
 */
export function isSwapSupportedOnChain(chainName: string): boolean {
  return (SWAP_SUPPORTED_CHAINS as readonly string[]).includes(chainName);
}

/**
 * Get explorer URL for a transaction hash on a given chain.
 */
export function getExplorerTxUrl(chainName: string, txHash: string): string {
  const base = EXPLORER_URLS[chainName];
  if (!base) return '';
  return `${base}/tx/${txHash}`;
}

/**
 * Validate that both tokens in a pair are swappable stablecoins on the given chain.
 * Returns an error message or null if valid.
 */
export function validateSwapPair(
  fromSymbol: string,
  toSymbol: string,
  chainName: string
): string | null {
  if (fromSymbol === toSymbol) {
    return 'Cannot swap a token to itself';
  }

  const fromToken = EVM_TOKENS[fromSymbol];
  const toToken = EVM_TOKENS[toSymbol];

  if (!fromToken) return `Unknown token: ${fromSymbol}`;
  if (!toToken) return `Unknown token: ${toSymbol}`;

  if (!fromToken.isStablecoin) return `${fromSymbol} is not a stablecoin`;
  if (!toToken.isStablecoin) return `${toSymbol} is not a stablecoin`;

  if (!fromToken.swapEnabled) return `${fromSymbol} is not enabled for swaps`;
  if (!toToken.swapEnabled) return `${toSymbol} is not enabled for swaps`;

  if (!fromToken.addresses[chainName]) {
    return `${fromSymbol} is not available on ${chainName}`;
  }
  if (!toToken.addresses[chainName]) {
    return `${toSymbol} is not available on ${chainName}`;
  }

  if (!isSwapSupportedOnChain(chainName)) {
    return `Swaps are not supported on ${chainName}`;
  }

  return null;
}
