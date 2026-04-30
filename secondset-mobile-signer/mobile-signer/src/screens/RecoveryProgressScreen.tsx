// mobile-signer/src/screens/RecoveryProgressScreen.tsx
//
// Full-screen progress view for the vault recovery resharing ceremony.
// Handles both old-signer (share redistribution) and new-signer (share reception) flows.

import React, { useEffect, useState, useRef } from 'react';
import { View, Text, StyleSheet, ActivityIndicator, Alert, TouchableOpacity } from 'react-native';
import { useNavigation, useRoute } from '@react-navigation/native';
import { Ionicons } from '@expo/vector-icons';
import * as Clipboard from 'expo-clipboard';
import type { RouteProp } from '@react-navigation/native';
import type { RootStackParamList } from '../navigation/types';
import { coordinatorWS } from '../services/CoordinatorWS';
import { SecureStorage, VaultKeyShare } from '../services/SecureStorage';
import { useVaultStore } from '../store/vaultStore';
import {
  getOldSignerReshare,
  getNewSignerReshare,
  CurveType,
} from '../services/TSS/CryptoFactory';
import type { EncryptedSubShare } from '../services/TSS/RecoveryCrypto';

interface OldSignerInfo {
  participant_id: string;
  old_signer_index: number;
  device_public_key: string;
}

interface NewSignerInfo {
  participant_id: string;
  new_signer_index: number;
  device_public_key: string;
}

export const RecoveryProgressScreen: React.FC = () => {
  const navigation = useNavigation();
  const route = useRoute<RouteProp<RootStackParamList, 'RecoveryProgress'>>();
  const addVault = useVaultStore((state) => state.addVault);

  const {
    participantId,
    sessionId,
    participantType,
    oldSignerIndex,
    newSignerIndex,
    wsUrl,
    wsToken,
    walletAddress,
    curveType,
    chain,
    devicePrivateKey,
    role,
    vaultId,
  } = route.params;

  const isOldSigner = participantType === 'old_signer';
  const activeCurve = (curveType || 'secp256k1') as CurveType;

  const [status, setStatus] = useState('Connecting...');
  const [currentStep, setCurrentStep] = useState(0);
  const [walletAddressResult, setWalletAddressResult] = useState('');
  const [error, setError] = useState('');
  const [copied, setCopied] = useState(false);
  const [newThreshold, setNewThreshold] = useState(0);
  const [newN, setNewN] = useState(0);

  // Refs to avoid stale closures in WebSocket event handlers
  const walletAddressResultRef = useRef('');
  const newThresholdRef = useRef(0);
  const newNRef = useRef(0);

  // Track received data from old signers (for new signers)
  const receivedOldSignerDataRef = useRef<
    Map<
      number,
      {
        commitments?: string[];
        encryptedSubShare?: EncryptedSubShare;
      }
    >
  >(new Map());

  useEffect(() => {
    initializeRecovery();

    return () => {
      coordinatorWS.disconnect();
      coordinatorWS.removeAllListeners();
    };
  }, []);

  const initializeRecovery = async () => {
    try {
      console.log(`[Recovery] Initializing as ${participantType}...`);

      // Connect to WebSocket
      setStatus('Connecting to coordinator...');
      await coordinatorWS.connect(wsUrl, wsToken);

      coordinatorWS.on('connected', (message: any) => {
        console.log('[Recovery] Connected as:', message.role);
        setStatus('Waiting for ceremony to start...');
      });

      // Handle recovery start — this is where the ceremony begins
      coordinatorWS.on('recovery_start', async (message: any) => {
        console.log('[Recovery] Ceremony starting!');
        console.log('[Recovery] Old signers:', message.old_signers?.length);
        console.log('[Recovery] New signers:', message.new_signers?.length);
        console.log('[Recovery] Curve type:', message.curve_type || activeCurve);

        const msgCurve = (message.curve_type || activeCurve) as CurveType;
        const old_t = message.old_t;
        const new_t = message.new_t;
        const new_n = message.new_n;

        setNewThreshold(new_t);
        newThresholdRef.current = new_t;
        setNewN(new_n);
        newNRef.current = new_n;
        setCurrentStep(1);

        if (isOldSigner) {
          await runOldSignerProtocol(
            message.old_signers,
            message.new_signers,
            new_t,
            msgCurve
          );
        } else {
          await runNewSignerProtocol(
            message.old_signers,
            message.new_signers,
            new_t,
            new_n,
            msgCurve
          );
        }
      });

      coordinatorWS.on('recovery_success', (message: any) => {
        console.log('[Recovery] Ceremony completed!');
        setStatus('Complete!');
        setCurrentStep(4);

        // Read from refs (not stale closure) and fall back to message payload
        const finalAddress = walletAddressResultRef.current || walletAddress;
        const finalThreshold = message.new_threshold ?? newThresholdRef.current;
        const finalN = message.new_n ?? newNRef.current;

        // Navigate to done screen
        setTimeout(() => {
          navigation.navigate('RecoveryDone', {
            walletAddress: finalAddress,
            participantType,
            newThreshold: finalThreshold,
            newN: finalN,
          });
        }, 1500);
      });

      coordinatorWS.on('recovery_failed', (message: any) => {
        console.error('[Recovery] Ceremony failed:', message.reason);
        setError(message.reason || 'Recovery ceremony failed');
        setStatus('Failed');
      });

      coordinatorWS.on('recovery_cancelled', () => {
        Alert.alert(
          'Recovery Cancelled',
          'This recovery ceremony was cancelled by the admin.',
          [{ text: 'OK', onPress: () => navigation.navigate('MainTabs' as never) }]
        );
      });
    } catch (error: any) {
      console.error('[Recovery] Failed to initialize:', error);
      setError(error.message || 'Connection failed');
      setStatus('Error');
    }
  };

  // ---------------------------------------------------------------------------
  // OLD SIGNER PROTOCOL
  // ---------------------------------------------------------------------------

  const runOldSignerProtocol = async (
    oldSigners: OldSignerInfo[],
    newSigners: NewSignerInfo[],
    newThresholdVal: number,
    curve: CurveType
  ) => {
    try {
      setStatus('Loading existing key share...');

      // Load existing key share from secure storage
      const existingShare = await SecureStorage.getVaultKeyShareByAddress(walletAddress);
      if (!existingShare) {
        throw new Error('Cannot find existing key share for this vault');
      }

      setCurrentStep(2);
      setStatus('Generating sub-shares...');

      const OldSignerReshare = getOldSignerReshare(curve);
      const myOldIndex = oldSignerIndex!;

      // Build new signer public key map
      const newSignerPubKeys: Record<number, string> = {};
      const newSignerIndices: number[] = [];
      for (const ns of newSigners) {
        newSignerPubKeys[ns.new_signer_index] = ns.device_public_key;
        newSignerIndices.push(ns.new_signer_index);
      }

      // Generate round 1: polynomial + Feldman commitments + encrypted sub-shares
      const round1 = OldSignerReshare.generateRound1(
        existingShare.share,
        myOldIndex,
        newSignerIndices,
        newThresholdVal,
        newSignerPubKeys
      );

      setCurrentStep(3);
      setStatus('Sending encrypted sub-shares...');

      // Broadcast commitments to all participants
      coordinatorWS.send({
        type: 'recovery_round',
        from_participant: participantId,
        to_participant: '*',
        round: 1,
        payload: JSON.stringify({
          fromOldIndex: myOldIndex,
          commitments: round1.commitments,
        }),
        timestamp: new Date().toISOString(),
      });

      // Send each encrypted sub-share to the specific new signer
      for (const ns of newSigners) {
        const encryptedSubShare = round1.encryptedSubShares[ns.new_signer_index];
        if (encryptedSubShare) {
          coordinatorWS.send({
            type: 'recovery_round',
            from_participant: participantId,
            to_participant: ns.participant_id,
            round: 1,
            payload: JSON.stringify({
              fromOldIndex: myOldIndex,
              encryptedSubShare,
            }),
            timestamp: new Date().toISOString(),
          });
        }
      }

      console.log(
        `[Recovery] Old signer ${myOldIndex} sent commitments and ` +
          `${newSignerIndices.length} encrypted sub-shares`
      );

      setStatus('Waiting for new signers to complete...');

      // Old signer waits for recovery_success (the coordinator handles consensus)
      // We report our completion to the coordinator
      coordinatorWS.send({
        type: 'recovery_complete',
        participant_id: participantId,
        wallet_address: walletAddress,
        participant_type: 'old_signer',
        old_share_deletion_confirmed: false, // Will be confirmed in done screen
      });

    } catch (error: any) {
      console.error('[Recovery] Old signer error:', error);
      setError('Recovery failed: ' + error.message);
    }
  };

  // ---------------------------------------------------------------------------
  // NEW SIGNER PROTOCOL
  // ---------------------------------------------------------------------------

  const runNewSignerProtocol = async (
    oldSigners: OldSignerInfo[],
    newSigners: NewSignerInfo[],
    newThresholdVal: number,
    newNVal: number,
    curve: CurveType
  ) => {
    try {
      setStatus('Waiting for old signers to send sub-shares...');

      const myNewIndex = newSignerIndex!;
      const expectedOldSignerCount = oldSigners.length;

      // Register round data listener to collect data from old signers
      const roundDataPromise = new Promise<void>((resolve) => {
        const handler = (message: any) => {
          if (message.round !== 1) return;
          try {
            const payload = JSON.parse(message.payload);
            const fromOldIndex = payload.fromOldIndex as number;

            if (!receivedOldSignerDataRef.current.has(fromOldIndex)) {
              receivedOldSignerDataRef.current.set(fromOldIndex, {});
            }
            const entry = receivedOldSignerDataRef.current.get(fromOldIndex)!;

            if (payload.commitments) {
              entry.commitments = payload.commitments;
              console.log(`[Recovery] Received commitments from old signer ${fromOldIndex}`);
            }
            if (payload.encryptedSubShare) {
              entry.encryptedSubShare = payload.encryptedSubShare;
              console.log(`[Recovery] Received encrypted sub-share from old signer ${fromOldIndex}`);
            }

            // Check if we have complete data from all old signers
            let completeCount = 0;
            for (const [, data] of receivedOldSignerDataRef.current) {
              if (data.commitments && data.encryptedSubShare) {
                completeCount++;
              }
            }

            setStatus(`Receiving sub-shares (${completeCount}/${expectedOldSignerCount})...`);

            if (completeCount >= expectedOldSignerCount) {
              coordinatorWS.off('recovery_round', handler);
              resolve();
            }
          } catch (err) {
            console.error('[Recovery] Error processing round message:', err);
          }
        };
        coordinatorWS.on('recovery_round', handler);
      });

      setCurrentStep(2);
      await roundDataPromise;
      console.log('[Recovery] Received all old signer data');

      setCurrentStep(3);
      setStatus('Computing new key share...');

      // Process all sub-shares
      const NewSignerReshare = getNewSignerReshare(curve);
      const oldSignerData: Array<{
        oldSignerIndex: number;
        commitments: string[];
        encryptedSubShare: EncryptedSubShare;
      }> = [];

      for (const [oldIdx, data] of receivedOldSignerDataRef.current) {
        if (data.commitments && data.encryptedSubShare) {
          oldSignerData.push({
            oldSignerIndex: oldIdx,
            commitments: data.commitments,
            encryptedSubShare: data.encryptedSubShare,
          });
        }
      }

      const result = NewSignerReshare.processSubShares(
        myNewIndex,
        devicePrivateKey,
        oldSignerData
      );

      console.log(`[Recovery] New signer ${myNewIndex} computed address: ${result.walletAddress}`);

      // Verify address matches expected vault address
      // EVM addresses are case-insensitive (hex), Solana addresses are case-sensitive (base58)
      const isEVM = walletAddress.startsWith('0x');
      const addressMatch = isEVM
        ? result.walletAddress.toLowerCase() === walletAddress.toLowerCase()
        : result.walletAddress === walletAddress;
      if (!addressMatch) {
        throw new Error(
          `Address mismatch! Expected ${walletAddress} but computed ${result.walletAddress}. ` +
            'This may indicate a protocol error.'
        );
      }

      // Store new key share
      const vaultChain = (chain || 'EVM') as 'EVM' | 'SOLANA';
      const vaultCurve = (curveType || 'secp256k1') as 'secp256k1' | 'ed25519';
      const newVaultKeyShare: VaultKeyShare = {
        vault_id: vaultId || `recovered_${result.walletAddress}`,
        share: result.newKeyShare,
        participant_id: participantId,
        org_id: 'recovery',
        role: role,
        wallet_address: result.walletAddress,
        chain: vaultChain,
        curve_type: vaultCurve,
        signer_index: myNewIndex,
        created_at: new Date().toISOString(),
      };

      await SecureStorage.storeVaultKeyShare(newVaultKeyShare);
      addVault(newVaultKeyShare);
      console.log(`[Recovery] Saved new key share: ${newVaultKeyShare.vault_id} (${vaultChain})`);

      setWalletAddressResult(result.walletAddress);
      walletAddressResultRef.current = result.walletAddress;
      setStatus('Reporting completion...');

      // Report completion to coordinator
      coordinatorWS.send({
        type: 'recovery_complete',
        participant_id: participantId,
        wallet_address: result.walletAddress,
        participant_type: 'new_signer',
        public_key_share: result.combinedPublicKey,
      });

      setStatus('Waiting for confirmation...');
    } catch (error: any) {
      console.error('[Recovery] New signer error:', error);
      setError('Recovery failed: ' + error.message);
    }
  };

  // ---------------------------------------------------------------------------
  // UI helpers
  // ---------------------------------------------------------------------------

  const handleCopyAddress = async () => {
    const addr = walletAddressResult || walletAddress;
    if (addr) {
      await Clipboard.setStringAsync(addr);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  const getStepStatus = (step: number) => {
    if (currentStep === 4) return 'done'; // all done
    if (error) return currentStep >= step ? 'error' : 'pending';
    if (currentStep > step) return 'done';
    if (currentStep === step) return 'active';
    return 'pending';
  };

  const steps = isOldSigner
    ? [
        { num: 1, label: 'Load key share' },
        { num: 2, label: 'Generate sub-shares' },
        { num: 3, label: 'Send to new signers' },
      ]
    : [
        { num: 1, label: 'Wait for sub-shares' },
        { num: 2, label: 'Receive & verify' },
        { num: 3, label: 'Compute new key share' },
      ];

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        {currentStep < 4 && !error && (
          <ActivityIndicator size="large" color="#2D9D92" />
        )}
        {currentStep === 4 && (
          <Ionicons name="checkmark-circle" size={48} color="#2D9D92" />
        )}
        <Text style={styles.title}>
          {currentStep === 4
            ? 'Recovery Complete'
            : error
            ? 'Recovery Failed'
            : 'Vault Recovery'}
        </Text>
        <Text style={styles.subtitle}>{status}</Text>
        {isOldSigner && (
          <View style={[styles.typeBadgeSmall, styles.oldSignerBadge]}>
            <Text style={styles.oldSignerTextSmall}>Old Signer</Text>
          </View>
        )}
        {!isOldSigner && (
          <View style={[styles.typeBadgeSmall, styles.newSignerBadge]}>
            <Text style={styles.newSignerTextSmall}>New Signer</Text>
          </View>
        )}
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
        {newThreshold > 0 && newN > 0 && (
          <View style={[styles.detailRow, { borderBottomWidth: 0 }]}>
            <Text style={styles.detailLabel}>New Threshold</Text>
            <Text style={styles.detailValue}>{newThreshold}-of-{newN}</Text>
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
                    (stepStatus === 'done' || stepStatus === 'active') &&
                      styles.stepCircleTextActive,
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
                <ActivityIndicator
                  size="small"
                  color="#2D9D92"
                  style={{ marginLeft: 'auto' }}
                />
              )}
            </View>
          );
        })}
      </View>

      {/* Success — for new signers, show the derived address */}
      {currentStep === 4 && !isOldSigner && walletAddressResult && (
        <View style={styles.successCard}>
          <Ionicons name="checkmark-circle" size={48} color="#2D9D92" style={styles.successIcon} />
          <Text style={styles.successTitle}>Key Share Stored</Text>
          <View style={styles.addressContainer}>
            <View style={styles.addressHeader}>
              <Text style={styles.addressLabel}>Wallet Address</Text>
              <TouchableOpacity onPress={handleCopyAddress} style={styles.copyButton}>
                <Ionicons
                  name={copied ? 'checkmark-circle' : 'copy-outline'}
                  size={18}
                  color={copied ? '#10B981' : '#6B7280'}
                />
                <Text style={[styles.copyText, copied && styles.copyTextSuccess]}>
                  {copied ? 'Copied!' : 'Copy'}
                </Text>
              </TouchableOpacity>
            </View>
            <Text style={styles.address} selectable>
              {walletAddressResult}
            </Text>
          </View>
          <TouchableOpacity
            style={styles.doneButton}
            onPress={() =>
              navigation.navigate('RecoveryDone', {
                walletAddress: walletAddressResult,
                participantType,
                newThreshold,
                newN,
              })
            }
          >
            <Text style={styles.doneButtonText}>Done</Text>
          </TouchableOpacity>
        </View>
      )}

      {/* Success — for old signers */}
      {currentStep === 4 && isOldSigner && (
        <View style={styles.successCard}>
          <Ionicons name="checkmark-circle" size={48} color="#2D9D92" style={styles.successIcon} />
          <Text style={styles.successTitle}>Sub-Shares Delivered</Text>
          <Text style={styles.successSubtext}>
            Your encrypted sub-shares were successfully delivered to the new committee.
          </Text>
          <TouchableOpacity
            style={styles.doneButton}
            onPress={() =>
              navigation.navigate('RecoveryDone', {
                walletAddress,
                participantType,
                newThreshold,
                newN,
              })
            }
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
    marginBottom: 24,
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
    textAlign: 'center',
    marginBottom: 8,
  },
  typeBadgeSmall: {
    paddingHorizontal: 12,
    paddingVertical: 4,
    borderRadius: 12,
  },
  oldSignerBadge: {
    backgroundColor: '#E6F6F4',
  },
  newSignerBadge: {
    backgroundColor: '#FEF3C7',
  },
  oldSignerTextSmall: {
    fontSize: 12,
    fontWeight: '600',
    color: '#2D9D92',
  },
  newSignerTextSmall: {
    fontSize: 12,
    fontWeight: '600',
    color: '#D97706',
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
    marginBottom: 8,
  },
  successSubtext: {
    fontSize: 14,
    color: '#6B7280',
    textAlign: 'center',
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
    marginTop: 12,
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
