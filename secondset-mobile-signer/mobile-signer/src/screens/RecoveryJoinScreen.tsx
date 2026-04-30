// mobile-signer/src/screens/RecoveryJoinScreen.tsx

import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Alert,
  ActivityIndicator,
} from 'react-native';
import { useRoute, useNavigation } from '@react-navigation/native';
import { Ionicons } from '@expo/vector-icons';
import { CoordinatorAPI } from '../services/CoordinatorAPI';
import { DeviceInfo } from '../services/DeviceInfo';
import { BiometricAuth } from '../services/BiometricAuth';
import { SecureStorage } from '../services/SecureStorage';
import { generateDeviceKeyPair, CurveType } from '../services/TSS/CryptoFactory';
import type { RootStackParamList } from '../navigation/types';
import type { RouteProp } from '@react-navigation/native';

type Role = 'cfo' | 'controller' | 'backup';

const ROLE_LABELS: Record<Role, string> = {
  cfo: 'CFO',
  controller: 'Controller',
  backup: 'Backup',
};

export const RecoveryJoinScreen: React.FC = () => {
  const route = useRoute<RouteProp<RootStackParamList, 'RecoveryJoin'>>();
  const navigation = useNavigation();

  const { session_id, join_token, vault_id, wallet_address, chain, curve_type } = route.params;

  const [isOldSigner, setIsOldSigner] = useState<boolean | null>(null);
  const [existingRole, setExistingRole] = useState<string>('');
  const [selectedRole, setSelectedRole] = useState<Role | null>(null);
  const [joining, setJoining] = useState(false);
  const [checking, setChecking] = useState(true);

  // Check if this device has an existing key share for the vault
  useEffect(() => {
    checkExistingKeyShare();
  }, []);

  const checkExistingKeyShare = async () => {
    try {
      setChecking(true);
      const existingShare = await SecureStorage.getVaultKeyShareByAddress(wallet_address);
      if (existingShare) {
        setIsOldSigner(true);
        setExistingRole(existingShare.role);
        console.log(`Found existing key share for ${wallet_address} (role: ${existingShare.role})`);
      } else {
        setIsOldSigner(false);
        console.log(`No existing key share for ${wallet_address} — joining as new signer`);
      }
    } catch (error) {
      console.error('Error checking existing key share:', error);
      setIsOldSigner(false);
    } finally {
      setChecking(false);
    }
  };

  const handleJoin = async () => {
    const participantType = isOldSigner ? 'old_signer' : 'new_signer';
    const role = isOldSigner ? existingRole : selectedRole;

    if (!isOldSigner && !selectedRole) {
      Alert.alert('Select Role', 'Please select your signer role before joining.');
      return;
    }

    try {
      setJoining(true);

      // Old signers must authenticate with biometrics
      let biometricVerified = false;
      if (isOldSigner) {
        const available = await BiometricAuth.isAvailable();
        if (available) {
          await BiometricAuth.requireAuthentication(
            'Authenticate to join vault recovery as an existing key holder'
          );
          biometricVerified = true;
        }
      }

      // Generate ECIES device keypair for this recovery ceremony
      const activeCurve = (curve_type || 'secp256k1') as CurveType;
      const deviceKeyPair = generateDeviceKeyPair(activeCurve);

      const deviceId = await DeviceInfo.getDeviceId();
      const data = await CoordinatorAPI.joinRecoverySession(
        session_id,
        join_token,
        deviceId,
        participantType,
        role || 'backup',
        deviceKeyPair.publicKey,
        biometricVerified
      );

      if (data.participant_id) {
        navigation.navigate('RecoveryProgress', {
          participantId: data.participant_id,
          sessionId: session_id,
          participantType,
          oldSignerIndex: data.old_signer_index,
          newSignerIndex: data.new_signer_index,
          wsUrl: data.ws_url,
          wsToken: data.ws_token,
          walletAddress: wallet_address,
          curveType: activeCurve,
          chain: chain || 'EVM',
          devicePrivateKey: deviceKeyPair.privateKey,
          role: role || 'backup',
          vaultId: vault_id,
        });
      } else {
        Alert.alert('Error', data.error || 'Failed to join recovery session.');
      }
    } catch (error: any) {
      const message =
        error?.response?.data?.error ||
        error?.message ||
        'Could not join the recovery session. Please try again.';
      Alert.alert('Join Failed', message);
    } finally {
      setJoining(false);
    }
  };

  if (checking) {
    return (
      <View style={[styles.container, styles.center]}>
        <ActivityIndicator size="large" color="#2D9D92" />
        <Text style={styles.checkingText}>Checking for existing key share...</Text>
      </View>
    );
  }

  const shortAddress = `${wallet_address.slice(0, 8)}...${wallet_address.slice(-6)}`;

  return (
    <View style={styles.container}>
      {/* Vault Info Card */}
      <View style={styles.card}>
        <Text style={styles.cardTitle}>Vault Recovery</Text>

        <View style={styles.detailRow}>
          <Text style={styles.detailLabel}>Vault Address</Text>
          <Text style={styles.detailValue} numberOfLines={1} ellipsizeMode="middle">
            {shortAddress}
          </Text>
        </View>

        <View style={styles.detailRow}>
          <Text style={styles.detailLabel}>Chain</Text>
          <Text style={styles.detailValue}>{chain}</Text>
        </View>

        <View style={[styles.detailRow, { borderBottomWidth: 0 }]}>
          <Text style={styles.detailLabel}>Your Role</Text>
          <View style={[styles.typeBadge, isOldSigner ? styles.oldSignerBadge : styles.newSignerBadge]}>
            <Text style={[styles.typeBadgeText, isOldSigner ? styles.oldSignerText : styles.newSignerText]}>
              {isOldSigner ? 'Old Signer' : 'New Signer'}
            </Text>
          </View>
        </View>
      </View>

      {/* Old Signer Info */}
      {isOldSigner && (
        <View style={styles.infoCard}>
          <Ionicons name="shield-checkmark" size={24} color="#2D9D92" style={styles.infoIcon} />
          <View style={styles.infoContent}>
            <Text style={styles.infoTitle}>Existing Key Holder</Text>
            <Text style={styles.infoText}>
              This device has a key share for this vault (role: {existingRole}).
              You'll help redistribute shares to the new committee.
              Biometric authentication is required.
            </Text>
          </View>
        </View>
      )}

      {/* New Signer Info + Role Selection */}
      {!isOldSigner && (
        <>
          <View style={styles.infoCard}>
            <Ionicons name="person-add" size={24} color="#F59E0B" style={styles.infoIcon} />
            <View style={styles.infoContent}>
              <Text style={styles.infoTitle}>New Committee Member</Text>
              <Text style={styles.infoText}>
                This device will receive a new key share for this vault.
                Select a role and join the recovery ceremony.
              </Text>
            </View>
          </View>

          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Select Your Role</Text>
            <Text style={styles.sectionSubtitle}>
              Choose the signer role assigned to this device
            </Text>

            <View style={styles.roleRow}>
              {(['cfo', 'controller', 'backup'] as Role[]).map((role) => (
                <TouchableOpacity
                  key={role}
                  style={[
                    styles.rolePill,
                    selectedRole === role && styles.rolePillSelected,
                  ]}
                  onPress={() => setSelectedRole(role)}
                  disabled={joining}
                >
                  <Text
                    style={[
                      styles.rolePillText,
                      selectedRole === role && styles.rolePillTextSelected,
                    ]}
                  >
                    {ROLE_LABELS[role]}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>
          </View>
        </>
      )}

      {/* Warning */}
      <View style={styles.warning}>
        <Ionicons name="alert-circle" size={18} color="#856404" style={{ marginRight: 10 }} />
        <Text style={styles.warningText}>
          {isOldSigner
            ? 'Your old key share will be securely deleted after recovery completes.'
            : 'Your new key share will be stored in this device\'s secure storage.'}
        </Text>
      </View>

      {/* Join Button */}
      <View style={styles.actions}>
        <TouchableOpacity
          style={[
            styles.joinButton,
            ((!isOldSigner && !selectedRole) || joining) && styles.joinButtonDisabled,
          ]}
          onPress={handleJoin}
          disabled={(!isOldSigner && !selectedRole) || joining}
        >
          {joining ? (
            <ActivityIndicator color="#fff" />
          ) : (
            <Text style={styles.joinButtonText}>
              {isOldSigner ? 'Authenticate & Join Recovery' : 'Join Recovery'}
            </Text>
          )}
        </TouchableOpacity>
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#F8FAFB',
    padding: 16,
  },
  center: {
    justifyContent: 'center',
    alignItems: 'center',
  },
  checkingText: {
    marginTop: 16,
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
  cardTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: '#1F2937',
    marginBottom: 16,
  },
  detailRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: '#F3F4F6',
  },
  detailLabel: {
    fontSize: 14,
    color: '#6B7280',
  },
  detailValue: {
    fontSize: 14,
    fontWeight: '500',
    color: '#1F2937',
    maxWidth: '60%',
  },
  typeBadge: {
    paddingHorizontal: 12,
    paddingVertical: 5,
    borderRadius: 20,
  },
  oldSignerBadge: {
    backgroundColor: '#E6F6F4',
  },
  newSignerBadge: {
    backgroundColor: '#FEF3C7',
  },
  typeBadgeText: {
    fontSize: 13,
    fontWeight: '600',
  },
  oldSignerText: {
    color: '#2D9D92',
  },
  newSignerText: {
    color: '#D97706',
  },
  infoCard: {
    flexDirection: 'row',
    backgroundColor: 'white',
    borderRadius: 16,
    padding: 16,
    marginBottom: 16,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 4,
    elevation: 2,
  },
  infoIcon: {
    marginRight: 14,
    marginTop: 2,
  },
  infoContent: {
    flex: 1,
  },
  infoTitle: {
    fontSize: 15,
    fontWeight: '600',
    color: '#1F2937',
    marginBottom: 4,
  },
  infoText: {
    fontSize: 13,
    color: '#6B7280',
    lineHeight: 19,
  },
  section: {
    marginBottom: 16,
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: '#1F2937',
    marginBottom: 4,
  },
  sectionSubtitle: {
    fontSize: 14,
    color: '#6B7280',
    marginBottom: 16,
  },
  roleRow: {
    flexDirection: 'row',
    gap: 10,
  },
  rolePill: {
    flex: 1,
    paddingVertical: 14,
    borderRadius: 24,
    alignItems: 'center',
    backgroundColor: 'white',
    borderWidth: 2,
    borderColor: '#E5E7EB',
  },
  rolePillSelected: {
    backgroundColor: '#2D9D92',
    borderColor: '#2D9D92',
  },
  rolePillText: {
    fontSize: 15,
    fontWeight: '600',
    color: '#6B7280',
  },
  rolePillTextSelected: {
    color: 'white',
  },
  warning: {
    flexDirection: 'row',
    backgroundColor: '#FFF3CD',
    padding: 14,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#FFC107',
    marginBottom: 16,
    alignItems: 'flex-start',
  },
  warningText: {
    flex: 1,
    fontSize: 13,
    color: '#856404',
    lineHeight: 19,
  },
  actions: {
    marginTop: 'auto',
    paddingBottom: 16,
  },
  joinButton: {
    backgroundColor: '#2D9D92',
    paddingVertical: 16,
    borderRadius: 12,
    alignItems: 'center',
  },
  joinButtonDisabled: {
    opacity: 0.5,
  },
  joinButtonText: {
    color: 'white',
    fontSize: 17,
    fontWeight: '600',
  },
});
