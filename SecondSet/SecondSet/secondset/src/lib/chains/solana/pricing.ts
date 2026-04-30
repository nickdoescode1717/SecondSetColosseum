/**
 * USD Pricing Service for Solana assets
 * Uses CoinGecko free API (same pattern as EVM pricing)
 */

export interface SolanaAssetPrices {
  sol: number;
  usdc: number;
}

// Cache prices to avoid hitting rate limits
let priceCache: { prices: SolanaAssetPrices; timestamp: number } | null = null;
const CACHE_TTL_MS = 60 * 1000; // 1 minute cache

export async function getSolanaAssetPrices(): Promise<SolanaAssetPrices> {
  if (priceCache && Date.now() - priceCache.timestamp < CACHE_TTL_MS) {
    return priceCache.prices;
  }

  try {
    const response = await fetch(
      'https://api.coingecko.com/api/v3/simple/price?ids=solana,usd-coin&vs_currencies=usd',
      {
        headers: { 'Accept': 'application/json' },
        next: { revalidate: 60 },
      }
    );

    if (!response.ok) {
      console.warn(`CoinGecko API returned ${response.status}, using fallback Solana prices`);
      throw new Error(`CoinGecko API error: ${response.status}`);
    }

    const data = await response.json();

    const prices: SolanaAssetPrices = {
      sol: data.solana?.usd || 0,
      usdc: data['usd-coin']?.usd || 1.0,
    };

    priceCache = { prices, timestamp: Date.now() };
    return prices;
  } catch (error) {
    console.error('Error fetching Solana asset prices, using fallback:', error);

    const fallbackPrices: SolanaAssetPrices = {
      sol: 150,
      usdc: 1.0,
    };

    priceCache = { prices: fallbackPrices, timestamp: Date.now() };
    return fallbackPrices;
  }
}

export async function calculateSolanaUSDValue(balances: {
  sol: string;
  usdc: string;
}): Promise<{
  solUsd: number;
  usdcUsd: number;
  totalUsd: number;
}> {
  const prices = await getSolanaAssetPrices();

  const solUsd = parseFloat(balances.sol) * prices.sol;
  const usdcUsd = parseFloat(balances.usdc) * prices.usdc;
  const totalUsd = solUsd + usdcUsd;

  return { solUsd, usdcUsd, totalUsd };
}
