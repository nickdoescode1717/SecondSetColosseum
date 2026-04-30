import { createPublicClient, http, parseAbiItem, formatUnits, Address } from 'viem';
import { mainnet, base, sepolia, baseSepolia } from 'viem/chains';
import { SupportedChain } from './builder';
import { getTokenAddress, EVM_TOKENS } from './tokens';

const ZERO_ADDR = '0x0000000000000000000000000000000000000000';

const CHAIN_CONFIG = {
  ethereum: {
    chain: mainnet,
    rpcUrl: process.env.ETHEREUM_RPC_URL!,
  },
  sepolia: {
    chain: sepolia,
    rpcUrl: process.env.SEPOLIA_RPC_URL || process.env.ETHEREUM_RPC_URL!,
  },
  base: {
    chain: base,
    rpcUrl: process.env.BASE_RPC_URL!,
  },
  'base-sepolia': {
    chain: baseSepolia,
    rpcUrl: process.env.BASE_SEPOLIA_RPC_URL || process.env.BASE_RPC_URL!,
  },
};

const TRANSFER_EVENT = parseAbiItem(
  'event Transfer(address indexed from, address indexed to, uint256 value)'
);

export interface EVMIncomingTransfer {
  txHash: string;
  fromAddress: string;
  asset: string;
  amount: string;
  amountRaw: string;
  blockNumber: bigint;
}

/**
 * Scan an EVM vault address for incoming ERC-20 token transfers (USDC, USDT, EURC).
 * Note: native ETH transfers are not included (no Transfer event for native ETH).
 */
export async function scanEVMIncomingTransfers(
  chainName: SupportedChain,
  vaultAddress: string,
  fromBlock: bigint
): Promise<EVMIncomingTransfer[]> {
  const config = CHAIN_CONFIG[chainName];
  if (!config) {
    throw new Error(`Unsupported chain: ${chainName}`);
  }

  const client = createPublicClient({
    chain: config.chain,
    transport: http(config.rpcUrl),
  });

  // Gather token contracts to scan on this chain
  const tokensToScan: Array<{ symbol: string; address: Address; decimals: number }> = [];
  for (const [symbol, tokenConfig] of Object.entries(EVM_TOKENS)) {
    if (symbol === 'ETH') continue; // native asset, no Transfer event
    const addr = getTokenAddress(symbol, chainName);
    if (!addr || addr === ZERO_ADDR) continue;
    tokensToScan.push({ symbol, address: addr, decimals: tokenConfig.decimals });
  }

  // Scan all tokens in parallel
  const results = await Promise.all(
    tokensToScan.map(async ({ symbol, address, decimals }) => {
      try {
        const logs = await client.getLogs({
          address,
          event: TRANSFER_EVENT,
          args: { to: vaultAddress as Address },
          fromBlock,
          toBlock: 'latest',
        });

        return logs.map((log): EVMIncomingTransfer => ({
          txHash: log.transactionHash ?? '',
          fromAddress: (log.args.from as string) ?? '',
          asset: symbol,
          amount: formatUnits(log.args.value as bigint, decimals),
          amountRaw: (log.args.value as bigint).toString(),
          blockNumber: log.blockNumber ?? 0n,
        }));
      } catch (err) {
        console.error(`[EVM incoming] Error scanning ${symbol} on ${chainName}:`, err);
        return [];
      }
    })
  );

  return results.flat().filter(t => t.txHash !== '');
}
