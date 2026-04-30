import { Connection, PublicKey, LAMPORTS_PER_SOL } from '@solana/web3.js';

// USDC-SPL mint address (devnet)
const USDC_MINT_DEVNET = '4zMMC9srt5Ri5X14GAgXhaHii3GnPAEERYPJgZJDncDU';
// USDC-SPL mint address (mainnet)
const USDC_MINT_MAINNET = 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v';

const NETWORK_CONFIG: Record<string, { rpcUrl: string; usdcMint: string }> = {
  'solana-devnet': {
    rpcUrl: process.env.SOLANA_DEVNET_RPC_URL || 'https://api.devnet.solana.com',
    usdcMint: USDC_MINT_DEVNET,
  },
  'solana-mainnet': {
    rpcUrl: process.env.SOLANA_MAINNET_RPC_URL || 'https://api.mainnet-beta.solana.com',
    usdcMint: USDC_MINT_MAINNET,
  },
};

export interface SolanaWalletBalances {
  sol: string;
  solLamports: number;
  usdc: string;
  usdcRaw: number;
}

export async function getSolanaWalletBalances(
  address: string,
  network: string = 'solana-devnet'
): Promise<SolanaWalletBalances> {
  const config = NETWORK_CONFIG[network];
  if (!config) {
    throw new Error(`Unsupported Solana network: ${network}`);
  }

  const connection = new Connection(config.rpcUrl, 'confirmed');
  const pubkey = new PublicKey(address);

  console.log(`[Solana] Fetching balances for ${address} on ${network}, USDC mint: ${config.usdcMint}`);

  try {
    // Fetch SOL balance
    const lamports = await connection.getBalance(pubkey);
    const sol = (lamports / LAMPORTS_PER_SOL).toString();

    // Fetch USDC-SPL balance
    let usdcAmount = 0;
    try {
      const usdcMint = new PublicKey(config.usdcMint);
      const tokenAccounts = await connection.getParsedTokenAccountsByOwner(pubkey, {
        mint: usdcMint,
      });
      for (const account of tokenAccounts.value) {
        const info = account.account.data.parsed?.info;
        if (info?.tokenAmount) {
          usdcAmount += parseFloat(info.tokenAmount.uiAmountString || '0');
        }
      }
    } catch (err) {
      console.error('Error fetching USDC-SPL balance:', err);
    }

    return {
      sol,
      solLamports: lamports,
      usdc: usdcAmount.toString(),
      usdcRaw: usdcAmount,
    };
  } catch (error) {
    console.error(`Error fetching Solana balances for ${address} on ${network}:`, error);
    return { sol: '0', solLamports: 0, usdc: '0', usdcRaw: 0 };
  }
}

export async function getMultipleSolanaWalletBalances(
  vaults: Array<{ address: string; network?: string }>
): Promise<Map<string, SolanaWalletBalances>> {
  const balances = new Map<string, SolanaWalletBalances>();

  await Promise.all(
    vaults.map(async (vault) => {
      try {
        const balance = await getSolanaWalletBalances(vault.address, vault.network || 'solana-devnet');
        balances.set(vault.address, balance);
      } catch (error) {
        console.error(`Error fetching Solana balance for ${vault.address}:`, error);
        balances.set(vault.address, { sol: '0', solLamports: 0, usdc: '0', usdcRaw: 0 });
      }
    })
  );

  return balances;
}
