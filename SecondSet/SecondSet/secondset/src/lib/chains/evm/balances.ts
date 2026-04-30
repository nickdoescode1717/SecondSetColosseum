import { createPublicClient, http, formatUnits, Address } from 'viem';
import { mainnet, base, sepolia, baseSepolia } from 'viem/chains';
import { SupportedChain } from './builder';
import { getTokenAddress } from './tokens';

// ERC-20 ABI for balance checking
const ERC20_ABI = [
  {
    name: 'balanceOf',
    type: 'function',
    stateMutability: 'view',
    inputs: [{ name: 'account', type: 'address' }],
    outputs: [{ name: '', type: 'uint256' }],
  },
  {
    name: 'decimals',
    type: 'function',
    stateMutability: 'view',
    inputs: [],
    outputs: [{ name: '', type: 'uint8' }],
  },
] as const;

// Zero address sentinel for tokens not available on a chain
const ZERO_ADDR = '0x0000000000000000000000000000000000000000';

const CHAIN_CONFIG = {
  ethereum: {
    chain: mainnet,
    usdcAddress: getTokenAddress('USDC', 'ethereum')!,
    usdtAddress: getTokenAddress('USDT', 'ethereum')!,
    eurcAddress: getTokenAddress('EURC', 'ethereum')!,
    rpcUrl: process.env.ETHEREUM_RPC_URL!,
  },
  sepolia: {
    chain: sepolia,
    usdcAddress: getTokenAddress('USDC', 'sepolia')!,
    usdtAddress: getTokenAddress('USDT', 'sepolia')!,
    eurcAddress: getTokenAddress('EURC', 'sepolia') || ZERO_ADDR,
    rpcUrl: process.env.SEPOLIA_RPC_URL || process.env.ETHEREUM_RPC_URL!,
  },
  base: {
    chain: base,
    usdcAddress: getTokenAddress('USDC', 'base')!,
    usdtAddress: getTokenAddress('USDT', 'base')!,
    eurcAddress: getTokenAddress('EURC', 'base')!,
    rpcUrl: process.env.BASE_RPC_URL!,
  },
  'base-sepolia': {
    chain: baseSepolia,
    usdcAddress: getTokenAddress('USDC', 'base-sepolia')!,
    usdtAddress: getTokenAddress('USDT', 'base-sepolia') || ZERO_ADDR,
    eurcAddress: getTokenAddress('EURC', 'base-sepolia') || ZERO_ADDR,
    rpcUrl: process.env.BASE_SEPOLIA_RPC_URL || process.env.BASE_RPC_URL!,
  },
};

export interface WalletBalances {
  eth: string;
  ethRaw: bigint;
  usdc: string;
  usdcRaw: bigint;
  usdt: string;
  usdtRaw: bigint;
  eurc: string;
  eurcRaw: bigint;
}

/**
 * Fetch balance for a specific token
 */
async function getTokenBalance(
  client: any,
  tokenAddress: string,
  walletAddress: string,
  decimals: number = 6
): Promise<{ formatted: string; raw: bigint }> {
  // Skip if address is zero (token doesn't exist on this chain)
  if (tokenAddress === '0x0000000000000000000000000000000000000000') {
    return { formatted: '0', raw: 0n };
  }

  try {
    const balance = await client.readContract({
      address: tokenAddress as Address,
      abi: ERC20_ABI,
      functionName: 'balanceOf',
      args: [walletAddress as Address],
    });

    return {
      formatted: formatUnits(balance as bigint, decimals),
      raw: balance as bigint,
    };
  } catch (error) {
    console.error(`Error fetching balance for ${tokenAddress}:`, error);
    return { formatted: '0', raw: 0n };
  }
}

/**
 * Fetch ETH and stablecoin balances for a wallet
 */
export async function getWalletBalances(
  chainName: SupportedChain,
  walletAddress: string
): Promise<WalletBalances> {
  const config = CHAIN_CONFIG[chainName];
  if (!config) {
    throw new Error(`Unsupported chain: ${chainName}`);
  }

  const { chain, usdcAddress, usdtAddress, eurcAddress, rpcUrl } = config;

  // Create public client
  const client = createPublicClient({
    chain,
    transport: http(rpcUrl),
  });

  try {
    // Fetch ETH balance
    const ethBalance = await client.getBalance({
      address: walletAddress as Address,
    });

    // Fetch all stablecoin balances in parallel
    const [usdcBalance, usdtBalance, eurcBalance] = await Promise.all([
      getTokenBalance(client, usdcAddress, walletAddress, 6),
      getTokenBalance(client, usdtAddress, walletAddress, 6),
      getTokenBalance(client, eurcAddress, walletAddress, 6),
    ]);

    return {
      eth: formatUnits(ethBalance, 18),
      ethRaw: ethBalance,
      usdc: usdcBalance.formatted,
      usdcRaw: usdcBalance.raw,
      usdt: usdtBalance.formatted,
      usdtRaw: usdtBalance.raw,
      eurc: eurcBalance.formatted,
      eurcRaw: eurcBalance.raw,
    };
  } catch (error) {
    console.error('Error fetching balances:', error);
    // Return zeros on error
    return {
      eth: '0',
      ethRaw: 0n,
      usdc: '0',
      usdcRaw: 0n,
      usdt: '0',
      usdtRaw: 0n,
      eurc: '0',
      eurcRaw: 0n,
    };
  }
}

/**
 * Fetch balances for multiple vaults
 */
export async function getMultipleWalletBalances(
  vaults: Array<{ chainName: SupportedChain; address: string }>
): Promise<Map<string, WalletBalances>> {
  const balances = new Map<string, WalletBalances>();

  // Fetch all balances in parallel
  await Promise.all(
    vaults.map(async (vault) => {
      try {
        const balance = await getWalletBalances(vault.chainName, vault.address);
        balances.set(vault.address, balance);
      } catch (error) {
        console.error(`Error fetching balance for ${vault.address}:`, error);
        // Set zero balance on error
        balances.set(vault.address, {
          eth: '0',
          ethRaw: 0n,
          usdc: '0',
          usdcRaw: 0n,
          usdt: '0',
          usdtRaw: 0n,
          eurc: '0',
          eurcRaw: 0n,
        });
      }
    })
  );

  return balances;
}