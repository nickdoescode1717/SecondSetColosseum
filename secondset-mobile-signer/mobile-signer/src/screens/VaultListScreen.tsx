// mobile-signer/src/screens/VaultListScreen.tsx

import React, { useCallback } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, FlatList, RefreshControl, Platform } from 'react-native';
import { useNavigation, useFocusEffect } from '@react-navigation/native';
import { Ionicons } from '@expo/vector-icons';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useVaultStore } from '../store/vaultStore';
import { useAuthStore } from '../store/authStore';
import { VaultKeyShare } from '../services/SecureStorage';

const TEAL = '#2D9D92';

const chainIcon = (chain: string) => {
  return 'diamond-outline';
};

const resolveChainByAddress = (address: string): 'EVM' | 'SOLANA' => {
  return address.startsWith('0x') ? 'EVM' : 'SOLANA';
};

const chainLabel = (chain: string, address: string) => {
  return resolveChainByAddress(address) === 'SOLANA' ? 'Solana' : 'Ethereum';
};

const truncateAddress = (address: string) => {
  if (address.length <= 12) return address;
  return `${address.slice(0, 6)}...${address.slice(-4)}`;
};

const VaultCard: React.FC<{ vault: VaultKeyShare; onPress: () => void }> = ({ vault, onPress }) => {
  const resolved = resolveChainByAddress(vault.wallet_address);
  const isSolana = resolved === 'SOLANA';
  return (
  <TouchableOpacity style={styles.card} onPress={onPress} activeOpacity={0.7}>
    <View style={styles.cardLeft}>
      <View style={[styles.chainBadge, isSolana ? styles.solanaBadge : styles.evmBadge]}>
        <Ionicons
          name={chainIcon(vault.chain) as any}
          size={20}
          color={isSolana ? '#9945FF' : '#627EEA'}
        />
      </View>
      <View style={styles.cardInfo}>
        <Text style={styles.cardChain}>{chainLabel(vault.chain, vault.wallet_address)}</Text>
        <Text style={styles.cardAddress}>{truncateAddress(vault.wallet_address)}</Text>
      </View>
    </View>
    <View style={styles.cardRight}>
      <View style={styles.roleBadge}>
        <Text style={styles.roleText}>{vault.role}</Text>
      </View>
      <Ionicons name="chevron-forward" size={20} color="#999" />
    </View>
  </TouchableOpacity>
  );
};

export const VaultListScreen: React.FC = () => {
  const navigation = useNavigation();
  const { vaults, loading, loadVaults } = useVaultStore();
  const user = useAuthStore((s) => s.user);

  useFocusEffect(
    useCallback(() => {
      loadVaults();
    }, [loadVaults])
  );

  // Filter vaults by the logged-in user's organization
  const orgVaults = user?.org_id
    ? vaults.filter(v => v.org_id === user.org_id)
    : vaults;

  const evmVaults = orgVaults.filter(v => resolveChainByAddress(v.wallet_address) === 'EVM');
  const solanaVaults = orgVaults.filter(v => resolveChainByAddress(v.wallet_address) === 'SOLANA');

  const handleVaultPress = (vault: VaultKeyShare) => {
    navigation.navigate('VaultDetail', { vaultId: vault.vault_id });
  };

  const renderSection = (title: string, sectionVaults: VaultKeyShare[]) => {
    if (sectionVaults.length === 0) return null;
    return (
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>{title}</Text>
        {sectionVaults.map(vault => (
          <VaultCard
            key={vault.vault_id}
            vault={vault}
            onPress={() => handleVaultPress(vault)}
          />
        ))}
      </View>
    );
  };

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <View style={styles.header}>
        <Text style={styles.title}>My Vaults</Text>
        <Text style={styles.subtitle}>
          {orgVaults.length === 0
            ? 'No vaults enrolled. Scan a QR code to join a ceremony.'
            : `${orgVaults.length} vault${orgVaults.length !== 1 ? 's' : ''} on this device`
          }
        </Text>
      </View>

      <FlatList
        data={[{ key: 'content' }]}
        renderItem={() => (
          <>
            {renderSection('EVM', evmVaults)}
            {renderSection('Solana', solanaVaults)}
            {vaults.length === 0 && !loading && (
              <View style={styles.emptyState}>
                <Ionicons name="wallet-outline" size={64} color="#ccc" />
                <Text style={styles.emptyText}>No vaults yet</Text>
                <Text style={styles.emptySubtext}>
                  Enroll in a vault ceremony to get started
                </Text>
              </View>
            )}
          </>
        )}
        refreshControl={
          <RefreshControl refreshing={loading} onRefresh={loadVaults} tintColor={TEAL} />
        }
      />

    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#F8FAFB',
  },
  header: {
    padding: 20,
    paddingTop: 12,
  },
  title: {
    fontSize: 28,
    fontWeight: 'bold',
    color: '#1a1a1a',
    marginBottom: 4,
  },
  subtitle: {
    fontSize: 14,
    color: '#666',
  },
  section: {
    paddingHorizontal: 20,
    marginBottom: 16,
  },
  sectionTitle: {
    fontSize: 13,
    fontWeight: '600',
    color: '#999',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    marginBottom: 8,
  },
  card: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: '#fff',
    padding: 16,
    borderRadius: 12,
    marginBottom: 8,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 4,
    elevation: 1,
  },
  cardLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
  },
  chainBadge: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 12,
  },
  evmBadge: {
    backgroundColor: '#EEF0FF',
  },
  solanaBadge: {
    backgroundColor: '#F3EEFF',
  },
  cardInfo: {
    flex: 1,
  },
  cardChain: {
    fontSize: 16,
    fontWeight: '600',
    color: '#1a1a1a',
  },
  cardAddress: {
    fontSize: 13,
    color: '#666',
    marginTop: 2,
    fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace',
  },
  cardRight: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  roleBadge: {
    backgroundColor: '#E8F5F3',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 6,
  },
  roleText: {
    fontSize: 11,
    fontWeight: '600',
    color: TEAL,
    textTransform: 'uppercase',
  },
  emptyState: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 60,
  },
  emptyText: {
    fontSize: 18,
    fontWeight: '600',
    color: '#999',
    marginTop: 16,
  },
  emptySubtext: {
    fontSize: 14,
    color: '#bbb',
    marginTop: 4,
  },
});
