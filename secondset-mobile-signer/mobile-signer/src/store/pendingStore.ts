// mobile-signer/src/store/pendingStore.ts

import { create } from 'zustand';

interface PendingStoreState {
  pendingCount: number;
  setPendingCount: (count: number) => void;
}

export const usePendingStore = create<PendingStoreState>((set) => ({
  pendingCount: 0,
  setPendingCount: (count) => set({ pendingCount: count }),
}));
