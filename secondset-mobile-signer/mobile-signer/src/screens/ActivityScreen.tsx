// mobile-signer/src/screens/ActivityScreen.tsx

import React, { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, ScrollView, RefreshControl, Image, ActivityIndicator } from 'react-native';
import { useNavigation, useFocusEffect } from '@react-navigation/native';
import { Ionicons } from '@expo/vector-icons';
import { useAuthStore } from '../store/authStore';
import { useVaultStore } from '../store/vaultStore';
import { usePendingStore } from '../store/pendingStore';
import { CoordinatorAPI } from '../services/CoordinatorAPI';

export const ActivityScreen = () => {
  const navigation = useNavigation();
  const user = useAuthStore((s) => s.user);
  const clearUser = useAuthStore((s) => s.clearUser);
  const { vaults, loadVaults } = useVaultStore();
  const setPendingCount = usePendingStore((s) => s.setPendingCount);

  const [pendingRequests, setPendingRequests] = useState<any[]>([]);
  const [refreshing, setRefreshing] = useState(false);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // Filter vaults by the logged-in user's organization
  const orgVaults = useMemo(
    () => user?.org_id ? vaults.filter(v => v.org_id === user.org_id) : vaults,
    [vaults, user?.org_id]
  );

  const fetchPendingRequests = useCallback(async () => {
    if (orgVaults.length === 0) {
      setPendingRequests([]);
      setPendingCount(0);
      return;
    }

    try {
      const allSessions: any[] = [];
      const seen = new Set<string>();

      for (const vault of orgVaults) {
        if (!vault.wallet_address) continue;
        try {
          const data = await CoordinatorAPI.getPendingSigningSessions(vault.wallet_address);
          for (const session of data.sessions || []) {
            if (!seen.has(session.session_id)) {
              seen.add(session.session_id);
              allSessions.push(session);
            }
          }
        } catch {
          // Individual vault poll failure is non-fatal
        }
      }

      setPendingRequests(allSessions);
      setPendingCount(allSessions.length);
    } catch {
      // Overall failure is also non-fatal
    }
  }, [orgVaults, setPendingCount]);

  // Load vaults on focus
  useFocusEffect(
    useCallback(() => {
      loadVaults();
    }, [loadVaults])
  );

  // Start polling when screen is focused, stop when blurred
  useFocusEffect(
    useCallback(() => {
      fetchPendingRequests();
      pollRef.current = setInterval(fetchPendingRequests, 10000);

      return () => {
        if (pollRef.current) {
          clearInterval(pollRef.current);
          pollRef.current = null;
        }
      };
    }, [fetchPendingRequests])
  );

  const handleRefresh = async () => {
    setRefreshing(true);
    const startTime = Date.now();

    await Promise.all([loadVaults(), fetchPendingRequests()]);

    const elapsed = Date.now() - startTime;
    const remaining = Math.max(0, 2000 - elapsed);
    if (remaining > 0) {
      await new Promise((resolve) => setTimeout(resolve, remaining));
    }

    setRefreshing(false);
  };

  const handleSigningRequest = (request: any) => {
    navigation.navigate('SigningRequest', { request });
  };

  const handleLogout = () => {
    clearUser();
    navigation.replace('Login');
  };

  return (
    <ScrollView
      style={styles.container}
      refreshControl={
        <RefreshControl
          refreshing={refreshing}
          onRefresh={handleRefresh}
          tintColor="#2D9D92"
          colors={['#2D9D92']}
        />
      }
    >
      {/* Refreshing Banner */}
      {refreshing && (
        <View style={styles.refreshBanner}>
          <ActivityIndicator size="small" color="#2D9D92" />
          <Text style={styles.refreshText}>Updating pending requests...</Text>
        </View>
      )}

      {/* Header */}
      <View style={styles.header}>
        <View style={styles.headerLeft}>
          <Image
            source={require('../../assets/images/logo.png')}
            style={styles.logoImage}
            resizeMode="contain"
          />
        </View>
        <TouchableOpacity style={styles.logoutButton} onPress={handleLogout}>
          <Ionicons name="log-out-outline" size={22} color="#6B7280" />
        </TouchableOpacity>
      </View>

      {/* Welcome Section */}
      <View style={styles.welcomeSection}>
        <Text style={styles.greeting}>Welcome back,</Text>
        <Text style={styles.userName}>{user?.name ?? ''}</Text>
      </View>

      {/* Organization Card */}
      {user && (
        <View style={styles.card}>
          <View style={styles.cardHeader}>
            <Text style={styles.cardTitle}>{user.org_name}</Text>
            <View style={styles.roleBadges}>
              {(user.roles && user.roles.length > 0
                ? user.roles
                : [user.role]
              ).map((r) => (
                <View key={r} style={styles.roleBadge}>
                  <Text style={styles.roleBadgeText}>{r.toUpperCase()}</Text>
                </View>
              ))}
            </View>
          </View>
        </View>
      )}

      {/* Pending Requests */}
      <View style={styles.section}>
        <View style={styles.sectionHeader}>
          <Text style={styles.sectionTitle}>Pending Requests</Text>
          {pendingRequests.length > 0 && (
            <View style={styles.countBadge}>
              <Text style={styles.countBadgeText}>{pendingRequests.length}</Text>
            </View>
          )}
        </View>

        {pendingRequests.length > 0 ? (
          pendingRequests.map((request) => (
            <TouchableOpacity
              key={request.session_id}
              style={styles.requestCard}
              onPress={() => handleSigningRequest(request)}
            >
              <View style={styles.requestIcon}>
                <Ionicons name="document-text" size={24} color="#92400E" />
              </View>
              <View style={styles.requestContent}>
                <Text style={styles.requestTitle}>Transaction Signing</Text>
                <Text style={styles.requestAmount}>
                  {request.tx_details?.display_amount || '?'} {request.tx_details?.display_token || ''}
                </Text>
                <Text style={styles.requestMeta}>
                  {request.current_signers}/{request.required_signers} signers joined
                  {request.tx_details?.display_requested_by ? ` · ${request.tx_details.display_requested_by}` : ''}
                </Text>
              </View>
              <Ionicons name="chevron-forward" size={20} color="#9CA3AF" style={styles.requestArrow} />
            </TouchableOpacity>
          ))
        ) : (
          <View style={styles.emptyState}>
            <Ionicons name="checkmark-circle" size={64} color="#10B981" style={styles.emptyIcon} />
            <Text style={styles.emptyTitle}>All Caught Up!</Text>
            <Text style={styles.emptyText}>No pending signing requests</Text>
          </View>
        )}
      </View>

      {/* Recent Activity */}
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Recent Activity</Text>
        <View style={styles.activityCard}>
          <View style={styles.activityItem}>
            <View style={styles.activityIcon}>
              <Ionicons name="phone-portrait-outline" size={20} color="#6B7280" />
            </View>
            <View style={styles.activityContent}>
              <Text style={styles.activityTitle}>Device Enrolled</Text>
              <Text style={styles.activityTime}>2 days ago</Text>
            </View>
          </View>

          <View style={styles.activityItem}>
            <View style={styles.activityIcon}>
              <Ionicons name="create-outline" size={20} color="#6B7280" />
            </View>
            <View style={styles.activityContent}>
              <Text style={styles.activityTitle}>Transaction Signed</Text>
              <Text style={styles.activityTime}>5 days ago</Text>
            </View>
          </View>
        </View>
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
  refreshBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#D1FAE5',
    paddingVertical: 12,
    paddingHorizontal: 16,
    marginHorizontal: 16,
    marginTop: 16,
    marginBottom: 8,
    borderRadius: 8,
    gap: 8,
  },
  refreshText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#065F46',
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingTop: 60,
    paddingBottom: 16,
    paddingHorizontal: 24,
  },
  headerLeft: {
    flex: 1,
  },
  logoImage: {
    width: 120,
    height: 40,
  },
  welcomeSection: {
    paddingHorizontal: 24,
    paddingBottom: 24,
  },
  greeting: {
    fontSize: 16,
    color: '#6B7280',
  },
  userName: {
    fontSize: 28,
    fontWeight: '700',
    color: '#1F2937',
  },
  logoutButton: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: 'white',
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 2,
  },
  card: {
    backgroundColor: 'white',
    borderRadius: 16,
    padding: 20,
    marginHorizontal: 16,
    marginBottom: 24,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.05,
    shadowRadius: 8,
    elevation: 3,
  },
  cardHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  cardTitle: {
    fontSize: 20,
    fontWeight: '600',
    color: '#1F2937',
  },
  roleBadges: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
  },
  roleBadge: {
    backgroundColor: '#DBEAFE',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 12,
  },
  roleBadgeText: {
    fontSize: 12,
    fontWeight: '600',
    color: '#1E40AF',
  },
  section: {
    paddingHorizontal: 16,
    marginBottom: 24,
  },
  sectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 16,
  },
  sectionTitle: {
    fontSize: 20,
    fontWeight: '600',
    color: '#1F2937',
    marginRight: 8,
  },
  countBadge: {
    backgroundColor: '#FEF3C7',
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 12,
  },
  countBadgeText: {
    fontSize: 14,
    fontWeight: '700',
    color: '#92400E',
  },
  requestCard: {
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
  requestIcon: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: '#FEF3C7',
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 12,
  },
  requestContent: {
    flex: 1,
  },
  requestTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: '#1F2937',
    marginBottom: 4,
  },
  requestAmount: {
    fontSize: 18,
    fontWeight: '700',
    color: '#2D9D92',
    marginBottom: 2,
  },
  requestMeta: {
    fontSize: 13,
    color: '#6B7280',
  },
  requestArrow: {
    marginLeft: 8,
  },
  emptyState: {
    alignItems: 'center',
    paddingVertical: 48,
  },
  emptyIcon: {
    marginBottom: 16,
  },
  emptyTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: '#1F2937',
    marginBottom: 8,
  },
  emptyText: {
    fontSize: 14,
    color: '#9CA3AF',
  },
  activityCard: {
    backgroundColor: 'white',
    borderRadius: 12,
    padding: 16,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 4,
    elevation: 2,
  },
  activityItem: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#F3F4F6',
  },
  activityIcon: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: '#F9FAFB',
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 12,
  },
  activityContent: {
    flex: 1,
  },
  activityTitle: {
    fontSize: 14,
    fontWeight: '500',
    color: '#1F2937',
    marginBottom: 2,
  },
  activityTime: {
    fontSize: 12,
    color: '#9CA3AF',
  },
  spacer: {
    height: 32,
  },
});
