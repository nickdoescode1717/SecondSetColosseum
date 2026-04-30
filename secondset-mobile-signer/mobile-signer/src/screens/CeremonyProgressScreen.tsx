// mobile-signer/src/screens/CeremonyProgressScreen.tsx

import React, { useEffect, useState, useRef } from 'react';
import { View, Text, StyleSheet, ActivityIndicator, Alert, TouchableOpacity } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { Ionicons } from '@expo/vector-icons';
import * as Clipboard from 'expo-clipboard';
import { useCeremonyStore } from '../store/ceremonyStore';
import { useVaultStore } from '../store/vaultStore';
import { coordinatorWS } from '../services/CoordinatorWS';
import { getKeygen, CurveType } from '../services/TSS/CryptoFactory';
import { SecureStorage, VaultKeyShare } from '../services/SecureStorage';

export const CeremonyProgressScreen: React.FC = () => {
  const navigation = useNavigation();
  const { sessionId, participantId, signerIndex, wsUrl, wsToken, role, chain, curveType, vaultId } = useCeremonyStore();
  const addVault = useVaultStore((state) => state.addVault);
  const [status, setStatus] = useState('Connecting...');
  const [currentRound, setCurrentRound] = useState(0);
  const [totalRounds] = useState(3);
  const [participantCount, setParticipantCount] = useState(0);
  const [walletAddress, setWalletAddress] = useState('');
  const [error, setError] = useState('');
  const [copied, setCopied] = useState(false);
  
  const keyShareRef = useRef('');
  const publicKeyShareRef = useRef('');
  const combinedPublicKeyRef = useRef('');

  useEffect(() => {
    initializeCeremony();

    return () => {
      coordinatorWS.disconnect();
      coordinatorWS.removeAllListeners();
    };
  }, []);

  const initializeCeremony = async () => {
    try {
      console.log('🎬 Initializing ceremony...');

      // Connect to WebSocket
      setStatus('Connecting to coordinator...');
      await coordinatorWS.connect(wsUrl, wsToken);

      // Handle connection
      coordinatorWS.on('connected', (message: any) => {
        console.log('✅ Connected as:', message.role);
        setStatus('Waiting for other participants...');
      });

      // Handle ceremony start - THIS IS WHERE THE MAGIC HAPPENS
      coordinatorWS.on('keygen_start', async (message: any) => {
        console.log('🚀 Keygen ceremony starting!');
        console.log('Participants:', message.participants);
        // Use curve_type from coordinator message (authoritative), fall back to store value
        const activeCurve = (message.curve_type || curveType || 'secp256k1') as CurveType;
        console.log('🔑 Curve type:', activeCurve);
        setParticipantCount(message.participants.length);
        setStatus('Generating keys...');

        // Run DKG with the correct curve type
        await runDKG(message.participants, activeCurve);
      });

      coordinatorWS.on('keygen_round', (message: any) => {
        console.log('📨 Received round message:', message.round);
        setCurrentRound(message.round);
      });

      coordinatorWS.on('keygen_success', async (message: any) => {
        console.log('🎉 Ceremony completed!');

        const vaultChain = (chain || 'EVM') as 'EVM' | 'SOLANA';
        const vaultCurve = (curveType || 'secp256k1') as 'secp256k1' | 'ed25519';
        const vaultKeyShare: VaultKeyShare = {
          vault_id: vaultId || `vault_${message.wallet_address}`,
          share: keyShareRef.current,
          participant_id: participantId,
          org_id: 'test-org',
          role: role,
          wallet_address: message.wallet_address,
          chain: vaultChain,
          curve_type: vaultCurve,
          signer_index: signerIndex,
          created_at: new Date().toISOString(),
        };

        await SecureStorage.storeVaultKeyShare(vaultKeyShare);
        addVault(vaultKeyShare);
        console.log(`💾 Vault key share saved: ${vaultKeyShare.vault_id} (${vaultChain})`);

        setWalletAddress(message.wallet_address);
        setStatus('Complete!');
      });

      coordinatorWS.on('keygen_failed', (message: any) => {
        console.error('❌ Ceremony failed:', message.reason);
        setError(message.reason || 'Ceremony failed');
        setStatus('Failed');
      });

      coordinatorWS.on('keygen_cancelled', () => {
        Alert.alert(
          'Ceremony Cancelled',
          'This ceremony was cancelled by the admin.',
          [{ text: 'OK', onPress: () => navigation.navigate('MainTabs' as never) }]
        );
      });

    } catch (error: any) {
      console.error('❌ Failed to initialize:', error);
      setError(error.message || 'Connection failed');
      setStatus('Error');
    }
  };

  const runDKG = async (participants: any[], activeCurveType: CurveType) => {
    try {
      const Keygen = getKeygen(activeCurveType);
      const myIndex = signerIndex;
      const allIndices = participants.map((p: any) => p.index);
      const otherParticipants = participants.filter((p: any) => p.index !== myIndex);

      console.log('🔐 Starting DKG protocol with', participants.length, 'participants', '| curve:', activeCurveType);
      console.log('📍 My signer index:', myIndex, '| Others:', otherParticipants.map((p: any) => p.index));

      // ---- Register round data listener FIRST (before computation) ----
      const received = new Map<number, { commitments?: [string, string]; share?: string }>();

      const roundDataPromise = new Promise<void>((resolve) => {
        const handler = (message: any) => {
          if (message.round !== 1) return;
          try {
            const payload = JSON.parse(message.payload);
            const fromIndex = payload.fromIndex as number;
            if (fromIndex === myIndex) return;

            if (!received.has(fromIndex)) received.set(fromIndex, {});
            const entry = received.get(fromIndex)!;

            if (payload.commitments) {
              entry.commitments = payload.commitments;
              console.log(`📥 Received commitments from participant ${fromIndex}`);
            }
            if (payload.share) {
              entry.share = payload.share;
              console.log(`📥 Received private share from participant ${fromIndex}`);
            }

            const complete = otherParticipants.every((p: any) => {
              const d = received.get(p.index);
              return d?.commitments && d?.share;
            });
            if (complete) {
              coordinatorWS.off('keygen_round', handler);
              resolve();
            }
          } catch (err) {
            console.error('Error processing round message:', err);
          }
        };
        coordinatorWS.on('keygen_round', handler);
      });

      // ---- Round 1: Generate polynomial, commitments, and shares ----
      console.log('📊 DKG Round 1: Generating polynomial and shares...');
      setCurrentRound(1);
      const round1 = Keygen.generateRound1(myIndex, allIndices);

      // Broadcast commitments to all
      coordinatorWS.send({
        type: 'keygen_round',
        from_participant: participantId,
        to_participant: '*',
        round: 1,
        payload: JSON.stringify({ commitments: round1.commitments, fromIndex: myIndex }),
        timestamp: new Date().toISOString(),
      });

      // Send private shares to each other participant
      for (const p of otherParticipants) {
        coordinatorWS.send({
          type: 'keygen_round',
          from_participant: participantId,
          to_participant: p.participant_id,
          round: 1,
          payload: JSON.stringify({ share: round1.shares[p.index], fromIndex: myIndex }),
          timestamp: new Date().toISOString(),
        });
      }
      console.log('📤 Sent commitments and shares to all participants');

      // ---- Wait for all other participants' data ----
      setCurrentRound(2);
      setStatus('Exchanging key shares...');
      console.log('⏳ Waiting for round 1 data from other participants...');
      await roundDataPromise;
      console.log('✅ Received all round 1 data');

      // ---- Round 2: Verify and compute final key share ----
      console.log('📊 DKG Round 2: Verifying shares and computing final key share...');
      setCurrentRound(3);
      setStatus('Computing shared wallet...');

      const receivedData = otherParticipants.map((p: any) => ({
        fromIndex: p.index,
        commitments: received.get(p.index)!.commitments!,
        share: received.get(p.index)!.share!,
      }));

      const result = Keygen.processRound2(
        myIndex,
        { secret: round1.secret, coefficient: round1.coefficient, commitments: round1.commitments },
        receivedData
      );

      keyShareRef.current = result.finalKeyShare;
      combinedPublicKeyRef.current = result.combinedPublicKey;

      console.log('✅ Wallet address:', result.walletAddress);

      // Address format validation (defense-in-depth)
      const isEVMAddress = result.walletAddress.startsWith('0x');
      if (activeCurveType === 'ed25519' && isEVMAddress) {
        throw new Error('Ed25519 DKG produced an EVM address — curve dispatch error');
      }
      if (activeCurveType === 'secp256k1' && !isEVMAddress) {
        throw new Error('secp256k1 DKG produced a non-EVM address — curve dispatch error');
      }

      // ---- Report completion ----
      console.log('📤 Reporting completion to coordinator...');
      coordinatorWS.send({
        type: 'keygen_complete',
        participant_id: participantId,
        wallet_address: result.walletAddress,
        public_key_share: result.combinedPublicKey,
      });

    } catch (error: any) {
      console.error('❌ Error in DKG:', error);
      setError('DKG failed: ' + error.message);
    }
  };

  const sleep = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

  const handleCopyAddress = async () => {
    if (walletAddress) {
      await Clipboard.setStringAsync(walletAddress);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  const getStepStatus = (step: number) => {
    if (walletAddress) return 'done';
    if (error) return currentRound >= step ? 'error' : 'pending';
    if (currentRound > step) return 'done';
    if (currentRound === step) return 'active';
    return 'pending';
  };

  const steps = [
    { num: 1, label: 'Generate shares' },
    { num: 2, label: 'Exchange keys' },
    { num: 3, label: 'Compute wallet' },
  ];

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        {!walletAddress && !error && (
          <ActivityIndicator size="large" color="#2D9D92" />
        )}
        <Text style={styles.title}>
          {walletAddress ? 'Wallet Created' : error ? 'Ceremony Failed' : 'Creating Wallet'}
        </Text>
        <Text style={styles.subtitle}>{status}</Text>
      </View>

      {/* Info Card */}
      <View style={styles.card}>
        <View style={styles.detailRow}>
          <Text style={styles.detailLabel}>Your Role</Text>
          <View style={styles.roleBadge}>
            <Text style={styles.roleBadgeText}>
              {role ? role.charAt(0).toUpperCase() + role.slice(1) : 'Signer'}
            </Text>
          </View>
        </View>
        {participantCount > 0 && (
          <View style={[styles.detailRow, { borderBottomWidth: 0 }]}>
            <Text style={styles.detailLabel}>Participants</Text>
            <Text style={styles.detailValue}>{participantCount} of 3</Text>
          </View>
        )}
      </View>

      {/* Progress Steps */}
      <View style={styles.card}>
        {steps.map((step, i) => {
          const stepStatus = getStepStatus(step.num);
          return (
            <View
              key={step.num}
              style={[
                styles.stepRow,
                i === steps.length - 1 && { borderBottomWidth: 0 },
              ]}
            >
              <View
                style={[
                  styles.stepCircle,
                  stepStatus === 'done' && styles.stepCircleDone,
                  stepStatus === 'active' && styles.stepCircleActive,
                  stepStatus === 'error' && styles.stepCircleError,
                ]}
              >
                <Text
                  style={[
                    styles.stepCircleText,
                    (stepStatus === 'done' || stepStatus === 'active') && styles.stepCircleTextActive,
                    stepStatus === 'error' && styles.stepCircleTextActive,
                  ]}
                >
                  {stepStatus === 'done' ? '\u2713' : step.num}
                </Text>
              </View>
              <Text
                style={[
                  styles.stepLabel,
                  stepStatus === 'active' && styles.stepLabelActive,
                  stepStatus === 'done' && styles.stepLabelDone,
                ]}
              >
                {step.label}
              </Text>
              {stepStatus === 'active' && (
                <ActivityIndicator size="small" color="#2D9D92" style={{ marginLeft: 'auto' }} />
              )}
            </View>
          );
        })}
      </View>

      {/* Success */}
      {walletAddress && (
        <View style={styles.successCard}>
          <Ionicons name="checkmark-circle" size={48} color="#2D9D92" style={styles.successIcon} />
          <Text style={styles.successTitle}>Wallet Ready</Text>
          <View style={styles.addressContainer}>
            <View style={styles.addressHeader}>
              <Text style={styles.addressLabel}>Wallet Address</Text>
              <TouchableOpacity onPress={handleCopyAddress} style={styles.copyButton}>
                <Ionicons
                  name={copied ? "checkmark-circle" : "copy-outline"}
                  size={18}
                  color={copied ? "#10B981" : "#6B7280"}
                />
                <Text style={[styles.copyText, copied && styles.copyTextSuccess]}>
                  {copied ? "Copied!" : "Copy"}
                </Text>
              </TouchableOpacity>
            </View>
            <Text style={styles.address} selectable>{walletAddress}</Text>
          </View>
          <TouchableOpacity
            style={styles.doneButton}
            onPress={() => navigation.navigate('MainTabs' as never)}
          >
            <Text style={styles.doneButtonText}>Done</Text>
          </TouchableOpacity>
        </View>
      )}

      {/* Error */}
      {error && (
        <View style={styles.errorCard}>
          <Text style={styles.errorTitle}>Something went wrong</Text>
          <Text style={styles.errorText}>{error}</Text>
          <TouchableOpacity
            style={styles.retryButton}
            onPress={() => navigation.navigate('MainTabs' as never)}
          >
            <Text style={styles.retryButtonText}>Go Back</Text>
          </TouchableOpacity>
        </View>
      )}
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#F8FAFB',
    padding: 24,
  },
  header: {
    alignItems: 'center',
    marginTop: 32,
    marginBottom: 32,
  },
  title: {
    fontSize: 28,
    fontWeight: '700',
    color: '#1F2937',
    marginTop: 16,
    marginBottom: 6,
  },
  subtitle: {
    fontSize: 16,
    color: '#6B7280',
  },
  card: {
    backgroundColor: 'white',
    borderRadius: 16,
    padding: 20,
    marginBottom: 16,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 4,
    elevation: 2,
  },
  detailRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#F3F4F6',
  },
  detailLabel: {
    fontSize: 15,
    color: '#6B7280',
  },
  detailValue: {
    fontSize: 15,
    fontWeight: '600',
    color: '#1F2937',
  },
  roleBadge: {
    backgroundColor: '#E6F6F4',
    paddingHorizontal: 14,
    paddingVertical: 5,
    borderRadius: 20,
  },
  roleBadgeText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#2D9D92',
  },
  stepRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 16,
    borderBottomWidth: 1,
    borderBottomColor: '#F3F4F6',
  },
  stepCircle: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: '#F3F4F6',
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 14,
  },
  stepCircleDone: {
    backgroundColor: '#2D9D92',
  },
  stepCircleActive: {
    backgroundColor: '#2D9D92',
  },
  stepCircleError: {
    backgroundColor: '#EF4444',
  },
  stepCircleText: {
    fontSize: 14,
    fontWeight: '700',
    color: '#9CA3AF',
  },
  stepCircleTextActive: {
    color: 'white',
  },
  stepLabel: {
    fontSize: 16,
    color: '#9CA3AF',
  },
  stepLabelActive: {
    color: '#1F2937',
    fontWeight: '600',
  },
  stepLabelDone: {
    color: '#6B7280',
  },
  successCard: {
    backgroundColor: 'white',
    borderRadius: 16,
    padding: 24,
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 4,
    elevation: 2,
  },
  successIcon: {
    marginBottom: 12,
  },
  successTitle: {
    fontSize: 20,
    fontWeight: '700',
    color: '#1F2937',
    marginBottom: 16,
  },
  addressContainer: {
    width: '100%',
    backgroundColor: '#F8FAFB',
    padding: 14,
    borderRadius: 10,
    marginBottom: 20,
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
    fontSize: 12,
    fontWeight: '500',
    color: '#6B7280',
  },
  copyTextSuccess: {
    color: '#10B981',
  },
  address: {
    fontSize: 12,
    fontFamily: 'monospace',
    color: '#1F2937',
  },
  doneButton: {
    backgroundColor: '#2D9D92',
    paddingVertical: 14,
    borderRadius: 12,
    alignItems: 'center',
    width: '100%',
    marginTop: 20,
  },
  doneButtonText: {
    color: 'white',
    fontSize: 17,
    fontWeight: '600',
  },
  errorCard: {
    backgroundColor: 'white',
    borderRadius: 16,
    padding: 24,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 4,
    elevation: 2,
  },
  errorTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: '#EF4444',
    marginBottom: 8,
  },
  errorText: {
    fontSize: 14,
    color: '#6B7280',
    marginBottom: 16,
  },
  retryButton: {
    borderWidth: 2,
    borderColor: '#E5E7EB',
    paddingVertical: 14,
    borderRadius: 12,
    alignItems: 'center',
  },
  retryButtonText: {
    color: '#6B7280',
    fontSize: 16,
    fontWeight: '600',
  },
});