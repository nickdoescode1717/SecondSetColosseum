// mobile-signer/src/screens/CeremonyLobbyScreen.tsx

import React, { useState, useEffect } from 'react';
import { View, Text, StyleSheet, ActivityIndicator, TouchableOpacity, Alert } from 'react-native';
import { useRoute, useNavigation } from '@react-navigation/native';
import { Ionicons } from '@expo/vector-icons';

export const CeremonyLobbyScreen = () => {
  const route = useRoute();
  const navigation = useNavigation();
  const { participantId, sessionId } = route.params as any;

  const [participantCount, setParticipantCount] = useState(1);

  useEffect(() => {
    // In real implementation, listen for other participants joining
    // For now, auto-advance to ceremony after 2 seconds
    const timer = setTimeout(() => {
      navigation.replace('CeremonyProgress', { participantId, sessionId });
    }, 2000);

    return () => clearTimeout(timer);
  }, []);

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <ActivityIndicator size="large" color="#2D9D92" />
        <Text style={styles.title}>Waiting for Others</Text>
        <Text style={styles.subtitle}>
          {participantCount} of 3 participants joined
        </Text>
      </View>

      <View style={styles.participantList}>
        <View style={styles.participantItem}>
          <Ionicons name="checkmark-circle" size={20} color="#10B981" style={styles.participantIcon} />
          <Text style={styles.participantText}>You (CFO)</Text>
        </View>
        <View style={[styles.participantItem, styles.participantWaiting]}>
          <Ionicons name="ellipse-outline" size={20} color="#9CA3AF" style={styles.participantIcon} />
          <Text style={styles.participantText}>Controller</Text>
        </View>
        <View style={[styles.participantItem, styles.participantWaiting]}>
          <Ionicons name="ellipse-outline" size={20} color="#9CA3AF" style={styles.participantIcon} />
          <Text style={styles.participantText}>Backup</Text>
        </View>
      </View>

      <Text style={styles.info}>
        Keep this screen open while waiting for other signers
      </Text>

      <TouchableOpacity
        style={styles.cancelLink}
        onPress={() => {
          Alert.alert(
            'Leave Ceremony?',
            'You will need to scan the QR code again to rejoin.',
            [
              { text: 'Stay', style: 'cancel' },
              {
                text: 'Leave',
                style: 'destructive',
                onPress: () => navigation.navigate('MainTabs' as never),
              },
            ]
          );
        }}
      >
        <Text style={styles.cancelLinkText}>Cancel and Leave</Text>
      </TouchableOpacity>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#F8FAFB',
    padding: 24,
    justifyContent: 'center',
  },
  header: {
    alignItems: 'center',
    marginBottom: 48,
  },
  title: {
    fontSize: 28,
    fontWeight: '700',
    color: '#1F2937',
    marginTop: 16,
    marginBottom: 8,
  },
  subtitle: {
    fontSize: 16,
    color: '#6B7280',
  },
  participantList: {
    backgroundColor: 'white',
    borderRadius: 16,
    padding: 20,
    marginBottom: 24,
  },
  participantItem: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 16,
    borderBottomWidth: 1,
    borderBottomColor: '#F3F4F6',
  },
  participantWaiting: {
    opacity: 0.5,
  },
  participantIcon: {
    marginRight: 12,
  },
  participantText: {
    fontSize: 16,
    color: '#1F2937',
  },
  info: {
    fontSize: 14,
    color: '#9CA3AF',
    textAlign: 'center',
  },
  cancelLink: {
    marginTop: 32,
    alignItems: 'center',
  },
  cancelLinkText: {
    fontSize: 15,
    color: '#EF4444',
    fontWeight: '500',
  },
});
