// mobile-signer/src/screens/CeremonyDoneScreen.tsx

import React, { useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, ScrollView, Image, Alert } from 'react-native';
import { useRoute, useNavigation } from '@react-navigation/native';
import { Ionicons } from '@expo/vector-icons';
import * as Clipboard from 'expo-clipboard';

export const CeremonyDoneScreen = () => {
  const route = useRoute();
  const navigation = useNavigation();
  const { walletAddress } = route.params as any;
  const [copied, setCopied] = useState(false);

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
        <Text style={styles.title}>Wallet Created!</Text>
        <Text style={styles.subtitle}>
          Your device has been enrolled in the treasury wallet
        </Text>
      </View>

      {/* Wallet Address Card */}
      <View style={styles.card}>
        <View style={styles.cardHeader}>
          <Text style={styles.cardTitle}>Treasury Wallet</Text>
          <View style={styles.badge}>
            <Text style={styles.badgeText}>ACTIVE</Text>
          </View>
        </View>

        <View style={styles.addressContainer}>
          <View style={styles.addressHeader}>
            <Text style={styles.addressLabel}>
              {walletAddress?.startsWith('0x') ? 'Ethereum Address' : 'Solana Address'}
            </Text>
            <TouchableOpacity onPress={handleCopyAddress} style={styles.copyButton}>
              <Ionicons
                name={copied ? "checkmark-circle" : "copy-outline"}
                size={20}
                color={copied ? "#10B981" : "#6B7280"}
              />
              <Text style={[styles.copyText, copied && styles.copyTextSuccess]}>
                {copied ? "Copied!" : "Copy"}
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
          <Text style={styles.infoLabel}>Threshold</Text>
          <Text style={styles.infoValue}>2 of 3</Text>
        </View>

        <View style={styles.infoCard}>
          <Ionicons name="shield-checkmark" size={32} color="#2D9D92" style={styles.infoIcon} />
          <Text style={styles.infoLabel}>Security</Text>
          <Text style={styles.infoValue}>Multi-Party</Text>
        </View>

        <View style={styles.infoCard}>
          <Ionicons name="person" size={32} color="#2D9D92" style={styles.infoIcon} />
          <Text style={styles.infoLabel}>Your Role</Text>
          <Text style={styles.infoValue}>Signer</Text>
        </View>

        <View style={styles.infoCard}>
          <Ionicons name="checkmark-circle" size={32} color="#10B981" style={styles.infoIcon} />
          <Text style={styles.infoLabel}>Status</Text>
          <Text style={styles.infoValue}>Enrolled</Text>
        </View>
      </View>

      {/* Success Notice */}
      <View style={styles.successNotice}>
        <Ionicons name="information-circle" size={24} color="#1E40AF" style={styles.successNoticeIcon} />
        <View style={styles.successNoticeTextContainer}>
          <Text style={styles.successNoticeTitle}>What's Next?</Text>
          <Text style={styles.successNoticeText}>
            Your device is now enrolled and ready to sign transactions.
            You'll receive notifications when your approval is needed.
          </Text>
        </View>
      </View>

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
