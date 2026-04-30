// mobile-signer/src/services/SecureStorage.ts

import * as SecureStore from 'expo-secure-store';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Platform } from 'react-native';

// ============================================================================
// LEGACY TYPES (kept for backward compatibility during migration)
// ============================================================================

export interface KeyShare {
  share: string;
  participant_id: string;
  org_id: string;
  role: string;
  wallet_address: string;
  created_at: string;
}

// ============================================================================
// NEW MULTI-VAULT TYPES
// ============================================================================

export interface VaultKeyShare {
  vault_id: string;          // Pre-generated UUID from web app
  share: string;             // Encrypted TSS key share
  participant_id: string;
  org_id: string;
  role: string;
  wallet_address: string;
  chain: 'EVM' | 'SOLANA';
  curve_type: 'secp256k1' | 'ed25519';
  signer_index: number;
  created_at: string;
}

// ============================================================================
// STORAGE KEYS
// ============================================================================

const LEGACY_KEY = 'secondset_key_share';
const VAULT_INDEX_KEY = 'secondset_vault_index';
const VAULT_PREFIX = 'secondset_vault_';

// ============================================================================
// HELPERS
// ============================================================================

async function getItem(key: string): Promise<string | null> {
  if (Platform.OS === 'web') {
    return localStorage.getItem(key);
  }
  return SecureStore.getItemAsync(key);
}

async function setItem(key: string, value: string): Promise<void> {
  if (Platform.OS === 'web') {
    localStorage.setItem(key, value);
  } else {
    await SecureStore.setItemAsync(key, value);
  }
}

async function deleteItem(key: string): Promise<void> {
  if (Platform.OS === 'web') {
    localStorage.removeItem(key);
  } else {
    await SecureStore.deleteItemAsync(key);
  }
}

// Vault index stored in AsyncStorage (not secret, just a list of IDs)
async function getVaultIndex(): Promise<string[]> {
  try {
    if (Platform.OS === 'web') {
      const data = localStorage.getItem(VAULT_INDEX_KEY);
      return data ? JSON.parse(data) : [];
    }
    const data = await AsyncStorage.getItem(VAULT_INDEX_KEY);
    return data ? JSON.parse(data) : [];
  } catch {
    return [];
  }
}

async function setVaultIndex(ids: string[]): Promise<void> {
  const data = JSON.stringify(ids);
  if (Platform.OS === 'web') {
    localStorage.setItem(VAULT_INDEX_KEY, data);
  } else {
    await AsyncStorage.setItem(VAULT_INDEX_KEY, data);
  }
}

// ============================================================================
// SECURE STORAGE CLASS
// ============================================================================

export class SecureStorage {
  // ==========================================================================
  // LEGACY METHODS (kept temporarily for backward compat during migration)
  // ==========================================================================

  static async storeKeyShare(keyShare: KeyShare): Promise<void> {
    await setItem(LEGACY_KEY, JSON.stringify(keyShare));
    console.log('Key share saved (legacy format)');
  }

  static async getKeyShare(): Promise<KeyShare | null> {
    const data = await getItem(LEGACY_KEY);
    return data ? JSON.parse(data) : null;
  }

  static async deleteKeyShare(): Promise<void> {
    await deleteItem(LEGACY_KEY);
  }

  // ==========================================================================
  // NEW MULTI-VAULT METHODS
  // ==========================================================================

  static async storeVaultKeyShare(keyShare: VaultKeyShare): Promise<void> {
    const key = VAULT_PREFIX + keyShare.vault_id;
    await setItem(key, JSON.stringify(keyShare));

    // Update vault index
    const index = await getVaultIndex();
    if (!index.includes(keyShare.vault_id)) {
      index.push(keyShare.vault_id);
      await setVaultIndex(index);
    }

    console.log(`Vault key share saved: ${keyShare.vault_id} (${keyShare.chain})`);
  }

  static async getVaultKeyShare(vaultId: string): Promise<VaultKeyShare | null> {
    const key = VAULT_PREFIX + vaultId;
    const data = await getItem(key);
    return data ? JSON.parse(data) : null;
  }

  static async getVaultKeyShareByAddress(walletAddress: string): Promise<VaultKeyShare | null> {
    const allVaults = await SecureStorage.getAllVaultKeyShares();
    return allVaults.find(v => v.wallet_address === walletAddress) || null;
  }

  static async getAllVaultKeyShares(): Promise<VaultKeyShare[]> {
    const index = await getVaultIndex();
    const vaults: VaultKeyShare[] = [];

    for (const vaultId of index) {
      const vault = await SecureStorage.getVaultKeyShare(vaultId);
      if (vault) {
        vaults.push(vault);
      }
    }

    return vaults;
  }

  static async deleteVaultKeyShare(vaultId: string): Promise<void> {
    const key = VAULT_PREFIX + vaultId;
    await deleteItem(key);

    // Update vault index
    const index = await getVaultIndex();
    const newIndex = index.filter(id => id !== vaultId);
    await setVaultIndex(newIndex);

    console.log(`Vault key share deleted: ${vaultId}`);
  }

  // ==========================================================================
  // MIGRATIONS
  // ==========================================================================

  /**
   * One-time migration: update stored vault org_ids to match the authenticated user.
   * Called after login when the org_id from the web app differs from what was
   * stored during the original DKG ceremony (e.g. after switching from mock auth).
   * Idempotent: vaults that already match are skipped.
   */
  static async migrateVaultOrgIds(currentOrgId: string): Promise<void> {
    try {
      const index = await getVaultIndex();
      for (const vaultId of index) {
        const vault = await SecureStorage.getVaultKeyShare(vaultId);
        if (vault && vault.org_id !== currentOrgId) {
          const updated: VaultKeyShare = { ...vault, org_id: currentOrgId };
          const key = VAULT_PREFIX + vaultId;
          await setItem(key, JSON.stringify(updated));
          console.log(`Migrated vault org_id: ${vaultId}`);
        }
      }
    } catch (error) {
      console.error('Vault org_id migration failed:', error);
      // Non-fatal: don't block login
    }
  }

  /**
   * Migrate from legacy single-key storage to multi-vault format.
   * Idempotent: safe to call multiple times.
   */
  static async migrateFromLegacy(): Promise<void> {
    try {
      const legacyData = await getItem(LEGACY_KEY);
      if (!legacyData) {
        return; // No legacy key, nothing to migrate
      }

      const legacy: KeyShare = JSON.parse(legacyData);

      // Check if already migrated (vault with this address exists)
      const existing = await SecureStorage.getVaultKeyShareByAddress(legacy.wallet_address);
      if (existing) {
        // Already migrated, clean up legacy key
        await deleteItem(LEGACY_KEY);
        console.log('Legacy key already migrated, cleaned up');
        return;
      }

      // Convert to VaultKeyShare
      const vaultKeyShare: VaultKeyShare = {
        vault_id: 'legacy_' + legacy.wallet_address,
        share: legacy.share,
        participant_id: legacy.participant_id,
        org_id: legacy.org_id,
        role: legacy.role,
        wallet_address: legacy.wallet_address,
        chain: 'EVM',
        curve_type: 'secp256k1',
        signer_index: 0, // Unknown from legacy format
        created_at: legacy.created_at,
      };

      await SecureStorage.storeVaultKeyShare(vaultKeyShare);
      await deleteItem(LEGACY_KEY);

      console.log('Legacy key share migrated to vault format:', vaultKeyShare.vault_id);
    } catch (error) {
      console.error('Legacy migration failed:', error);
      // Non-fatal: don't block app startup
    }
  }
}
