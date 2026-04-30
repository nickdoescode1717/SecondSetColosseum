// mobile-signer/src/services/PushNotifications.ts
//
// Best-effort Expo push notification registration.
// Callers should fire-and-forget (.catch(() => {})).
// Has no effect on simulators or when permission is denied.

import * as Notifications from 'expo-notifications';
import * as Device from 'expo-device';
import { Platform } from 'react-native';
import { CoordinatorAPI } from './CoordinatorAPI';
import { DeviceInfo } from './DeviceInfo';

// Configure how notifications are shown while the app is in the foreground
Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowAlert: true,
    shouldPlaySound: true,
    shouldSetBadge: true,
  }),
});

const EAS_PROJECT_ID = '1595f7b9-732e-4f84-9372-a878d73548b9';

export const PushNotifications = {
  async registerForPushNotifications(orgId: string): Promise<void> {
    // Physical device required — simulators can't receive push notifications
    if (!Device.isDevice) return;

    const { status: existing } = await Notifications.getPermissionsAsync();
    let finalStatus = existing;

    if (existing !== 'granted') {
      const { status } = await Notifications.requestPermissionsAsync();
      finalStatus = status;
    }

    if (finalStatus !== 'granted') return;

    // Android requires a notification channel
    if (Platform.OS === 'android') {
      await Notifications.setNotificationChannelAsync('signing-requests', {
        name: 'Signing Requests',
        importance: Notifications.AndroidImportance.MAX,
        vibrationPattern: [0, 250, 250, 250],
        lightColor: '#2D9D92',
        sound: 'default',
      });
    }

    const tokenData = await Notifications.getExpoPushTokenAsync({ projectId: EAS_PROJECT_ID });
    const deviceId = await DeviceInfo.getDeviceId();

    await CoordinatorAPI.registerPushToken(deviceId, orgId, tokenData.data, Platform.OS);
  },
};
