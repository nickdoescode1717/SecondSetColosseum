// mobile-signer/src/store/vaultStore.ts

import { create } from 'zustand';
import { SecureStorage, VaultKeyShare } from '../services/SecureStorage';

interface VaultStoreState {
  vaults: VaultKeyShare[];
  loading: boolean;
  loadVaults: () => Promise<void>;
  addVault: (vault: VaultKeyShare) => void;
  removeVault: (vaultId: string) => Promise<void>;
}

export const useVaultStore = create<VaultStoreState>((set, get) => ({
  vaults: [],
  loading: false,

  loadVaults: async () => {
    set({ loading: true });
    try {
      const vaults = await SecureStorage.getAllVaultKeyShares();
      set({ vaults, loading: false });
    } catch (error) {
      console.error('Failed to load vaults:', error);
      set({ loading: false });
    }
  },

  addVault: (vault: VaultKeyShare) => {
    set(state => ({
      vaults: [...state.vaults.filter(v => v.vault_id !== vault.vault_id), vault],
    }));
  },

  removeVault: async (vaultId: string) => {
    try {
      await SecureStorage.deleteVaultKeyShare(vaultId);
      set(state => ({
        vaults: state.vaults.filter(v => v.vault_id !== vaultId),
      }));
    } catch (error) {
      console.error('Failed to remove vault:', error);
      throw error;
    }
  },
}));
