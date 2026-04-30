// mobile-signer/src/services/DeviceInfo.ts

import * as SecureStore from 'expo-secure-store';
import { Platform } from 'react-native';
import * as Device from 'expo-device';
import * as Application from 'expo-application';
import * as secp256k1 from '@noble/secp256k1';
import { v4 as uuidv4 } from 'uuid';

const DEVICE_KEY_PAIR_KEY = 'secondset_device_keypair';
const DEVICE_UUID_KEY = 'secondset_device_uuid';

// Helper function to convert bytes to hex string
function bytesToHex(bytes: Uint8Array): string {
  return Array.from(bytes)
    .map(b => b.toString(16).padStart(2, '0'))
    .join('');
}

export interface DeviceKeyPair {
  privateKey: string; // Hex-encoded
  publicKey: string;  // Hex-encoded compressed public key
  createdAt: string;
}

export interface DeviceInfoData {
  os: 'iOS' | 'Android' | 'Web';
  osVersion: string;
  appVersion: string;
  deviceModel?: string;
  deviceName?: string;
}

export class DeviceInfo {
  /**
   * Get or generate device key pair
   * Device private key is stored in secure storage and never leaves the device
   */
  static async getOrCreateDeviceKeyPair(): Promise<DeviceKeyPair> {
    // Check if key pair already exists
    const existing = await this.getStoredKeyPair();
    if (existing) {
      return existing;
    }

    // Generate new key pair
    console.log('🔑 Generating new device key pair...');
    const privateKeyBytes = secp256k1.utils.randomSecretKey();
    const publicKeyBytes = secp256k1.getPublicKey(privateKeyBytes, true); // compressed

    const keyPair: DeviceKeyPair = {
      privateKey: bytesToHex(privateKeyBytes),
      publicKey: bytesToHex(publicKeyBytes),
      createdAt: new Date().toISOString(),
    };

    // Store in secure storage
    await this.storeKeyPair(keyPair);
    console.log('✅ Device key pair generated and stored');
    console.log('📌 Device public key:', keyPair.publicKey.slice(0, 20) + '...');

    return keyPair;
  }

  /**
   * Get device public key (hex-encoded compressed secp256k1 public key)
   */
  static async getDevicePublicKey(): Promise<string> {
    const keyPair = await this.getOrCreateDeviceKeyPair();
    return keyPair.publicKey;
  }

  /**
   * Get or generate a persistent device UUID for coordinator identification
   */
  static async getDeviceId(): Promise<string> {
    try {
      let deviceId: string | null;

      if (Platform.OS === 'web') {
        deviceId = localStorage.getItem(DEVICE_UUID_KEY);
      } else {
        deviceId = await SecureStore.getItemAsync(DEVICE_UUID_KEY);
      }

      if (deviceId) return deviceId;
    } catch (error) {
      console.warn('Failed to retrieve device UUID:', error);
    }

    const deviceId = uuidv4();
    if (Platform.OS === 'web') {
      localStorage.setItem(DEVICE_UUID_KEY, deviceId);
    } else {
      await SecureStore.setItemAsync(DEVICE_UUID_KEY, deviceId);
    }
    console.log('Generated new device UUID:', deviceId);
    return deviceId;
  }

  /**
   * Get device information
   */
  static async getDeviceInfo(): Promise<DeviceInfoData> {
    const os = Platform.OS === 'ios' ? 'iOS' :
                Platform.OS === 'android' ? 'Android' : 'Web';

    let osVersion = 'unknown';
    let appVersion = '1.0.0';
    let deviceModel: string | undefined;
    let deviceName: string | undefined;

    try {
      // Get OS version
      if (Platform.OS !== 'web') {
        osVersion = Device.osVersion || 'unknown';
        deviceModel = Device.modelName || undefined;
        deviceName = Device.deviceName || undefined;
      } else {
        osVersion = navigator.userAgent;
      }

      // Get app version
      if (Platform.OS !== 'web') {
        appVersion = Application.nativeApplicationVersion || '1.0.0';
      }
    } catch (error) {
      console.warn('⚠️  Could not get full device info:', error);
    }

    return {
      os,
      osVersion,
      appVersion,
      deviceModel,
      deviceName,
    };
  }

  /**
   * Private: Store key pair in secure storage
   */
  private static async storeKeyPair(keyPair: DeviceKeyPair): Promise<void> {
    const data = JSON.stringify(keyPair);

    if (Platform.OS === 'web') {
      // For web (testing), use localStorage
      localStorage.setItem(DEVICE_KEY_PAIR_KEY, data);
    } else {
      // For iOS/Android, use SecureStore (hardware-backed if available)
      await SecureStore.setItemAsync(DEVICE_KEY_PAIR_KEY, data, {
        keychainAccessible: SecureStore.WHEN_UNLOCKED,
      });
    }
  }

  /**
   * Private: Get stored key pair from secure storage
   */
  private static async getStoredKeyPair(): Promise<DeviceKeyPair | null> {
    try {
      let data: string | null;

      if (Platform.OS === 'web') {
        data = localStorage.getItem(DEVICE_KEY_PAIR_KEY);
      } else {
        data = await SecureStore.getItemAsync(DEVICE_KEY_PAIR_KEY);
      }

      return data ? JSON.parse(data) : null;
    } catch (error) {
      console.error('Failed to retrieve device key pair:', error);
      return null;
    }
  }

  /**
   * Delete device key pair (use with caution - will lose device identity)
   */
  static async deleteDeviceKeyPair(): Promise<void> {
    console.warn('⚠️  Deleting device key pair - device will get new identity');

    if (Platform.OS === 'web') {
      localStorage.removeItem(DEVICE_KEY_PAIR_KEY);
    } else {
      await SecureStore.deleteItemAsync(DEVICE_KEY_PAIR_KEY);
    }
  }
}
