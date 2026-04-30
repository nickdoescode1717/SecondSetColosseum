// mobile-signer/src/navigation/types.ts

import type { NavigatorScreenParams } from '@react-navigation/native';

export type MainTabParamList = {
  Vaults: undefined;
  AddVault: undefined;
  Activity: undefined;
};

export type RootStackParamList = {
  Login: undefined;
  MainTabs: NavigatorScreenParams<MainTabParamList>;
  VaultDetail: { vaultId: string };
  ManualEntry: undefined;
  JoinCeremony: {
    session_id: string;
    join_token: string;
    org_id?: string;
    expiry?: string;
    chain?: string;
    curve_type?: string;
    vault_id?: string;
  };
  CeremonyLobby: { participantId: string; sessionId: string };
  CeremonyProgress: { participantId: string; sessionId: string };
  CeremonyDone: undefined;
  SigningRequest: { request: any };
  SigningProgress: {
    sessionId: string;
    participantId: string;
    signerIndex: number;
    wsUrl: string;
    wsToken: string;
    walletAddress?: string;
    curveType?: string;
  };
  SigningComplete: { signature?: any; txHash?: string; curveType?: string };

  // Recovery Flow
  RecoveryJoin: {
    session_id: string;
    join_token: string;
    vault_id: string;
    wallet_address: string;
    chain: string;
    curve_type: string;
  };
  RecoveryProgress: {
    participantId: string;
    sessionId: string;
    participantType: 'old_signer' | 'new_signer';
    oldSignerIndex?: number;
    newSignerIndex?: number;
    wsUrl: string;
    wsToken: string;
    walletAddress: string;
    curveType: string;
    chain: string;
    devicePrivateKey: string;
    role: string;
    vaultId: string;
  };
  RecoveryDone: {
    walletAddress: string;
    participantType: 'old_signer' | 'new_signer';
    newThreshold?: number;
    newN?: number;
  };
};

declare global {
  namespace ReactNavigation {
    interface RootParamList extends RootStackParamList {}
  }
}
