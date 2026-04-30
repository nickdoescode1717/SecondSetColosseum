import { Connection, PublicKey, LAMPORTS_PER_SOL } from '@solana/web3.js';

const USDC_MINT_DEVNET = '4zMMC9srt5Ri5X14GAgXhaHii3GnPAEERYPJgZJDncDU';
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

export interface SolanaIncomingTransfer {
  txHash: string;
  fromAddress: string;
  asset: 'SOL' | 'USDC';
  amount: string;
  amountRaw: string;
}

/**
 * Scan a Solana vault address for incoming SOL and USDC-SPL transfers.
 * @param lastSignature - The most recently processed signature (exclusive upper bound).
 *   Pass undefined to fetch the latest 100 transactions.
 */
export async function scanSolanaIncomingTransfers(
  network: string,
  vaultAddress: string,
  lastSignature?: string
): Promise<SolanaIncomingTransfer[]> {
  const config = NETWORK_CONFIG[network];
  if (!config) {
    throw new Error(`Unsupported Solana network: ${network}`);
  }

  const connection = new Connection(config.rpcUrl, 'confirmed');
  const pubkey = new PublicKey(vaultAddress);
  const usdcMint = config.usdcMint;

  // Fetch up to 100 recent signatures, stopping before lastSignature
  const sigInfos = await connection.getSignaturesForAddress(pubkey, {
    until: lastSignature,
    limit: 100,
  });

  if (sigInfos.length === 0) return [];

  const transfers: SolanaIncomingTransfer[] = [];

  // Process each transaction
  await Promise.all(
    sigInfos.map(async ({ signature, err }) => {
      // Skip failed transactions
      if (err) return;

      try {
        const tx = await connection.getParsedTransaction(signature, {
          maxSupportedTransactionVersion: 0,
          commitment: 'confirmed',
        });
        if (!tx || !tx.meta) return;

        const accountKeys = tx.transaction.message.accountKeys;
        const vaultIndex = accountKeys.findIndex(
          (k) => k.pubkey.toBase58() === vaultAddress
        );
        if (vaultIndex === -1) return;

        // --- SOL detection ---
        // Check for a positive SOL balance change to the vault that isn't just fee payment
        const preSol = tx.meta.preBalances[vaultIndex] ?? 0;
        const postSol = tx.meta.postBalances[vaultIndex] ?? 0;
        const solDelta = postSol - preSol;

        if (solDelta > 0) {
          // The vault received SOL. Find the sender (largest negative delta, excluding fee payer at index 0 if same)
          let senderAddress = '';
          let largestNegativeDelta = 0;
          for (let i = 0; i < accountKeys.length; i++) {
            if (i === vaultIndex) continue;
            const delta =
              (tx.meta.postBalances[i] ?? 0) - (tx.meta.preBalances[i] ?? 0);
            if (delta < largestNegativeDelta) {
              largestNegativeDelta = delta;
              senderAddress = accountKeys[i].pubkey.toBase58();
            }
          }

          const amountRaw = solDelta.toString();
          const amount = (solDelta / LAMPORTS_PER_SOL).toFixed(9);

          transfers.push({
            txHash: signature,
            fromAddress: senderAddress,
            asset: 'SOL',
            amount,
            amountRaw,
          });
        }

        // --- USDC-SPL detection ---
        // Look in parsed instructions and inner instructions for token transfers to vault
        const allInstructions = [
          ...(tx.transaction.message.instructions ?? []),
          ...(tx.meta.innerInstructions ?? []).flatMap((ii) => ii.instructions),
        ];

        for (const ix of allInstructions) {
          if (!('parsed' in ix)) continue;
          const parsed = (ix as any).parsed;
          if (!parsed) continue;

          const type = parsed.type;
          const info = parsed.info;

          if (
            (type === 'transfer' || type === 'transferChecked') &&
            info?.mint === usdcMint
          ) {
            // info.destination is the recipient token account; check its owner
            const destOwner: string | undefined = info.destination
              ? await getTokenAccountOwner(connection, info.destination)
              : undefined;

            if (destOwner === vaultAddress) {
              const rawAmount: number =
                type === 'transferChecked'
                  ? parseInt(info.tokenAmount?.amount ?? '0', 10)
                  : parseInt(info.amount ?? '0', 10);
              const decimals: number =
                type === 'transferChecked' ? (info.tokenAmount?.decimals ?? 6) : 6;
              const formatted = (rawAmount / Math.pow(10, decimals)).toFixed(decimals);

              transfers.push({
                txHash: signature,
                fromAddress: info.authority ?? info.source ?? '',
                asset: 'USDC',
                amount: formatted,
                amountRaw: rawAmount.toString(),
              });
            }
          }
        }
      } catch (err) {
        console.error(`[Solana incoming] Error processing tx ${signature}:`, err);
      }
    })
  );

  return transfers;
}

/** Resolve the owner (wallet) of an SPL token account. Returns undefined on error. */
async function getTokenAccountOwner(
  connection: Connection,
  tokenAccountAddress: string
): Promise<string | undefined> {
  try {
    const info = await connection.getParsedAccountInfo(new PublicKey(tokenAccountAddress));
    const data = (info.value?.data as any)?.parsed?.info;
    return data?.owner as string | undefined;
  } catch {
    return undefined;
  }
}
