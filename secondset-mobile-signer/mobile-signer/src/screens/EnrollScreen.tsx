// mobile-signer/src/screens/EnrollScreen.tsx

import React, { useState, useCallback } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, Alert } from 'react-native';
import { CameraView, useCameraPermissions } from 'expo-camera';
import { useNavigation, useFocusEffect } from '@react-navigation/native';
import { Ionicons } from '@expo/vector-icons';
import { SecureStorage } from '../services/SecureStorage';
import { CoordinatorAPI } from '../services/CoordinatorAPI';

export const EnrollScreen: React.FC = () => {
  const navigation = useNavigation();
  const [permission, requestPermission] = useCameraPermissions();
  const [scanning, setScanning] = useState(false);
  const hasPermission = permission?.granted ?? null;

  // Stop scanner when tab loses focus
  useFocusEffect(
    useCallback(() => {
      return () => {
        setScanning(false);
      };
    }, [])
  );

  const handleQRScanned = async ({ data }: { data: string }) => {
    try {
      setScanning(false);

      // Parse QR code data
      const qrData = JSON.parse(data);

      // Detect recovery QR codes (type: "recovery")
      if (qrData.type === 'recovery') {
        const { session_id, join_token, vault_id, wallet_address, chain, curve_type } = qrData;

        if (!session_id || !join_token || !wallet_address) {
          Alert.alert('Error', 'Invalid recovery QR code. Missing required data.');
          return;
        }

        navigation.navigate('RecoveryJoin', {
          session_id,
          join_token,
          vault_id: vault_id || '',
          wallet_address,
          chain: chain || 'EVM',
          curve_type: curve_type || 'secp256k1',
        });
        return;
      }

      // Standard keygen QR code
      const { session_id, org_id, join_token, expiry } = qrData;

      // Parse new chain/curve fields (backward compat: default to EVM/secp256k1)
      const chain = qrData.chain || 'EVM';
      const curve_type = qrData.curve_type || 'secp256k1';
      const vault_id = qrData.vault_id;

      // Check if expired
      if (new Date(expiry) < new Date()) {
        Alert.alert('Error', 'This ceremony has expired. Please get a new QR code.');
        return;
      }

      // Navigate to join ceremony screen
      navigation.navigate('JoinCeremony', {
        session_id,
        org_id,
        join_token,
        expiry,
        chain,
        curve_type,
        vault_id,
      });
    } catch (error) {
      Alert.alert('Error', 'Invalid QR code. Please try again.');
      console.error('QR scan error:', error);
    }
  };

  const handleManualEntry = () => {
    navigation.navigate('ManualEntry');
  };

  if (hasPermission === null) {
    return (
      <View style={styles.container}>
        <Text>Requesting camera permission...</Text>
      </View>
    );
  }

  if (hasPermission === false) {
    return (
      <View style={styles.container}>
        <Text style={styles.errorText}>Camera permission is required</Text>
        <TouchableOpacity style={styles.button} onPress={() => {
          requestPermission();
        }}>
          <Text style={styles.buttonText}>Grant Permission</Text>
        </TouchableOpacity>
      </View>
    );
  }

  // Full-screen scanner mode
  if (scanning) {
    return (
      <View style={styles.scannerContainer}>
        {/* Camera View */}
        <CameraView
          style={styles.camera}
          barcodeScannerSettings={{
            barcodeTypes: ['qr'],
          }}
          onBarcodeScanned={scanning ? handleQRScanned : undefined}
        />

        {/* Overlay with scanning frame */}
        <View style={styles.scannerOverlay}>
          {/* Dark overlay background */}
          <View style={styles.overlayTop} />

          {/* Centered scanning frame */}
          <View style={styles.scanFrame}>
            {/* Corner indicators */}
            <View style={[styles.corner, styles.cornerTopLeft]} />
            <View style={[styles.corner, styles.cornerTopRight]} />
            <View style={[styles.corner, styles.cornerBottomLeft]} />
            <View style={[styles.corner, styles.cornerBottomRight]} />
          </View>

          {/* Instructions text */}
          <Text style={styles.scanInstructions}>Position QR code within the frame</Text>
        </View>

        {/* Cancel Button */}
        <TouchableOpacity
          style={styles.cancelButton}
          onPress={() => setScanning(false)}
        >
          <Ionicons name="close-circle" size={24} color="white" />
          <Text style={styles.cancelButtonText}>Cancel Scan</Text>
        </TouchableOpacity>
      </View>
    );
  }

  // Enrollment info screen
  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.title}>SecondSet Signer</Text>
        <Text style={styles.subtitle}>
          Welcome! This device will become an authorized signer for your organization's treasury wallet.
        </Text>
      </View>

      <View style={styles.instructions}>
        <Text style={styles.instructionTitle}>Before you begin:</Text>
        <Text style={styles.instruction}>• Enable biometric authentication</Text>
        <Text style={styles.instruction}>• Ensure stable internet connection</Text>
        <Text style={styles.instruction}>• Have your admin's QR code ready</Text>
      </View>

      <View style={styles.warning}>
        <Ionicons name="alert-circle" size={20} color="#856404" style={styles.warningIcon} />
        <Text style={styles.warningText}>
          Your signing key will be stored securely on THIS device only. If you lose this device,
          you'll need the backup signer to recover access.
        </Text>
      </View>

      <View style={styles.actions}>
        <TouchableOpacity
          style={styles.primaryButton}
          onPress={() => setScanning(true)}
        >
          <Text style={styles.buttonText}>Scan Ceremony QR Code</Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={styles.secondaryButton}
          onPress={handleManualEntry}
        >
          <Text style={styles.secondaryButtonText}>Enter Code Manually</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#fff',
    padding: 20,
  },
  header: {
    marginTop: 12,
    marginBottom: 30,
  },
  title: {
    fontSize: 28,
    fontWeight: 'bold',
    marginBottom: 10,
    color: '#1a1a1a',
  },
  subtitle: {
    fontSize: 16,
    color: '#666',
    lineHeight: 24,
  },
  instructions: {
    backgroundColor: '#f5f5f5',
    padding: 20,
    borderRadius: 12,
    marginBottom: 20,
  },
  instructionTitle: {
    fontSize: 16,
    fontWeight: '600',
    marginBottom: 12,
    color: '#1a1a1a',
  },
  instruction: {
    fontSize: 14,
    color: '#666',
    marginBottom: 8,
  },
  warning: {
    flexDirection: 'row',
    backgroundColor: '#fff3cd',
    padding: 16,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#ffc107',
    marginBottom: 30,
  },
  warningIcon: {
    marginRight: 12,
    marginTop: 2,
  },
  warningText: {
    flex: 1,
    fontSize: 14,
    color: '#856404',
    lineHeight: 20,
  },
  actions: {
    gap: 12,
  },
  primaryButton: {
    backgroundColor: '#2D9D92',
    padding: 16,
    borderRadius: 12,
    alignItems: 'center',
  },
  secondaryButton: {
    backgroundColor: '#fff',
    padding: 16,
    borderRadius: 12,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#2D9D92',
  },
  buttonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
  },
  secondaryButtonText: {
    color: '#2D9D92',
    fontSize: 16,
    fontWeight: '600',
  },
  scannerContainer: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: '#000',
  },
  camera: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
  },
  scannerOverlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    justifyContent: 'center',
    alignItems: 'center',
  },
  overlayTop: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: 'rgba(0, 0, 0, 0.6)',
  },
  overlayMiddle: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
  },
  overlaySide: {
    display: 'none',
  },
  scanFrame: {
    width: 300,
    height: 300,
    position: 'relative',
    zIndex: 1,
  },
  corner: {
    position: 'absolute',
    width: 50,
    height: 50,
    borderColor: '#2D9D92',
  },
  cornerTopLeft: {
    top: 0,
    left: 0,
    borderTopWidth: 5,
    borderLeftWidth: 5,
  },
  cornerTopRight: {
    top: 0,
    right: 0,
    borderTopWidth: 5,
    borderRightWidth: 5,
  },
  cornerBottomLeft: {
    bottom: 0,
    left: 0,
    borderBottomWidth: 5,
    borderLeftWidth: 5,
  },
  cornerBottomRight: {
    bottom: 0,
    right: 0,
    borderBottomWidth: 5,
    borderRightWidth: 5,
  },
  overlayBottom: {
    display: 'none',
  },
  scanInstructions: {
    position: 'absolute',
    bottom: 180,
    left: 0,
    right: 0,
    color: 'white',
    fontSize: 18,
    fontWeight: '600',
    textAlign: 'center',
    paddingHorizontal: 40,
    zIndex: 2,
  },
  cancelButton: {
    position: 'absolute',
    bottom: 40,
    left: 20,
    right: 20,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    backgroundColor: 'rgba(255, 255, 255, 0.2)',
    backdropFilter: 'blur(10px)',
    padding: 16,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.3)',
  },
  cancelButtonText: {
    color: 'white',
    fontSize: 16,
    fontWeight: '600',
  },
  errorText: {
    fontSize: 16,
    color: '#dc3545',
    marginBottom: 20,
    textAlign: 'center',
  },
  button: {
    backgroundColor: '#2D9D92',
    padding: 16,
    borderRadius: 12,
    alignItems: 'center',
  },
});