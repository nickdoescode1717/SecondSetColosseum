/**
 * Chain-address detection utility.
 * Defense-in-depth: resolves the correct chain from address format,
 * overriding the DB value when there's a mismatch (e.g. 0x address
 * stored with chain='SOLANA' due to a keygen bug).
 */

export type ResolvedChain = 'EVM' | 'SOLANA';

export function resolveVaultChain(dbChain: string, address: string): ResolvedChain {
  if (address.startsWith('0x')) return 'EVM';
  return 'SOLANA';
}
