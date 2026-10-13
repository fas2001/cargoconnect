import * as SecureStore from 'expo-secure-store';
import { Platform } from 'react-native';

// Jetons stockés dans le trousseau (iOS) / Keystore (Android). Sur le web (dev), localStorage.
const isWeb = Platform.OS === 'web';

async function getItem(key: string): Promise<string | null> {
  if (isWeb) return globalThis.localStorage?.getItem(key) ?? null;
  return SecureStore.getItemAsync(key);
}

async function setItem(key: string, value: string): Promise<void> {
  if (isWeb) {
    globalThis.localStorage?.setItem(key, value);
    return;
  }
  await SecureStore.setItemAsync(key, value);
}

async function removeItem(key: string): Promise<void> {
  if (isWeb) {
    globalThis.localStorage?.removeItem(key);
    return;
  }
  await SecureStore.deleteItemAsync(key);
}

const KEYS = { access: 'cc.access', refresh: 'cc.refresh', language: 'cc.language' } as const;

export const tokenStorage = {
  getAccess: () => getItem(KEYS.access),
  getRefresh: () => getItem(KEYS.refresh),
  async setTokens(access: string, refresh?: string) {
    await setItem(KEYS.access, access);
    if (refresh) await setItem(KEYS.refresh, refresh);
  },
  async clear() {
    await Promise.all([removeItem(KEYS.access), removeItem(KEYS.refresh)]);
  },
  // Préférence d'affichage : conservée après la déconnexion.
  getLanguage: () => getItem(KEYS.language),
  setLanguage: (language: string) => setItem(KEYS.language, language),
};
