// mobile-signer/src/screens/RecoveryDoneScreen.tsx

import React, { useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, ScrollView, Image } from 'react-native';
import { useRoute, useNavigation } from '@react-navigation/native';
import { Ionicons } from '@expo/vector-icons';
import * as Clipboard from 'expo-clipboard';
import type { RouteProp } from '@react-navigation/native';
import type { RootStackParamList } from '../navigation/types';

export const RecoveryDoneScreen: React.FC = () => {
  const route = useRoute<RouteProp<RootStackParamList, 'RecoveryDone'>>();
  const navigation = useNavigation();
  const { walletAddress, participantType, newThreshold, newN } = route.params;
  const [copied, setCopied] = useState(false);

  const isOldSigner = participantType === 'old_signer';

  const handleCopyAddress = async () => {
    await Clipboard.setStringAsync(walletAddress);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleDone = () => {
    navigation.navigate('MainTabs', { screen: 'Vaults' });
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
        <Text style={styles.title}>
          {isOldSigner ? 'Shares Transferred!' : 'Vault Recovered!'}
        </Text>
        <Text style={styles.subtitle}>
          {isOldSigner
            ? 'Your key shares have been securely redistributed to the new committee'
            : 'Your device now holds a key share for this vault'}
        </Text>
      </View>

      {/* Wallet Address Card */}
      <View style={styles.card}>
        <View style={styles.cardHeader}>
          <Text style={styles.cardTitle}>Recovered Vault</Text>
          <View style={[styles.badge, isOldSigner ? styles.badgeOld : styles.badgeNew]}>
            <Text style={[styles.badgeText, isOldSigner ? styles.badgeTextOld : styles.badgeTextNew]}>
              {isOldSigner ? 'OLD SIGNER' : 'NEW SIGNER'}
            </Text>
          </View>
        </View>

        <View style={styles.addressContainer}>
          <View style={styles.addressHeader}>
            <Text style={styles.addressLabel}>
              {walletAddress?.startsWith('0x') ? 'Ethereum Address' : 'Solana Address'}
            </Text>
            <TouchableOpacity onPress={handleCopyAddress} style={styles.copyButton}>
              <Ionicons
                name={copied ? 'checkmark-circle' : 'copy-outline'}
                size={20}
                color={copied ? '#10B981' : '#6B7280'}
              />
              <Text style={[styles.copyText, copied && styles.copyTextSuccess]}>
                {copied ? 'Copied!' : 'Copy'}
              </Text>
            </TouchableOpacity>
          </View>
          <Text style={styles.addressValue} numberOfLines={2}>
            {walletAddress}
          </Text>
        </View>
      </View>

      {/* Info Cards */}
      <View style={styles.infoGrid}>
        <View style={styles.infoCard}>
          <Ionicons name="people" size={32} color="#2D9D92" style={styles.infoIcon} />
          <Text style={styles.infoLabel}>New Threshold</Text>
          <Text style={styles.infoValue}>
            {newThreshold && newN ? `${newThreshold} of ${newN}` : 'Computed'}
          </Text>
        </View>

        <View style={styles.infoCard}>
          <Ionicons name="shield-checkmark" size={32} color="#2D9D92" style={styles.infoIcon} />
          <Text style={styles.infoLabel}>Security</Text>
          <Text style={styles.infoValue}>Multi-Party</Text>
        </View>

        <View style={styles.infoCard}>
          <Ionicons name="swap-horizontal" size={32} color="#2D9D92" style={styles.infoIcon} />
          <Text style={styles.infoLabel}>Protocol</Text>
          <Text style={styles.infoValue}>Resharing</Text>
        </View>

        <View style={styles.infoCard}>
          <Ionicons name="checkmark-circle" size={32} color="#10B981" style={styles.infoIcon} />
          <Text style={styles.infoLabel}>Status</Text>
          <Text style={styles.infoValue}>
            {isOldSigner ? 'Transferred' : 'Enrolled'}
          </Text>
        </View>
      </View>

      {/* Info Notice */}
      <View style={styles.successNotice}>
        <Ionicons name="information-circle" size={24} color="#1E40AF" style={styles.successNoticeIcon} />
        <View style={styles.successNoticeTextContainer}>
          <Text style={styles.successNoticeTitle}>What's Next?</Text>
          <Text style={styles.successNoticeText}>
            {isOldSigner
              ? 'Your old key share is no longer valid for this vault. The new committee now controls the signing capability.'
              : 'Your device is now enrolled with a new key share. You can sign transactions for this vault when required.'}
          </Text>
        </View>
      </View>

      {/* Old Signer Warning */}
      {isOldSigner && (
        <View style={styles.warningNotice}>
          <Ionicons name="alert-circle" size={24} color="#856404" style={styles.successNoticeIcon} />
          <View style={styles.successNoticeTextContainer}>
            <Text style={styles.warningTitle}>Old Key Share</Text>
            <Text style={styles.warningText}>
              Your old key share will be cleaned up automatically. It can no longer be used
              for signing with the new committee.
            </Text>
          </View>
        </View>
      )}

      {/* Done Button */}
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
  },
  badge: {
    paddingHorizontal: 12,
    paddingVertical: 4,
    borderRadius: 12,
  },
  badgeNew: {
    backgroundColor: '#D1FAE5',
  },
  badgeOld: {
    backgroundColor: '#E6F6F4',
  },
  badgeText: {
    fontSize: 12,
    fontWeight: '600',
  },
  badgeTextNew: {
    color: '#065F46',
  },
  badgeTextOld: {
    color: '#2D9D92',
  },
  addressContainer: {
    backgroundColor: '#F9FAFB',
    borderRadius: 12,
    padding: 16,
  },
  addressHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
  },
  addressLabel: {
    fontSize: 12,
    fontWeight: '600',
    color: '#6B7280',
    textTransform: 'uppercase',
  },
  copyButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  copyText: {
    fontSize: 13,
    fontWeight: '500',
    color: '#6B7280',
  },
  copyTextSuccess: {
    color: '#10B981',
  },
  addressValue: {
    fontSize: 13,
    fontFamily: 'monospace',
    color: '#1F2937',
    lineHeight: 20,
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
    marginBottom: 16,
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
  warningNotice: {
    flexDirection: 'row',
    backgroundColor: '#FFF3CD',
    borderRadius: 12,
    padding: 16,
    marginHorizontal: 16,
    marginBottom: 24,
    borderWidth: 1,
    borderColor: '#FFC107',
  },
  warningTitle: {
    fontSize: 14,
    fontWeight: '600',
    color: '#856404',
    marginBottom: 4,
  },
  warningText: {
    fontSize: 13,
    color: '#856404',
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
