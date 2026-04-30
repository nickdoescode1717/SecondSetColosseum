// mobile-signer/src/screens/SigningRequestScreen.tsx

import React, { useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, ScrollView, Alert } from 'react-native';
import { useRoute, useNavigation } from '@react-navigation/native';
import { Ionicons } from '@expo/vector-icons';
import { BiometricAuth } from '../services/BiometricAuth';
import { CoordinatorAPI } from '../services/CoordinatorAPI';
import { SecureStorage } from '../services/SecureStorage';
import { DeviceInfo } from '../services/DeviceInfo';

export const SigningRequestScreen = () => {
  const route = useRoute();
  const navigation = useNavigation();
  const [loading, setLoading] = useState(false);

  // Get the signing session from route params (passed from HomeScreen)
  const request = (route.params as any)?.request;

  const txDetails = {
    to: request?.tx_details?.display_recipient || request?.tx_details?.to || 'Unknown',
    value: request?.tx_details?.display_amount || '?',
    token: request?.tx_details?.display_token || '',
    chain: request?.tx_details?.display_chain || 'EVM',
    requestId: request?.request_id || 'Unknown',
    requestedBy: request?.tx_details?.display_requested_by || 'Unknown',
    recipientName: request?.tx_details?.display_recipient_name || null,
  };

  const handleApprove = async () => {
    try {
      setLoading(true);

      // Require biometric authentication
      const authenticated = await BiometricAuth.authenticate(
        `Approve ${txDetails.value} ${txDetails.token} transfer`
      );

      if (!authenticated) {
        Alert.alert('Authentication Failed', 'Biometric verification required to sign');
        setLoading(false);
        return;
      }

      // Join the signing session on the coordinator
      const deviceId = await DeviceInfo.getDeviceId();
      const walletAddress = request.wallet_address;
      const keyShare = await SecureStorage.getVaultKeyShareByAddress(walletAddress);

      if (!keyShare) {
        const allVaults = await SecureStorage.getAllVaultKeyShares();
        console.warn('Key share lookup failed', {
          searchedAddress: walletAddress?.slice(0, 10) + '...',
          storedAddresses: allVaults.map((v: any) => v.wallet_address.slice(0, 10) + '...'),
          vaultCount: allVaults.length,
        });
        Alert.alert('Error', 'No key share found for this vault. Please re-enroll device.');
        setLoading(false);
        return;
      }

      const joinResult = await CoordinatorAPI.joinSigningSession(
        request.session_id,
        deviceId,
        keyShare.role
      );

      // Validate signer_index matches what was stored during DKG
      if (keyShare.signer_index && keyShare.signer_index !== joinResult.signer_index) {
        console.warn(`⚠️ Signer index mismatch! Stored: ${keyShare.signer_index}, Coordinator: ${joinResult.signer_index}. Using stored value.`);
      }
      const signerIndex = keyShare.signer_index || joinResult.signer_index;

      // Navigate to signing progress with WebSocket credentials
      navigation.navigate('SigningProgress', {
        sessionId: request.session_id,
        participantId: joinResult.participant_id,
        signerIndex,
        wsUrl: joinResult.ws_url,
        wsToken: joinResult.ws_token,
        walletAddress: request.wallet_address,
        curveType: request.curve_type || 'secp256k1',
      });
    } catch (error: any) {
      Alert.alert('Error', error.message || 'Failed to join signing session');
      setLoading(false);
    }
  };

  const handleReject = () => {
    Alert.alert(
      'Reject Transaction',
      'Are you sure you want to reject this signing request?',
      [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Reject', style: 'destructive', onPress: () => navigation.goBack() },
      ]
    );
  };

  return (
    <ScrollView style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        <View style={styles.iconContainer}>
          <Ionicons name="document-text" size={40} color="#2D9D92" />
        </View>
        <Text style={styles.title}>Signing Request</Text>
        <Text style={styles.subtitle}>Review transaction details carefully</Text>
      </View>

      {/* Request Info Card */}
      <View style={styles.card}>
        <View style={styles.cardHeader}>
          <Text style={styles.cardTitle}>Request Details</Text>
          <View style={styles.badge}>
            <Text style={styles.badgeText}>PENDING</Text>
          </View>
        </View>

        <View style={styles.detailRow}>
          <Text style={styles.detailLabel}>Request ID</Text>
          <Text style={styles.detailValue}>{txDetails.requestId}</Text>
        </View>

        <View style={styles.detailRow}>
          <Text style={styles.detailLabel}>Requested By</Text>
          <Text style={styles.detailValue}>{txDetails.requestedBy}</Text>
        </View>

        {txDetails.recipientName && (
          <View style={styles.detailRow}>
            <Text style={styles.detailLabel}>Recipient</Text>
            <Text style={styles.detailValue}>{txDetails.recipientName}</Text>
          </View>
        )}
      </View>

      {/* Transaction Details Card */}
      <View style={styles.card}>
        <View style={styles.cardHeader}>
          <Text style={styles.cardTitle}>Transaction Details</Text>
          <View style={[styles.badge, styles.badgeChain]}>
            <Text style={styles.badgeText}>{txDetails.chain}</Text>
          </View>
        </View>

        {/* Amount - Prominent */}
        <View style={styles.amountContainer}>
          <Text style={styles.amountLabel}>Amount</Text>
          <View style={styles.amountRow}>
            <Text style={styles.amountSymbol}>$</Text>
            <Text style={styles.amountValue}>{txDetails.value}</Text>
            <View style={styles.tokenBadge}>
              <Text style={styles.tokenText}>{txDetails.token}</Text>
            </View>
          </View>
        </View>

        <View style={styles.separator} />

        <View style={styles.detailRow}>
          <Text style={styles.detailLabel}>Recipient</Text>
          <Text style={styles.detailValueMono} numberOfLines={1} ellipsizeMode="middle">
            {txDetails.to}
          </Text>
        </View>

        <View style={styles.detailRow}>
          <Text style={styles.detailLabel}>Network</Text>
          <Text style={styles.detailValue}>{txDetails.chain}</Text>
        </View>
      </View>

      {/* Security Notice */}
      <View style={styles.securityNotice}>
        <Ionicons name="finger-print" size={24} color="#3730A3" style={styles.securityIcon} />
        <View style={styles.securityTextContainer}>
          <Text style={styles.securityTitle}>Biometric Verification Required</Text>
          <Text style={styles.securityText}>
            You'll need to authenticate with Face ID / Touch ID to approve this transaction
          </Text>
        </View>
      </View>

      {/* Action Buttons */}
      <View style={styles.actions}>
        <TouchableOpacity
          style={[styles.button, styles.buttonReject]}
          onPress={handleReject}
          disabled={loading}
        >
          <Text style={styles.buttonTextReject}>Reject</Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={[styles.button, styles.buttonApprove]}
          onPress={handleApprove}
          disabled={loading}
        >
          <Text style={styles.buttonTextApprove}>
            {loading ? 'Authenticating...' : 'Approve & Sign'}
          </Text>
        </TouchableOpacity>
      </View>
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
    paddingTop: 12,
    paddingBottom: 24,
    paddingHorizontal: 24,
  },
  iconContainer: {
    width: 80,
    height: 80,
    borderRadius: 40,
    backgroundColor: 'white',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 16,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 8,
    elevation: 3,
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
    marginBottom: 20,
  },
  cardTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: '#1F2937',
  },
  badge: {
    backgroundColor: '#FEF3C7',
    paddingHorizontal: 12,
    paddingVertical: 4,
    borderRadius: 12,
  },
  badgeText: {
    fontSize: 12,
    fontWeight: '600',
    color: '#92400E',
  },
  badgeChain: {
    backgroundColor: '#DBEAFE',
  },
  detailRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 12,
  },
  detailLabel: {
    fontSize: 14,
    color: '#6B7280',
    flex: 1,
  },
  detailValue: {
    fontSize: 14,
    fontWeight: '500',
    color: '#1F2937',
    flex: 2,
    textAlign: 'right',
  },
  detailValueMono: {
    fontSize: 12,
    fontWeight: '500',
    color: '#1F2937',
    fontFamily: 'monospace',
    flex: 2,
    textAlign: 'right',
  },
  approverList: {
    flexDirection: 'row',
    gap: 8,
    flex: 2,
    justifyContent: 'flex-end',
  },
  approverBadge: {
    backgroundColor: '#D1FAE5',
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 8,
  },
  approverText: {
    fontSize: 12,
    fontWeight: '500',
    color: '#065F46',
  },
  amountContainer: {
    paddingVertical: 20,
  },
  amountLabel: {
    fontSize: 14,
    color: '#6B7280',
    marginBottom: 8,
  },
  amountRow: {
    flexDirection: 'row',
    alignItems: 'baseline',
  },
  amountSymbol: {
    fontSize: 24,
    fontWeight: '600',
    color: '#2D9D92',
    marginRight: 4,
  },
  amountValue: {
    fontSize: 42,
    fontWeight: '700',
    color: '#1F2937',
    marginRight: 12,
  },
  tokenBadge: {
    backgroundColor: '#2D9D92',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 8,
  },
  tokenText: {
    fontSize: 14,
    fontWeight: '600',
    color: 'white',
  },
  separator: {
    height: 1,
    backgroundColor: '#E5E7EB',
    marginVertical: 16,
  },
  securityNotice: {
    flexDirection: 'row',
    backgroundColor: '#EEF2FF',
    borderRadius: 12,
    padding: 16,
    marginHorizontal: 16,
    marginBottom: 24,
  },
  securityIcon: {
    marginRight: 12,
  },
  securityTextContainer: {
    flex: 1,
  },
  securityTitle: {
    fontSize: 14,
    fontWeight: '600',
    color: '#3730A3',
    marginBottom: 4,
  },
  securityText: {
    fontSize: 13,
    color: '#4C1D95',
    lineHeight: 18,
  },
  actions: {
    flexDirection: 'row',
    gap: 12,
    paddingHorizontal: 16,
    paddingBottom: 32,
  },
  button: {
    flex: 1,
    paddingVertical: 16,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  buttonReject: {
    backgroundColor: 'white',
    borderWidth: 2,
    borderColor: '#E5E7EB',
  },
  buttonApprove: {
    backgroundColor: 'linear-gradient(135deg, #2D9D92 0%, #3B82A1 100%)',
    background: 'linear-gradient(135deg, #2D9D92 0%, #3B82A1 100%)',
    // Note: React Native doesn't support gradients natively, so we'll use solid color
    backgroundColor: '#2D9D92',
    shadowColor: '#2D9D92',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 4,
  },
  buttonTextReject: {
    fontSize: 16,
    fontWeight: '600',
    color: '#6B7280',
  },
  buttonTextApprove: {
    fontSize: 16,
    fontWeight: '600',
    color: 'white',
  },
});
