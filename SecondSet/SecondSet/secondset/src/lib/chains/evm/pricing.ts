/**
 * USD Pricing Service for crypto assets
 * Uses CoinGecko free API (no key required, 10-30 calls/minute limit)
 */

export interface AssetPrices {
  eth: number;
  usdc: number;
  usdt: number;
  eurc: number;
}

// Cache prices to avoid hitting rate limits
let priceCache: { prices: AssetPrices; timestamp: number } | null = null;
const CACHE_TTL_MS = 60 * 1000; // 1 minute cache

/**
 * Fetch current USD prices for all supported assets
 */
export async function getAssetPrices(): Promise<AssetPrices> {
  // Return cached prices if still fresh
  if (priceCache && Date.now() - priceCache.timestamp < CACHE_TTL_MS) {
    return priceCache.prices;
  }

  try {
    // CoinGecko free API endpoint (no key required)
    const response = await fetch(
      'https://api.coingecko.com/api/v3/simple/price?ids=ethereum,usd-coin,tether,euro-coin&vs_currencies=usd',
      {
        headers: {
          'Accept': 'application/json',
        },
        next: { revalidate: 60 }, // Next.js cache for 60 seconds
      }
    );

    if (!response.ok) {
      console.warn(`CoinGecko API returned ${response.status}, using fallback prices`);
      throw new Error(`CoinGecko API error: ${response.status}`);
    }

    const data = await response.json();

    const prices: AssetPrices = {
      eth: data.ethereum?.usd || 0,
      usdc: data['usd-coin']?.usd || 1.0, // USDC should be ~$1
      usdt: data.tether?.usd || 1.0, // USDT should be ~$1
      eurc: data['euro-coin']?.usd || 1.1, // EURC pegged to EUR, ~$1.10
    };

    // Update cache
    priceCache = {
      prices,
      timestamp: Date.now(),
    };

    console.log('✅ Asset prices fetched:', prices);
    return prices;
  } catch (error) {
    console.error('⚠️  Error fetching asset prices, using fallback:', error);

    // Return fallback prices if API fails
    const fallbackPrices = {
      eth: 3000, // Fallback ETH price
      usdc: 1.0,
      usdt: 1.0,
      eurc: 1.1,
    };

    // Cache fallback prices to avoid repeated API failures
    priceCache = {
      prices: fallbackPrices,
      timestamp: Date.now(),
    };

    return fallbackPrices;
  }
}

/**
 * Calculate USD value of wallet balances
 */
export async function calculateWalletUSDValue(balances: {
  eth: string;
  usdc: string;
  usdt: string;
  eurc: string;
}): Promise<{
  ethUsd: number;
  usdcUsd: number;
  usdtUsd: number;
  eurcUsd: number;
  totalUsd: number;
}> {
  const prices = await getAssetPrices();

  const ethUsd = parseFloat(balances.eth) * prices.eth;
  const usdcUsd = parseFloat(balances.usdc) * prices.usdc;
  const usdtUsd = parseFloat(balances.usdt) * prices.usdt;
  const eurcUsd = parseFloat(balances.eurc) * prices.eurc;
  const totalUsd = ethUsd + usdcUsd + usdtUsd + eurcUsd;

  console.log('💰 Wallet USD Calculation:', {
    balances,
    prices,
    usdValues: { ethUsd, usdcUsd, usdtUsd, eurcUsd, totalUsd }
  });

  return {
    ethUsd,
    usdcUsd,
    usdtUsd,
    eurcUsd,
    totalUsd,
  };
}
