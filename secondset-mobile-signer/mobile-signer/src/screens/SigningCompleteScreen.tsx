// mobile-signer/src/screens/SigningCompleteScreen.tsx

import React from 'react';
import { View, Text, StyleSheet, TouchableOpacity, ScrollView, Linking, Image } from 'react-native';
import { useRoute, useNavigation } from '@react-navigation/native';
import { Ionicons } from '@expo/vector-icons';

export const SigningCompleteScreen = () => {
  const route = useRoute();
  const navigation = useNavigation();
  const { txHash, signature, curveType } = route.params as any;

  const isSolana = curveType === 'ed25519';

  const handleViewOnExplorer = () => {
    if (!txHash) return;
    const url = isSolana
      ? `https://solscan.io/tx/${txHash}?cluster=devnet`
      : `https://etherscan.io/tx/${txHash}`;
    Linking.openURL(url);
  };

  const handleDone = () => {
    navigation.navigate('MainTabs', { screen: 'Activity' });
  };

  return (
    <ScrollView style={styles.container}>
      {/* Success Header */}
      <View style={styles.header}>
        <Image
          source={require('../../assets/images/logo.png')}
          style={styles.logoImage}
          resizeMode="contain"
        />
        <View style={styles.successIconContainer}>
          <View style={styles.successIconInner}>
            <Ionicons name="checkmark" size={48} color="white" />
          </View>
        </View>
        <Text style={styles.title}>Transaction Signed!</Text>
        <Text style={styles.subtitle}>
          Your signature has been successfully created and combined
        </Text>
      </View>

      {/* Transaction Hash Card */}
      <View style={styles.card}>
        <View style={styles.cardHeader}>
          <Text style={styles.cardTitle}>Transaction Hash</Text>
          <View style={styles.badge}>
            <Text style={styles.badgeText}>SIGNED</Text>
          </View>
        </View>

        <View style={styles.hashContainer}>
          <Text style={styles.hashLabel}>TX Hash</Text>
          <Text style={styles.hashValue} numberOfLines={2}>
            {txHash}
          </Text>
        </View>

        {txHash ? (
          <TouchableOpacity style={styles.explorerButton} onPress={handleViewOnExplorer}>
            <Ionicons name="open-outline" size={16} color="#374151" style={styles.explorerIcon} />
            <Text style={styles.explorerText}>
              {isSolana ? 'View on Solscan' : 'View on Etherscan'}
            </Text>
          </TouchableOpacity>
        ) : null}
      </View>

      {/* Signature Details Card */}
      <View style={styles.card}>
        <Text style={styles.cardTitle}>Signature Details</Text>

        {isSolana ? (
          <>
            <View style={styles.signatureRow}>
              <Text style={styles.signatureLabel}>R</Text>
              <Text style={styles.signatureValue} numberOfLines={1} ellipsizeMode="middle">
                {signature?.R || signature?.r}
              </Text>
            </View>

            <View style={styles.signatureRow}>
              <Text style={styles.signatureLabel}>s</Text>
              <Text style={styles.signatureValue} numberOfLines={1} ellipsizeMode="middle">
                {signature?.s}
              </Text>
            </View>
          </>
        ) : (
          <>
            <View style={styles.signatureRow}>
              <Text style={styles.signatureLabel}>r</Text>
              <Text style={styles.signatureValue} numberOfLines={1} ellipsizeMode="middle">
                {signature?.r}
              </Text>
            </View>

            <View style={styles.signatureRow}>
              <Text style={styles.signatureLabel}>s</Text>
              <Text style={styles.signatureValue} numberOfLines={1} ellipsizeMode="middle">
                {signature?.s}
              </Text>
            </View>

            <View style={styles.signatureRow}>
              <Text style={styles.signatureLabel}>v</Text>
              <Text style={styles.signatureValue}>{signature?.v}</Text>
            </View>
          </>
        )}
      </View>

      {/* Info Cards */}
      <View style={styles.infoGrid}>
        <View style={styles.infoCard}>
          <Ionicons name="people" size={32} color="#2D9D92" style={styles.infoIcon} />
          <Text style={styles.infoLabel}>Signers</Text>
          <Text style={styles.infoValue}>2 of 3</Text>
        </View>

        <View style={styles.infoCard}>
          <Ionicons name="flash" size={32} color="#2D9D92" style={styles.infoIcon} />
          <Text style={styles.infoLabel}>Protocol</Text>
          <Text style={styles.infoValue}>{isSolana ? 'TSS-EdDSA' : 'TSS-ECDSA'}</Text>
        </View>

        <View style={styles.infoCard}>
          <Ionicons name="shield-checkmark" size={32} color="#2D9D92" style={styles.infoIcon} />
          <Text style={styles.infoLabel}>Security</Text>
          <Text style={styles.infoValue}>Threshold</Text>
        </View>

        <View style={styles.infoCard}>
          <Ionicons name="checkmark-circle" size={32} color="#10B981" style={styles.infoIcon} />
          <Text style={styles.infoLabel}>Status</Text>
          <Text style={styles.infoValue}>Complete</Text>
        </View>
      </View>

      {/* Success Notice */}
      <View style={styles.successNotice}>
        <Ionicons name="information-circle" size={24} color="#1E40AF" style={styles.successNoticeIcon} />
        <View style={styles.successNoticeTextContainer}>
          <Text style={styles.successNoticeTitle}>What Happens Next?</Text>
          <Text style={styles.successNoticeText}>
            {isSolana
              ? 'The transaction has been signed and will be broadcast to the Solana network. You can track its progress on Solscan.'
              : 'The transaction has been signed and will be broadcast to the Ethereum network. You can track its progress on Etherscan.'}
          </Text>
        </View>
      </View>

      {/* Action Button */}
      <TouchableOpacity style={styles.doneButton} onPress={handleDone}>
        <Text style={styles.doneButtonText}>Done</Text>
      </TouchableOpacity>

      <View style={styles.spacer} />
    </ScrollView>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#F8FAFB',
  },
  header: {
    alignItems: 'center',
    paddingTop: 40,
    paddingBottom: 32,
    paddingHorizontal: 24,
  },
  logoImage: {
    width: 150,
    height: 50,
    marginBottom: 24,
  },
  successIconContainer: {
    width: 100,
    height: 100,
    borderRadius: 50,
    backgroundColor: '#D1FAE5',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 20,
  },
  successIconInner: {
    width: 80,
    height: 80,
    borderRadius: 40,
    backgroundColor: '#10B981',
    alignItems: 'center',
    justifyContent: 'center',
  },
  title: {
    fontSize: 28,
    fontWeight: '700',
    color: '#1F2937',
    marginBottom: 8,
  },
  subtitle: {
    fontSize: 16,
    color: '#6B7280',
    textAlign: 'center',
  },
  card: {
    backgroundColor: 'white',
    borderRadius: 16,
    padding: 20,
    marginHorizontal: 16,
    marginBottom: 16,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 4,
    elevation: 2,
  },
  cardHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 16,
  },
  cardTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: '#1F2937',
    marginBottom: 16,
  },
  badge: {
    backgroundColor: '#D1FAE5',
    paddingHorizontal: 12,
    paddingVertical: 4,
    borderRadius: 12,
  },
  badgeText: {
    fontSize: 12,
    fontWeight: '600',
    color: '#065F46',
  },
  hashContainer: {
    backgroundColor: '#F9FAFB',
    borderRadius: 12,
    padding: 16,
    marginBottom: 12,
  },
  hashLabel: {
    fontSize: 12,
    fontWeight: '600',
    color: '#6B7280',
    marginBottom: 8,
    textTransform: 'uppercase',
  },
  hashValue: {
    fontSize: 13,
    fontFamily: 'monospace',
    color: '#1F2937',
    lineHeight: 20,
  },
  explorerButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#F3F4F6',
    borderRadius: 10,
    padding: 12,
  },
  explorerIcon: {
    marginRight: 8,
  },
  explorerText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#374151',
  },
  signatureRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#F3F4F6',
  },
  signatureLabel: {
    fontSize: 14,
    fontWeight: '600',
    color: '#6B7280',
    width: 40,
  },
  signatureValue: {
    fontSize: 12,
    fontFamily: 'monospace',
    color: '#1F2937',
    flex: 1,
  },
  infoGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    paddingHorizontal: 16,
    gap: 12,
    marginBottom: 16,
  },
  infoCard: {
    backgroundColor: 'white',
    borderRadius: 12,
    padding: 16,
    alignItems: 'center',
    flex: 1,
    minWidth: '45%',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 4,
    elevation: 2,
  },
  infoIcon: {
    marginBottom: 8,
  },
  infoLabel: {
    fontSize: 12,
    color: '#9CA3AF',
    marginBottom: 4,
  },
  infoValue: {
    fontSize: 14,
    fontWeight: '600',
    color: '#1F2937',
  },
  successNotice: {
    flexDirection: 'row',
    backgroundColor: '#DBEAFE',
    borderRadius: 12,
    padding: 16,
    marginHorizontal: 16,
    marginBottom: 24,
  },
  successNoticeIcon: {
    marginRight: 12,
  },
  successNoticeTextContainer: {
    flex: 1,
  },
  successNoticeTitle: {
    fontSize: 14,
    fontWeight: '600',
    color: '#1E40AF',
    marginBottom: 4,
  },
  successNoticeText: {
    fontSize: 13,
    color: '#1E3A8A',
    lineHeight: 18,
  },
  doneButton: {
    backgroundColor: '#2D9D92',
    borderRadius: 12,
    padding: 16,
    marginHorizontal: 16,
    alignItems: 'center',
    shadowColor: '#2D9D92',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 4,
  },
  doneButtonText: {
    fontSize: 16,
    fontWeight: '600',
    color: 'white',
  },
  spacer: {
    height: 32,
  },
});
