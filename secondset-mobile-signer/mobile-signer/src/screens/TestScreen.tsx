// mobile-signer/src/screens/TestScreen.tsx

import React, { useState } from 'react';
import { View, Text, TextInput, TouchableOpacity, StyleSheet, ScrollView } from 'react-native';
import { useNavigation } from '@react-navigation/native';

export const TestScreen = () => {
  const navigation = useNavigation();
  const [sessionId, setSessionId] = useState('');
  const [orgId, setOrgId] = useState('test-org-123');
  const [role, setRole] = useState('cfo');

  const handleJoinCeremony = () => {
    if (!sessionId.trim()) {
      alert('Please enter a Session ID');
      return;
    }

    navigation.navigate('Enroll', {
      sessionId: sessionId.trim(),
      orgId: orgId.trim(),
      role,
    });
  };

  const handleTestSigning = () => {
    // Navigate to signing request with mock data
    navigation.navigate('SigningRequest', {
      sessionId: 'test-signing-session',
      txDetails: {
        to: '0x742d35Cc6634C0532925a3b844Bc9e7595f0bFc7',
        value: '1000.00',
        token: 'USDC',
        chain: 'Ethereum',
        requestId: 'REQ-2024-001',
        requestedBy: 'Alice (Initiator)',
        approvedBy: ['CFO', 'Controller'],
      },
    });
  };

  return (
    <ScrollView style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.logo}>Ì¥ê</Text>
        <Text style={styles.title}>SecondSet Signer</Text>
        <Text style={styles.subtitle}>Test Interface</Text>
      </View>

      {/* Keygen Section */}
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Keygen Ceremony</Text>
        
        <View style={styles.inputGroup}>
          <Text style={styles.label}>Session ID</Text>
          <TextInput
            style={styles.input}
            value={sessionId}
            onChangeText={setSessionId}
            placeholder="Enter session ID from coordinator"
            placeholderTextColor="#9CA3AF"
          />
        </View>

        <View style={styles.inputGroup}>
          <Text style={styles.label}>Org ID</Text>
          <TextInput
            style={styles.input}
            value={orgId}
            onChangeText={setOrgId}
            placeholder="test-org-123"
            placeholderTextColor="#9CA3AF"
          />
        </View>

        <View style={styles.inputGroup}>
          <Text style={styles.label}>Role</Text>
          <View style={styles.roleButtons}>
            <TouchableOpacity
              style={[styles.roleButton, role === 'cfo' && styles.roleButtonActive]}
              onPress={() => setRole('cfo')}
            >
              <Text style={[styles.roleButtonText, role === 'cfo' && styles.roleButtonTextActive]}>
                CFO
              </Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.roleButton, role === 'controller' && styles.roleButtonActive]}
              onPress={() => setRole('controller')}
            >
              <Text style={[styles.roleButtonText, role === 'controller' && styles.roleButtonTextActive]}>
                Controller
              </Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.roleButton, role === 'backup' && styles.roleButtonActive]}
              onPress={() => setRole('backup')}
            >
              <Text style={[styles.roleButtonText, role === 'backup' && styles.roleButtonTextActive]}>
                Backup
              </Text>
            </TouchableOpacity>
          </View>
        </View>

        <TouchableOpacity style={styles.button} onPress={handleJoinCeremony}>
          <Text style={styles.buttonText}>Join Keygen Ceremony</Text>
        </TouchableOpacity>
      </View>

      {/* Divider */}
      <View style={styles.divider} />

      {/* Signing Section */}
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Transaction Signing</Text>
        <Text style={styles.sectionDescription}>
          Test the transaction signing flow with mock data
        </Text>

        <TouchableOpacity style={[styles.button, styles.buttonSecondary]} onPress={handleTestSigning}>
          <Text style={styles.buttonText}>Test Signing Flow</Text>
        </TouchableOpacity>
      </View>

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
    paddingTop: 60,
    paddingBottom: 40,
    paddingHorizontal: 24,
  },
  logo: {
    fontSize: 64,
    marginBottom: 16,
  },
  title: {
    fontSize: 32,
    fontWeight: '700',
    color: '#1F2937',
    marginBottom: 8,
  },
  subtitle: {
    fontSize: 16,
    color: '#6B7280',
  },
  section: {
    paddingHorizontal: 24,
    paddingVertical: 16,
  },
  sectionTitle: {
    fontSize: 20,
    fontWeight: '600',
    color: '#1F2937',
    marginBottom: 8,
  },
  sectionDescription: {
    fontSize: 14,
    color: '#6B7280',
    marginBottom: 16,
    lineHeight: 20,
  },
  inputGroup: {
    marginBottom: 20,
  },
  label: {
    fontSize: 14,
    fontWeight: '600',
    color: '#374151',
    marginBottom: 8,
  },
  input: {
    backgroundColor: 'white',
    borderWidth: 1,
    borderColor: '#E5E7EB',
    borderRadius: 12,
    padding: 16,
    fontSize: 16,
    color: '#1F2937',
  },
  roleButtons: {
    flexDirection: 'row',
    gap: 8,
  },
  roleButton: {
    flex: 1,
    backgroundColor: 'white',
    borderWidth: 2,
    borderColor: '#E5E7EB',
    borderRadius: 10,
    padding: 12,
    alignItems: 'center',
  },
  roleButtonActive: {
    borderColor: '#2D9D92',
    backgroundColor: '#D1FAE5',
  },
  roleButtonText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#6B7280',
  },
  roleButtonTextActive: {
    color: '#065F46',
  },
  button: {
    backgroundColor: '#2D9D92',
    borderRadius: 12,
    padding: 16,
    alignItems: 'center',
    shadowColor: '#2D9D92',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 4,
  },
  buttonSecondary: {
    backgroundColor: '#3B82F6',
    shadowColor: '#3B82F6',
  },
  buttonText: {
    fontSize: 16,
    fontWeight: '600',
    color: 'white',
  },
  divider: {
    height: 1,
    backgroundColor: '#E5E7EB',
    marginVertical: 24,
    marginHorizontal: 24,
  },
  spacer: {
    height: 40,
  },
});
