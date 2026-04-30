// mobile-signer/src/screens/VaultDetailScreen.tsx

import React, { useState, useEffect } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, Alert, Platform } from 'react-native';
import { useRoute, RouteProp } from '@react-navigation/native';
import { Ionicons } from '@expo/vector-icons';
import * as Clipboard from 'expo-clipboard';
import { SecureStorage, VaultKeyShare } from '../services/SecureStorage';
import type { RootStackParamList } from '../navigation/types';

const TEAL = '#2D9D92';

type VaultDetailRouteProp = RouteProp<RootStackParamList, 'VaultDetail'>;

export const VaultDetailScreen: React.FC = () => {
  const route = useRoute<VaultDetailRouteProp>();
  const { vaultId } = route.params;
  const [vault, setVault] = useState<VaultKeyShare | null>(null);

  useEffect(() => {
    SecureStorage.getVaultKeyShare(vaultId).then(setVault);
  }, [vaultId]);

  const copyAddress = async () => {
    if (vault) {
      await Clipboard.setStringAsync(vault.wallet_address);
      Alert.alert('Copied', 'Wallet address copied to clipboard');
    }
  };

  if (!vault) {
    return (
      <View style={styles.container}>
        <Text style={styles.loadingText}>Loading vault...</Text>
      </View>
    );
  }

  const isEVM = vault.wallet_address.startsWith('0x');
  const chainLabel = isEVM ? 'Ethereum' : 'Solana';
  const curveLabel = vault.curve_type === 'ed25519' ? 'Ed25519 (EdDSA)' : 'secp256k1 (ECDSA)';

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <View style={[styles.chainBadge, isEVM ? styles.evmBadge : styles.solanaBadge]}>
          <Ionicons
            name="diamond-outline"
            size={32}
            color={isEVM ? '#627EEA' : '#9945FF'}
          />
        </View>
        <Text style={styles.chainName}>{chainLabel} Vault</Text>
      </View>

      <View style={styles.infoSection}>
        <Text style={styles.label}>Wallet Address</Text>
        <TouchableOpacity style={styles.addressRow} onPress={copyAddress}>
          <Text style={styles.address}>{vault.wallet_address}</Text>
          <Ionicons name="copy-outline" size={18} color={TEAL} />
        </TouchableOpacity>
      </View>

      <View style={styles.infoGrid}>
        <View style={styles.infoItem}>
          <Text style={styles.label}>Chain</Text>
          <Text style={styles.value}>{chainLabel}</Text>
        </View>
        <View style={styles.infoItem}>
          <Text style={styles.label}>Curve</Text>
          <Text style={styles.value}>{curveLabel}</Text>
        </View>
        <View style={styles.infoItem}>
          <Text style={styles.label}>Role</Text>
          <Text style={styles.value}>{vault.role}</Text>
        </View>
        <View style={styles.infoItem}>
          <Text style={styles.label}>Signer Index</Text>
          <Text style={styles.value}>{vault.signer_index || 'N/A'}</Text>
        </View>
        <View style={styles.infoItem}>
          <Text style={styles.label}>Created</Text>
          <Text style={styles.value}>
            {new Date(vault.created_at).toLocaleDateString()}
          </Text>
        </View>
        <View style={styles.infoItem}>
          <Text style={styles.label}>Vault ID</Text>
          <Text style={styles.value} numberOfLines={1}>
            {vault.vault_id.slice(0, 8)}...
          </Text>
        </View>
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#F8FAFB',
    padding: 20,
  },
  loadingText: {
    fontSize: 16,
    color: '#666',
    textAlign: 'center',
    marginTop: 40,
  },
  header: {
    alignItems: 'center',
    marginBottom: 24,
  },
  chainBadge: {
    width: 64,
    height: 64,
    borderRadius: 32,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 12,
  },
  evmBadge: {
    backgroundColor: '#EEF0FF',
  },
  solanaBadge: {
    backgroundColor: '#F3EEFF',
  },
  chainName: {
    fontSize: 22,
    fontWeight: '700',
    color: '#1a1a1a',
  },
  infoSection: {
    backgroundColor: '#fff',
    padding: 16,
    borderRadius: 12,
    marginBottom: 16,
  },
  label: {
    fontSize: 12,
    fontWeight: '600',
    color: '#999',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    marginBottom: 6,
  },
  addressRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  address: {
    fontSize: 13,
    color: '#333',
    fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace',
    flex: 1,
    marginRight: 8,
  },
  infoGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    marginBottom: 16,
  },
  infoItem: {
    backgroundColor: '#fff',
    padding: 14,
    borderRadius: 12,
    width: '48%',
    flexGrow: 1,
  },
  value: {
    fontSize: 15,
    fontWeight: '600',
    color: '#1a1a1a',
  },
});
