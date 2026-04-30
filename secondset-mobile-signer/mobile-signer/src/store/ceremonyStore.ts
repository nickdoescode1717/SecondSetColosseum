// mobile-signer/src/store/ceremonyStore.ts

import { create } from 'zustand';

interface CeremonyState {
  sessionId: string;
  participantId: string;
  signerIndex: number;
  wsUrl: string;
  wsToken: string;
  role: string;
  orgName: string;
  status: 'idle' | 'connecting' | 'in_progress' | 'complete' | 'failed';
  walletAddress: string;
  chain: string;
  curveType: string;
  vaultId: string;

  // Actions
  setCeremonyData: (data: {
    sessionId: string;
    participantId: string;
    signerIndex: number;
    wsUrl: string;
    wsToken: string;
    role: string;
    orgName: string;
    chain?: string;
    curveType?: string;
    vaultId?: string;
  }) => void;

  setStatus: (status: CeremonyState['status']) => void;
  setWalletAddress: (address: string) => void;
  reset: () => void;
}

export const useCeremonyStore = create<CeremonyState>((set) => ({
  sessionId: '',
  participantId: '',
  signerIndex: 0,
  wsUrl: '',
  wsToken: '',
  role: '',
  orgName: '',
  status: 'idle',
  walletAddress: '',
  chain: 'EVM',
  curveType: 'secp256k1',
  vaultId: '',

  setCeremonyData: (data) => set({
    sessionId: data.sessionId,
    participantId: data.participantId,
    signerIndex: data.signerIndex,
    wsUrl: data.wsUrl,
    wsToken: data.wsToken,
    role: data.role,
    orgName: data.orgName,
    chain: data.chain || 'EVM',
    curveType: data.curveType || 'secp256k1',
    vaultId: data.vaultId || '',
    status: 'connecting',
  }),

  setStatus: (status) => set({ status }),

  setWalletAddress: (address) => set({ walletAddress: address }),

  reset: () => set({
    sessionId: '',
    participantId: '',
    signerIndex: 0,
    wsUrl: '',
    wsToken: '',
    role: '',
    orgName: '',
    status: 'idle',
    walletAddress: '',
    chain: 'EVM',
    curveType: 'secp256k1',
    vaultId: '',
  }),
}));
