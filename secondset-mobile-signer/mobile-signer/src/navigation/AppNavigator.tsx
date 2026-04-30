// mobile-signer/src/navigation/AppNavigator.tsx

import React, { useEffect } from 'react';
import { NavigationContainer, createNavigationContainerRef } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import * as Notifications from 'expo-notifications';
import { LoginScreen } from '../screens/LoginScreen';
import { TabNavigator } from './TabNavigator';
import { VaultDetailScreen } from '../screens/VaultDetailScreen';
import { ManualTestScreen } from '../screens/ManualTestScreen';
import { JoinCeremonyScreen } from '../screens/JoinCeremonyScreen';
import { CeremonyLobbyScreen } from '../screens/CeremonyLobbyScreen';
import { CeremonyProgressScreen } from '../screens/CeremonyProgressScreen';
import { CeremonyDoneScreen } from '../screens/CeremonyDoneScreen';
import { SigningRequestScreen } from '../screens/SigningRequestScreen';
import { SigningProgressScreen } from '../screens/SigningProgressScreen';
import { SigningCompleteScreen } from '../screens/SigningCompleteScreen';
import { RecoveryJoinScreen } from '../screens/RecoveryJoinScreen';
import { RecoveryProgressScreen } from '../screens/RecoveryProgressScreen';
import { RecoveryDoneScreen } from '../screens/RecoveryDoneScreen';
import type { RootStackParamList } from './types';

const TEAL = '#2D9D92';
const BG = '#F8FAFB';

const Stack = createNativeStackNavigator<RootStackParamList>();

export const navigationRef = createNavigationContainerRef<RootStackParamList>();

export const AppNavigator = () => {
  useEffect(() => {
    // Navigate to Activity tab when user taps a signing request notification
    const subscription = Notifications.addNotificationResponseReceivedListener((response) => {
      const data = response.notification.request.content.data as any;
      if (data?.type === 'signing_request' && navigationRef.isReady()) {
        navigationRef.navigate('MainTabs', { screen: 'Activity' });
      }
    });
    return () => subscription.remove();
  }, []);

  return (
    <NavigationContainer ref={navigationRef}>
      <Stack.Navigator
        initialRouteName="Login"
        screenOptions={{
          headerStyle: { backgroundColor: BG },
          headerTintColor: TEAL,
          headerShadowVisible: false,
          headerBackTitleVisible: false,
          headerTitleStyle: { color: '#1F2937', fontWeight: '600' },
        }}
      >
        {/* Auth */}
        <Stack.Screen
          name="Login"
          component={LoginScreen}
          options={{ headerShown: false }}
        />

        {/* Main Tabs */}
        <Stack.Screen
          name="MainTabs"
          component={TabNavigator}
          options={{ headerShown: false }}
        />

        {/* Vault drill-down */}
        <Stack.Screen
          name="VaultDetail"
          component={VaultDetailScreen}
          options={{ title: 'Vault Details' }}
        />

        {/* Keygen Flow */}
        <Stack.Screen
          name="ManualEntry"
          component={ManualTestScreen}
          options={{ title: 'Manual Entry' }}
        />
        <Stack.Screen
          name="JoinCeremony"
          component={JoinCeremonyScreen}
          options={{ title: 'Join Ceremony' }}
        />
        <Stack.Screen
          name="CeremonyLobby"
          component={CeremonyLobbyScreen}
          options={{
            title: 'Waiting for Participants',
            headerBackVisible: false,
            gestureEnabled: false,
          }}
        />
        <Stack.Screen
          name="CeremonyProgress"
          component={CeremonyProgressScreen}
          options={{ headerShown: false, gestureEnabled: false }}
        />
        <Stack.Screen
          name="CeremonyDone"
          component={CeremonyDoneScreen}
          options={{ headerShown: false, gestureEnabled: false }}
        />

        {/* Signing Flow */}
        <Stack.Screen
          name="SigningRequest"
          component={SigningRequestScreen}
          options={{ title: 'Signing Request' }}
        />
        <Stack.Screen
          name="SigningProgress"
          component={SigningProgressScreen}
          options={{ headerShown: false, gestureEnabled: false }}
        />
        <Stack.Screen
          name="SigningComplete"
          component={SigningCompleteScreen}
          options={{ headerShown: false, gestureEnabled: false }}
        />

        {/* Recovery Flow */}
        <Stack.Screen
          name="RecoveryJoin"
          component={RecoveryJoinScreen}
          options={{ title: 'Join Recovery' }}
        />
        <Stack.Screen
          name="RecoveryProgress"
          component={RecoveryProgressScreen}
          options={{ headerShown: false, gestureEnabled: false }}
        />
        <Stack.Screen
          name="RecoveryDone"
          component={RecoveryDoneScreen}
          options={{ headerShown: false, gestureEnabled: false }}
        />
      </Stack.Navigator>
    </NavigationContainer>
  );
};
