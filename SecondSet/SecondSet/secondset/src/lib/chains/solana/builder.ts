import {
  Connection,
  PublicKey,
  SystemProgram,
  Transaction,
  LAMPORTS_PER_SOL,
} from '@solana/web3.js';
import {
  getAssociatedTokenAddress,
  createAssociatedTokenAccountInstruction,
  createTransferInstruction,
  TOKEN_PROGRAM_ID,
  ASSOCIATED_TOKEN_PROGRAM_ID,
} from '@solana/spl-token';

// Re-use mint constants
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

export function getUSDCMint(network: string): string {
  const config = NETWORK_CONFIG[network];
  if (!config) throw new Error(`Unsupported Solana network: ${network}`);
  return config.usdcMint;
}

function getConnection(network: string): Connection {
  const config = NETWORK_CONFIG[network];
  if (!config) throw new Error(`Unsupported Solana network: ${network}`);
  return new Connection(config.rpcUrl, 'confirmed');
}

export interface SolanaTransactionResult {
  serializedMessage: string; // hex of Message.serialize() — this is what Ed25519 signs
  unsignedTx: any; // JSON structure stored in DB
}

/**
 * Build a SOL transfer transaction
 */
export async function buildSolanaSOLTransfer(params: {
  network: string;
  fromAddress: string;
  toAddress: string;
  amountLamports: string;
}): Promise<SolanaTransactionResult> {
  const { network, fromAddress, toAddress, amountLamports } = params;
  const connection = getConnection(network);

  const fromPubkey = new PublicKey(fromAddress);
  const toPubkey = new PublicKey(toAddress);

  // Check SOL balance
  const balance = await connection.getBalance(fromPubkey);
  const amount = BigInt(amountLamports);
  if (BigInt(balance) < amount + BigInt(5000)) { // 5000 lamports for fee
    throw new Error(
      `Insufficient SOL balance. Have: ${balance} lamports, Need: ${amountLamports} + fees`
    );
  }

  const tx = new Transaction();
  tx.add(
    SystemProgram.transfer({
      fromPubkey,
      toPubkey,
      lamports: Number(amount),
    })
  );

  // Get recent blockhash
  const { blockhash } = await connection.getLatestBlockhash('confirmed');
  tx.recentBlockhash = blockhash;
  tx.feePayer = fromPubkey;

  // Serialize the message (what gets signed)
  const messageBytes = tx.serializeMessage();
  const serializedMessage = Buffer.from(messageBytes).toString('hex');

  const unsignedTx = {
    type: 'solana',
    network,
    serializedMessage,
    recentBlockhash: blockhash,
    feePayer: fromAddress,
    instructions: tx.instructions.map(ix => ({
      programId: ix.programId.toBase58(),
      keys: ix.keys.map(k => ({
        pubkey: k.pubkey.toBase58(),
        isSigner: k.isSigner,
        isWritable: k.isWritable,
      })),
      data: Buffer.from(ix.data).toString('hex'),
    })),
  };

  return { serializedMessage, unsignedTx };
}

/**
 * Build a SPL token transfer transaction (e.g. USDC)
 */
export async function buildSolanaSPLTransfer(params: {
  network: string;
  fromAddress: string;
  toAddress: string;
  mintAddress: string;
  amountMinor: string;
}): Promise<SolanaTransactionResult> {
  const { network, fromAddress, toAddress, mintAddress, amountMinor } = params;
  const connection = getConnection(network);

  const fromPubkey = new PublicKey(fromAddress);
  const toPubkey = new PublicKey(toAddress);
  const mintPubkey = new PublicKey(mintAddress);

  // Get Associated Token Accounts
  const fromATA = await getAssociatedTokenAddress(
    mintPubkey,
    fromPubkey,
    false,
    TOKEN_PROGRAM_ID,
    ASSOCIATED_TOKEN_PROGRAM_ID,
  );

  const toATA = await getAssociatedTokenAddress(
    mintPubkey,
    toPubkey,
    false,
    TOKEN_PROGRAM_ID,
    ASSOCIATED_TOKEN_PROGRAM_ID,
  );

  const tx = new Transaction();

  // Check if destination ATA exists; if not, create it
  const toATAInfo = await connection.getAccountInfo(toATA);
  if (!toATAInfo) {
    tx.add(
      createAssociatedTokenAccountInstruction(
        fromPubkey,  // payer
        toATA,       // associated token account
        toPubkey,    // owner
        mintPubkey,  // mint
        TOKEN_PROGRAM_ID,
        ASSOCIATED_TOKEN_PROGRAM_ID,
      )
    );
  }

  // Add SPL transfer instruction
  tx.add(
    createTransferInstruction(
      fromATA,              // source
      toATA,                // destination
      fromPubkey,           // owner/authority
      BigInt(amountMinor),  // amount in minor units
      [],                   // multiSigners
      TOKEN_PROGRAM_ID,
    )
  );

  // Get recent blockhash
  const { blockhash } = await connection.getLatestBlockhash('confirmed');
  tx.recentBlockhash = blockhash;
  tx.feePayer = fromPubkey;

  // Serialize the message (what gets signed)
  const messageBytes = tx.serializeMessage();
  const serializedMessage = Buffer.from(messageBytes).toString('hex');

  const unsignedTx = {
    type: 'solana',
    network,
    serializedMessage,
    recentBlockhash: blockhash,
    feePayer: fromAddress,
    instructions: tx.instructions.map(ix => ({
      programId: ix.programId.toBase58(),
      keys: ix.keys.map(k => ({
        pubkey: k.pubkey.toBase58(),
        isSigner: k.isSigner,
        isWritable: k.isWritable,
      })),
      data: Buffer.from(ix.data).toString('hex'),
    })),
  };

  return { serializedMessage, unsignedTx };
}

/**
 * Rebuild a Solana transaction with a fresh blockhash.
 * Called at release time so the blockhash is valid when the signing ceremony completes.
 * Returns updated serializedMessage (txDigest) and unsignedTx.
 */
export async function refreshSolanaBlockhash(unsignedTx: any): Promise<{
  serializedMessage: string;
  unsignedTx: any;
}> {
  const network = unsignedTx.network || 'solana-devnet';
  const connection = getConnection(network);

  const feePayer = new PublicKey(unsignedTx.feePayer);
  const tx = new Transaction();

  // Reconstruct instructions from stored data
  for (const ix of unsignedTx.instructions) {
    tx.add({
      programId: new PublicKey(ix.programId),
      keys: ix.keys.map((k: any) => ({
        pubkey: new PublicKey(k.pubkey),
        isSigner: k.isSigner,
        isWritable: k.isWritable,
      })),
      data: Buffer.from(ix.data, 'hex'),
    });
  }

  // Fetch fresh blockhash
  const { blockhash } = await connection.getLatestBlockhash('confirmed');
  tx.recentBlockhash = blockhash;
  tx.feePayer = feePayer;

  // Re-serialize the message
  const messageBytes = tx.serializeMessage();
  const serializedMessage = Buffer.from(messageBytes).toString('hex');

  const updatedUnsignedTx = {
    ...unsignedTx,
    serializedMessage,
    recentBlockhash: blockhash,
  };

  return { serializedMessage, unsignedTx: updatedUnsignedTx };
}

/**
 * Get Solana explorer URL for a transaction signature
 */
export function getSolanaExplorerUrl(network: string, txSignature: string): string {
  if (network === 'solana-mainnet') {
    return `https://explorer.solana.com/tx/${txSignature}`;
  }
  return `https://explorer.solana.com/tx/${txSignature}?cluster=devnet`;
}
