import axios from 'axios';
import { DeviceInfo } from './DeviceInfo';

const COORDINATOR_URL = process.env.EXPO_PUBLIC_COORDINATOR_URL || 'http://localhost:3000';
const WEBAPP_URL = process.env.EXPO_PUBLIC_WEBAPP_URL || 'http://localhost:3001';

export class CoordinatorAPI {
  /**
   * Authenticate user against the web app database.
   * Returns user identity data (id, email, name, orgId, orgName, roles).
   */
  static async mobileLogin(email: string, password: string) {
    const response = await axios.post(`${WEBAPP_URL}/api/auth/mobile-login`, {
      email,
      password,
    });
    return response.data; // { user: { id, email, name, org_id, org_name, roles } }
  }

  static async joinKeygenSession(
    sessionId: string,
    joinToken: string,
    deviceId: string,
    role: string
  ) {
    // Get real device public key and info
    const devicePublicKey = await DeviceInfo.getDevicePublicKey();
    const deviceInfo = await DeviceInfo.getDeviceInfo();

    const response = await axios.post(
      `${COORDINATOR_URL}/api/v1/keygen/sessions/${sessionId}/join`,
      {
        join_token: joinToken,
        device_id: deviceId,
        role,
        device_public_key: devicePublicKey,
        device_info: {
          os: deviceInfo.os,
          os_version: deviceInfo.osVersion,
          app_version: deviceInfo.appVersion,
          device_model: deviceInfo.deviceModel,
          device_name: deviceInfo.deviceName,
        },
      }
    );
    return response.data;
  }

  static async getKeygenStatus(sessionId: string) {
    const response = await axios.get(
      `${COORDINATOR_URL}/api/v1/keygen/sessions/${sessionId}/status`
    );
    return response.data;
  }

  // Signing session methods

  static async getPendingSigningSessions(walletAddress: string) {
    const response = await axios.get(
      `${COORDINATOR_URL}/api/v1/sign/sessions/pending`,
      { params: { wallet_address: walletAddress } }
    );
    return response.data; // { sessions: [...] }
  }

  static async joinSigningSession(
    sessionId: string,
    deviceId: string,
    role: string,
    biometricVerified: boolean = true
  ) {
    const response = await axios.post(
      `${COORDINATOR_URL}/api/v1/sign/sessions/${sessionId}/join`,
      {
        device_id: deviceId,
        role,
        biometric_verified: biometricVerified,
      }
    );
    return response.data;
  }

  static async getSigningStatus(sessionId: string) {
    const response = await axios.get(
      `${COORDINATOR_URL}/api/v1/sign/sessions/${sessionId}/status`
    );
    return response.data;
  }

  // Recovery session methods

  static async joinRecoverySession(
    sessionId: string,
    joinToken: string,
    deviceId: string,
    participantType: 'old_signer' | 'new_signer',
    role: string,
    devicePublicKey: string,
    biometricVerified: boolean = false
  ) {
    const deviceInfo = await DeviceInfo.getDeviceInfo();

    const response = await axios.post(
      `${COORDINATOR_URL}/api/v1/recovery/sessions/${sessionId}/join`,
      {
        join_token: joinToken,
        device_id: deviceId,
        participant_type: participantType,
        role,
        device_public_key: devicePublicKey,
        biometric_verified: biometricVerified,
        device_info: {
          os: deviceInfo.os,
          os_version: deviceInfo.osVersion,
          app_version: deviceInfo.appVersion,
          device_model: deviceInfo.deviceModel,
          device_name: deviceInfo.deviceName,
        },
      }
    );
    return response.data;
  }

  static async getRecoveryStatus(sessionId: string) {
    const response = await axios.get(
      `${COORDINATOR_URL}/api/v1/recovery/sessions/${sessionId}`
    );
    return response.data;
  }
}