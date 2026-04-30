// mobile-signer/src/screens/JoinCeremonyScreen.tsx

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
import { CoordinatorAPI } from '../services/CoordinatorAPI';
import { DeviceInfo } from '../services/DeviceInfo';
import { useCeremonyStore } from '../store/ceremonyStore';
import type { RootStackParamList } from '../navigation/types';
import type { RouteProp } from '@react-navigation/native';

type Role = 'cfo' | 'controller' | 'backup';

const ROLE_LABELS: Record<Role, string> = {
  cfo: 'CFO',
  controller: 'Controller',
  backup: 'Backup',
};

export const JoinCeremonyScreen: React.FC = () => {
  const route = useRoute<RouteProp<RootStackParamList, 'JoinCeremony'>>();
  const navigation = useNavigation();
  const setCeremonyData = useCeremonyStore((state) => state.setCeremonyData);

  const { session_id, join_token, org_id, expiry, chain, curve_type, vault_id } = route.params;

  const [selectedRole, setSelectedRole] = useState<Role | null>(null);
  const [joining, setJoining] = useState(false);
  const [timeLeft, setTimeLeft] = useState('');

  // Countdown timer for session expiry
  useEffect(() => {
    if (!expiry) return;

    const updateTimer = () => {
      const remaining = new Date(expiry).getTime() - Date.now();
      if (remaining <= 0) {
        setTimeLeft('Expired');
        return;
      }
      const mins = Math.floor(remaining / 60000);
      const secs = Math.floor((remaining % 60000) / 1000);
      setTimeLeft(`${mins}:${secs.toString().padStart(2, '0')}`);
    };

    updateTimer();
    const interval = setInterval(updateTimer, 1000);
    return () => clearInterval(interval);
  }, [expiry]);

  const handleJoin = async () => {
    if (!selectedRole) {
      Alert.alert('Select Role', 'Please select your signer role before joining.');
      return;
    }

    if (expiry && new Date(expiry).getTime() <= Date.now()) {
      Alert.alert('Session Expired', 'This ceremony has expired. Please get a new QR code.');
      return;
    }

    try {
      setJoining(true);

      const deviceId = await DeviceInfo.getDeviceId();
      const data = await CoordinatorAPI.joinKeygenSession(
        session_id,
        join_token,
        deviceId,
        selectedRole
      );

      if (data.participant_id) {
        setCeremonyData({
          sessionId: session_id,
          participantId: data.participant_id,
          signerIndex: data.signer_index,
          wsUrl: data.ws_url,
          wsToken: data.ws_token,
          role: selectedRole,
          orgName: data.org_name || org_id || '',
          chain: chain,
          curveType: curve_type,
          vaultId: vault_id,
        });

        navigation.navigate('CeremonyLobby', {
          participantId: data.participant_id,
          sessionId: session_id,
        });
      } else {
        Alert.alert('Error', data.error || 'Failed to join ceremony.');
      }
    } catch (error: any) {
      const message =
        error?.response?.data?.error ||
        error?.message ||
        'Could not join the ceremony. Please try again.';
      Alert.alert('Join Failed', message);
    } finally {
      setJoining(false);
    }
  };

  return (
    <View style={styles.container}>
      {/* Session Info */}
      <View style={styles.card}>
        <Text style={styles.cardTitle}>Session Details</Text>

        <View style={styles.detailRow}>
          <Text style={styles.detailLabel}>Session</Text>
          <Text style={styles.detailValue} numberOfLines={1} ellipsizeMode="middle">
            {session_id}
          </Text>
        </View>

        {org_id && (
          <View style={styles.detailRow}>
            <Text style={styles.detailLabel}>Organization</Text>
            <Text style={styles.detailValue}>{org_id}</Text>
          </View>
        )}

        {expiry && (
          <View style={styles.detailRow}>
            <Text style={styles.detailLabel}>Expires in</Text>
            <Text
              style={[
                styles.detailValue,
                timeLeft === 'Expired' && styles.expiredText,
              ]}
            >
              {timeLeft}
            </Text>
          </View>
        )}
      </View>

      {/* Role Selection */}
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

      {/* Join Button */}
      <View style={styles.actions}>
        <TouchableOpacity
          style={[
            styles.joinButton,
            (!selectedRole || joining) && styles.joinButtonDisabled,
          ]}
          onPress={handleJoin}
          disabled={!selectedRole || joining}
        >
          {joining ? (
            <ActivityIndicator color="#fff" />
          ) : (
            <Text style={styles.joinButtonText}>Join Ceremony</Text>
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
  card: {
    backgroundColor: 'white',
    borderRadius: 16,
    padding: 20,
    marginBottom: 24,
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
  expiredText: {
    color: '#DC2626',
    fontWeight: '700',
  },
  section: {
    marginBottom: 32,
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
