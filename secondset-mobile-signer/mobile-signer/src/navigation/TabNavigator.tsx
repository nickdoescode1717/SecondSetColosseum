// mobile-signer/src/navigation/TabNavigator.tsx

import React from 'react';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { Ionicons } from '@expo/vector-icons';
import { VaultListScreen } from '../screens/VaultListScreen';
import { EnrollScreen } from '../screens/EnrollScreen';
import { ActivityScreen } from '../screens/ActivityScreen';
import { usePendingStore } from '../store/pendingStore';
import type { MainTabParamList } from './types';

const TEAL = '#2D9D92';
const BG = '#F8FAFB';

const Tab = createBottomTabNavigator<MainTabParamList>();

export const TabNavigator = () => {
  const pendingCount = usePendingStore((s) => s.pendingCount);

  return (
    <Tab.Navigator
      screenOptions={{
        tabBarActiveTintColor: TEAL,
        tabBarInactiveTintColor: '#9CA3AF',
        tabBarStyle: {
          backgroundColor: '#FFFFFF',
          borderTopColor: '#F3F4F6',
        },
        headerStyle: { backgroundColor: BG },
        headerTintColor: TEAL,
        headerShadowVisible: false,
        headerTitleStyle: { color: '#1F2937', fontWeight: '600' },
      }}
    >
      <Tab.Screen
        name="Vaults"
        component={VaultListScreen}
        options={{
          headerShown: false,
          tabBarIcon: ({ color, size }) => (
            <Ionicons name="wallet-outline" size={size} color={color} />
          ),
        }}
      />
      <Tab.Screen
        name="AddVault"
        component={EnrollScreen}
        options={{
          title: 'Add Vault',
          tabBarIcon: ({ color, size }) => (
            <Ionicons name="add-circle-outline" size={size} color={color} />
          ),
        }}
      />
      <Tab.Screen
        name="Activity"
        component={ActivityScreen}
        options={{
          headerShown: false,
          tabBarIcon: ({ color, size }) => (
            <Ionicons name="pulse-outline" size={size} color={color} />
          ),
          tabBarBadge: pendingCount > 0 ? pendingCount : undefined,
          tabBarBadgeStyle: {
            backgroundColor: '#EF4444',
            fontSize: 11,
            fontWeight: '700',
          },
        }}
      />
    </Tab.Navigator>
  );
};
