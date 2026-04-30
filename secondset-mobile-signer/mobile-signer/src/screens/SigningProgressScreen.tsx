// mobile-signer/src/screens/SigningProgressScreen.tsx

import React, { useState, useEffect } from 'react';
import { View, Text, StyleSheet, ActivityIndicator } from 'react-native';
import { useRoute, useNavigation } from '@react-navigation/native';
import { Ionicons } from '@expo/vector-icons';
import { coordinatorWS } from '../services/CoordinatorWS';
import { SigningClient } from '../services/TSS/SigningClient';
import { SecureStorage } from '../services/SecureStorage';

export const SigningProgressScreen = () => {
  const route = useRoute();
  const navigation = useNavigation();
  const [currentRound, setCurrentRound] = useState(0);
  const [status, setStatus] = useState('Initializing...');
  const [progress, setProgress] = useState(0);

  useEffect(() => {
    runSigningProtocol();
  }, []);

  const runSigningProtocol = async () => {
    let signingClient: SigningClient | null = null;

    try {
      // Extract params from route
      const params = route.params as any;
      const { sessionId, participantId, signerIndex, wsUrl, wsToken, walletAddress, curveType } = params;

      setStatus('Connecting to signing session...');
      setProgress(10);

      // Connect to WebSocket
      await coordinatorWS.connect(wsUrl, wsToken);
      setProgress(20);

      // Initialize signing client with wallet address and curve type
      signingClient = new SigningClient();
      await signingClient.initialize(participantId, sessionId, signerIndex, {
        walletAddress,
        curveType,
      });
      setProgress(30);

      // Listen to signing rounds to update UI
      coordinatorWS.on('sign_round', (message: any) => {
        if (message.round === 1) {
          setCurrentRound(1);
          setStatus('Exchanging nonce commitments...');
          setProgress(50);
        }
      });

      coordinatorWS.on('signing_start', () => {
        setCurrentRound(1);
        setStatus('Generating signature nonce...');
        setProgress(40);
      });

      setStatus('Waiting for other signers...');

      // Run the signing ceremony
      const result = await signingClient.runCeremony();

      setCurrentRound(3);
      setStatus('Creating partial signature...');
      setProgress(90);

      await delay(500);

      setStatus('Signature complete!');
      setProgress(100);
      await delay(1000);

      // Navigate to success screen
      navigation.replace('SigningComplete', {
        signature: result.signature,
        curveType: curveType || 'secp256k1',
      });
    } catch (error) {
      console.error('Signing failed:', error);
      setStatus('Signing failed: ' + (error as Error).message);
      // TODO: Navigate to error screen
    } finally {
      if (signingClient) {
        signingClient.cleanup();
      }
    }
  };

  const delay = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

  return (
    <View style={styles.container}>
      {/* Progress Header */}
      <View style={styles.header}>
        <View style={styles.iconContainer}>
          <ActivityIndicator size="large" color="#2D9D92" />
        </View>
        <Text style={styles.title}>Signing Transaction</Text>
        <Text style={styles.subtitle}>{status}</Text>
      </View>

      {/* Progress Bar */}
      <View style={styles.progressContainer}>
        <View style={styles.progressBarBackground}>
          <View style={[styles.progressBarFill, { width: `${progress}%` }]} />
        </View>
        <Text style={styles.progressText}>{progress}% Complete</Text>
      </View>

      {/* Round Indicators */}
      <View style={styles.roundsContainer}>
        <View style={styles.roundCard}>
          <View style={[styles.roundIcon, currentRound >= 1 && styles.roundIconActive]}>
            {currentRound > 1 ? (
              <Ionicons name="checkmark" size={20} color="white" />
            ) : (
              <Text style={styles.roundNumber}>1</Text>
            )}
          </View>
          <View style={styles.roundContent}>
            <Text style={styles.roundLabel}>Generate Nonce</Text>
            <Text style={styles.roundDescription}>Creating random values</Text>
          </View>
        </View>

        <View style={styles.roundCard}>
          <View style={[styles.roundIcon, currentRound >= 2 && styles.roundIconActive]}>
            {currentRound > 2 ? (
              <Ionicons name="checkmark" size={20} color="white" />
            ) : (
              <Text style={styles.roundNumber}>2</Text>
            )}
          </View>
          <View style={styles.roundContent}>
            <Text style={styles.roundLabel}>Exchange Data</Text>
            <Text style={styles.roundDescription}>Secure communication</Text>
          </View>
        </View>

        <View style={styles.roundCard}>
          <View style={[styles.roundIcon, currentRound >= 3 && styles.roundIconActive]}>
            {currentRound > 3 ? (
              <Ionicons name="checkmark" size={20} color="white" />
            ) : (
              <Text style={styles.roundNumber}>3</Text>
            )}
          </View>
          <View style={styles.roundContent}>
            <Text style={styles.roundLabel}>Sign Transaction</Text>
            <Text style={styles.roundDescription}>Creating signature</Text>
          </View>
        </View>
      </View>

      {/* Info Card */}
      <View style={styles.infoCard}>
        <Ionicons name="shield-checkmark" size={24} color="#3730A3" style={styles.infoIcon} />
        <View style={styles.infoTextContainer}>
          <Text style={styles.infoTitle}>Secure Multi-Party Signing</Text>
          <Text style={styles.infoText}>
            Your device is working with other signers to create a valid signature.
            No single device has access to the full private key.
          </Text>
        </View>
      </View>

      {/* Warning */}
      <View style={styles.warning}>
        <Ionicons name="alert-circle" size={16} color="#92400E" style={styles.warningIcon} />
        <Text style={styles.warningText}>
          Please keep this app open and your device connected to the internet
        </Text>
      </View>
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
    paddingTop: 40,
    paddingBottom: 32,
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
  progressContainer: {
    marginBottom: 32,
  },
  progressBarBackground: {
    height: 8,
    backgroundColor: '#E5E7EB',
    borderRadius: 4,
    overflow: 'hidden',
    marginBottom: 8,
  },
  progressBarFill: {
    height: '100%',
    backgroundColor: '#2D9D92',
    borderRadius: 4,
  },
  progressText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#2D9D92',
    textAlign: 'center',
  },
  roundsContainer: {
    marginBottom: 32,
  },
  roundCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'white',
    borderRadius: 12,
    padding: 16,
    marginBottom: 12,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 4,
    elevation: 2,
  },
  roundIcon: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: '#F3F4F6',
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 16,
  },
  roundIconActive: {
    backgroundColor: '#2D9D92',
  },
  roundNumber: {
    fontSize: 18,
    fontWeight: '700',
    color: '#9CA3AF',
  },
  roundContent: {
    flex: 1,
  },
  roundLabel: {
    fontSize: 16,
    fontWeight: '600',
    color: '#1F2937',
  },
  roundDescription: {
    fontSize: 13,
    color: '#9CA3AF',
  },
  infoCard: {
    flexDirection: 'row',
    backgroundColor: '#EEF2FF',
    borderRadius: 12,
    padding: 16,
    marginBottom: 16,
  },
  infoIcon: {
    marginRight: 12,
  },
  infoTextContainer: {
    flex: 1,
  },
  infoTitle: {
    fontSize: 14,
    fontWeight: '600',
    color: '#3730A3',
    marginBottom: 4,
  },
  infoText: {
    fontSize: 13,
    color: '#4C1D95',
    lineHeight: 18,
  },
  warning: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#FEF3C7',
    borderRadius: 8,
    padding: 12,
  },
  warningIcon: {
    marginRight: 8,
  },
  warningText: {
    fontSize: 13,
    color: '#92400E',
  },
});

