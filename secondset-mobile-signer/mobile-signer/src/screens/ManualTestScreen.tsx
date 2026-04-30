// mobile-signer/src/screens/ManualTestScreen.tsx

import React, { useState } from 'react';
import { View, Text, TextInput, StyleSheet, ScrollView, TouchableOpacity, Alert } from 'react-native';
import { useNavigation } from '@react-navigation/native';

export const ManualTestScreen: React.FC = () => {
  const [sessionId, setSessionId] = useState('');
  const [joinToken, setJoinToken] = useState('');
  const navigation = useNavigation();

  const handleContinue = () => {
    const trimmedSessionId = sessionId.trim();
    const trimmedToken = joinToken.trim();

    if (!trimmedSessionId) {
      Alert.alert('Missing Field', 'Please enter a session ID.');
      return;
    }
    if (!trimmedToken) {
      Alert.alert('Missing Field', 'Please enter a join token.');
      return;
    }

    navigation.navigate('JoinCeremony', {
      session_id: trimmedSessionId,
      join_token: trimmedToken,
    });
  };

  return (
    <ScrollView style={styles.container} keyboardShouldPersistTaps="handled">
      <Text style={styles.description}>
        Enter the session ID and join token provided by your admin.
      </Text>

      <Text style={styles.label}>Session ID</Text>
      <TextInput
        style={styles.input}
        value={sessionId}
        onChangeText={setSessionId}
        placeholder="7bc30a7c-c9fe-4141-87bc..."
        autoCapitalize="none"
        autoCorrect={false}
      />

      <Text style={styles.label}>Join Token</Text>
      <TextInput
        style={styles.input}
        value={joinToken}
        onChangeText={setJoinToken}
        placeholder="70428307559a42528f2527bb665af889"
        autoCapitalize="none"
        autoCorrect={false}
      />

      <TouchableOpacity
        style={[styles.continueButton, (!sessionId.trim() || !joinToken.trim()) && styles.continueButtonDisabled]}
        onPress={handleContinue}
        disabled={!sessionId.trim() || !joinToken.trim()}
      >
        <Text style={styles.continueButtonText}>Continue</Text>
      </TouchableOpacity>
    </ScrollView>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    padding: 20,
    backgroundColor: '#F8FAFB',
  },
  description: {
    fontSize: 15,
    color: '#6B7280',
    lineHeight: 22,
    marginBottom: 24,
  },
  label: {
    fontSize: 14,
    fontWeight: '600',
    color: '#1F2937',
    marginTop: 12,
    marginBottom: 6,
  },
  input: {
    borderWidth: 1,
    borderColor: '#D1D5DB',
    borderRadius: 10,
    padding: 14,
    fontSize: 14,
    fontFamily: 'monospace',
    backgroundColor: 'white',
  },
  continueButton: {
    backgroundColor: '#2D9D92',
    paddingVertical: 16,
    borderRadius: 12,
    alignItems: 'center',
    marginTop: 32,
  },
  continueButtonDisabled: {
    opacity: 0.5,
  },
  continueButtonText: {
    color: 'white',
    fontSize: 16,
    fontWeight: '600',
  },
});
