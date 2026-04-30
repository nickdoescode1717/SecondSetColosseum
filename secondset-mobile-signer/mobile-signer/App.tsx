// Polyfill crypto.getRandomValues for @noble libraries (must be before any other imports)
import { getRandomValues as expoGetRandomValues } from 'expo-crypto';
if (typeof globalThis.crypto === 'undefined') {
  (globalThis as any).crypto = {} as Crypto;
}
if (typeof globalThis.crypto.getRandomValues !== 'function') {
  globalThis.crypto.getRandomValues = expoGetRandomValues as typeof globalThis.crypto.getRandomValues;
}

import React from 'react';
import { AppNavigator } from './src/navigation/AppNavigator';

export default function App() {
  return <AppNavigator />;
}