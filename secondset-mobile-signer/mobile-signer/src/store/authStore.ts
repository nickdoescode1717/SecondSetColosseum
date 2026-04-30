// mobile-signer/src/store/authStore.ts

import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import AsyncStorage from '@react-native-async-storage/async-storage';

export interface UserSession {
  id: string;
  email: string;
  name: string;
  role: string;
  roles: string[];
  org_id: string;
  org_name: string;
}

interface AuthStoreState {
  user: UserSession | null;
  setUser: (user: UserSession) => void;
  clearUser: () => void;
}

export const useAuthStore = create<AuthStoreState>()(
  persist(
    (set) => ({
      user: null,
      setUser: (user) => set({ user }),
      clearUser: () => set({ user: null }),
    }),
    {
      name: 'secondset-auth',
      storage: createJSONStorage(() => AsyncStorage),
    }
  )
);
