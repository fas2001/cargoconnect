import { AESEncryptionKey, AESSealedData, aesDecryptAsync, aesEncryptAsync } from 'expo-crypto';
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

const KEYS = {
  access: 'cc.access',
  refresh: 'cc.refresh',
  language: 'cc.language',
  /**
   * « plain » (session mémorisée), « biometric » (protégée par empreinte / Face ID) ou « biometric_signed_out »
   * (déconnecté, mais l'empreinte permet de revenir sans mot de passe). Absent : rien n'est mémorisé.
   */
  mode: 'cc.session_mode',
  /** Jeton de rafraîchissement chiffré (mode biométrique). */
  sealedRefresh: 'cc.refresh_sealed',
  /** Clé de chiffrement, lisible seulement après l'empreinte / Face ID. */
  biometricKey: 'cc.biometric_key',
  /** Numéro du compte protégé par empreinte : l'icône n'apparaît que pour ce numéro. */
  biometricPhone: 'cc.biometric_phone',
  /** Dernier numéro utilisé, pour pré-remplir l'écran de connexion. */
  phone: 'cc.phone',
} as const;

type Mode = 'memory' | 'plain' | 'biometric';

/*
 * Pendant l'utilisation, les jetons vivent en mémoire. Selon le mode, ils sont aussi écrits sur le téléphone :
 * - memory    : « Se souvenir de moi » décoché, rien n'est écrit, fermer l'app déconnecte ;
 * - plain     : jetons dans le coffre du téléphone, l'app s'ouvre directement ;
 * - biometric : le jeton de rafraîchissement est chiffré (AES) avec une clé rangée dans le coffre
 *   biométrique. Sans empreinte / Face ID, il est illisible. La clé est écrite une seule fois : le jeton,
 *   renouvelé toutes les 30 minutes, peut ainsi être réécrit sans redemander l'empreinte.
 */
let mode: Mode = 'memory';
let access: string | null = null;
let refresh: string | null = null;
let key: AESEncryptionKey | null = null;

const toBytes = (text: string) => Uint8Array.from(text, (c) => c.charCodeAt(0)); // un JWT est en ASCII
// Android rend parfois un tampon plus grand que le texte, complété par des octets nuls : on s'arrête au premier.
const fromBytes = (bytes: Uint8Array) => {
  const end = bytes.indexOf(0);
  return Array.from(end === -1 ? bytes : bytes.subarray(0, end), (b) => String.fromCharCode(b)).join('');
};

async function seal(value: string, k: AESEncryptionKey): Promise<string> {
  return (await aesEncryptAsync(toBytes(value), k)).combined('base64');
}

async function writeSession() {
  if (mode === 'plain') {
    if (access) await setItem(KEYS.access, access);
    if (refresh) await setItem(KEYS.refresh, refresh);
  } else if (mode === 'biometric' && key && refresh) {
    await setItem(KEYS.sealedRefresh, await seal(refresh, key));
  }
}

async function eraseStoredSession() {
  await Promise.all([
    removeItem(KEYS.mode),
    removeItem(KEYS.access),
    removeItem(KEYS.refresh),
    removeItem(KEYS.sealedRefresh),
    removeItem(KEYS.biometricPhone),
  ]);
  if (!isWeb) await SecureStore.deleteItemAsync(KEYS.biometricKey).catch(() => undefined);
}

export const tokenStorage = {
  getAccess: async () => access,
  getRefresh: async () => refresh,

  /** Jetons renouvelés pendant l'utilisation. */
  async setTokens(newAccess: string, newRefresh?: string) {
    access = newAccess;
    if (newRefresh) refresh = newRefresh;
    await writeSession();
  },

  /** Après une connexion par mot de passe. Le déverrouillage par empreinte est à réactiver dans le profil. */
  async startSession(newAccess: string, newRefresh: string, remember: boolean) {
    await eraseStoredSession();
    key = null;
    access = newAccess;
    refresh = newRefresh;
    mode = remember ? 'plain' : 'memory';
    if (remember) {
      await setItem(KEYS.mode, 'plain');
      await writeSession();
    }
  },

  /**
   * Au démarrage : « none » (pas de session), « ready » (session chargée) ou « locked » (empreinte attendue).
   * Les installations antérieures (jetons sans mode) sont reprises comme sessions mémorisées.
   */
  async restore(): Promise<'none' | 'ready' | 'locked'> {
    const stored = await getItem(KEYS.mode);
    if (stored === 'biometric') {
      mode = 'biometric';
      return (await getItem(KEYS.sealedRefresh)) ? 'locked' : 'none';
    }
    if (stored === 'biometric_signed_out') return 'none';
    access = await getItem(KEYS.access);
    refresh = await getItem(KEYS.refresh);
    if (!access && !refresh) return 'none';
    mode = 'plain';
    if (!stored) await setItem(KEYS.mode, 'plain');
    return 'ready';
  },

  /**
   * Demande l'empreinte / Face ID puis déchiffre la session. Renvoie false si l'utilisateur annule ;
   * lève une erreur si la clé n'existe plus (empreinte ajoutée ou retirée sur le téléphone).
   */
  async unlock(prompt: string): Promise<boolean> {
    let encoded: string | null;
    try {
      encoded = await SecureStore.getItemAsync(KEYS.biometricKey, { requireAuthentication: true, authenticationPrompt: prompt });
    } catch {
      return false; // annulé ou échec de reconnaissance
    }
    const sealed = await getItem(KEYS.sealedRefresh);
    if (!encoded || !sealed) throw new Error('biometric_key_invalidated');
    key = await AESEncryptionKey.import(encoded, 'base64');
    const decrypted = fromBytes(new Uint8Array(await aesDecryptAsync(AESSealedData.fromCombined(sealed), key)));
    if (decrypted.split('.').length !== 3) throw new Error('biometric_session_unreadable');
    refresh = decrypted;
    access = null; // la première requête obtiendra un jeton d'accès neuf
    mode = 'biometric';
    await setItem(KEYS.mode, 'biometric');
    return true;
  },

  /** Numéro du compte que l'empreinte / Face ID permet d'ouvrir, ou null s'il n'y en a pas. */
  async biometricLoginPhone(): Promise<string | null> {
    if (isWeb) return null;
    const stored = await getItem(KEYS.mode);
    if (stored !== 'biometric' && stored !== 'biometric_signed_out') return null;
    if (!(await getItem(KEYS.sealedRefresh))) return null;
    return getItem(KEYS.biometricPhone);
  },

  /** Déconnexion avec empreinte active : la session chiffrée reste, seule l'empreinte permet d'y revenir. */
  async signOutKeepingBiometric() {
    access = null;
    refresh = null;
    key = null;
    mode = 'memory';
    await setItem(KEYS.mode, 'biometric_signed_out');
  },

  /** Le téléphone peut-il protéger une donnée par empreinte / Face ID ? */
  biometricSupported: () => !isWeb && SecureStore.canUseBiometricAuthentication(),
  isBiometricEnabled: () => mode === 'biometric',
  /** Faux si « Se souvenir de moi » était décoché : la session disparaît à la fermeture. */
  isRemembered: () => mode !== 'memory',

  /** Écrit la clé dans le coffre biométrique (Android demande l'empreinte à ce moment-là). */
  async enableBiometric(prompt: string, phone: string) {
    if (!refresh) throw new Error('no_session');
    const newKey = await AESEncryptionKey.generate();
    await SecureStore.setItemAsync(KEYS.biometricKey, await newKey.encoded('base64'), {
      requireAuthentication: true,
      authenticationPrompt: prompt,
    });
    key = newKey;
    mode = 'biometric';
    await writeSession();
    await setItem(KEYS.mode, 'biometric');
    await setItem(KEYS.biometricPhone, phone);
    await Promise.all([removeItem(KEYS.access), removeItem(KEYS.refresh)]);
  },

  /** Retour à une session mémorisée simple. */
  async disableBiometric() {
    await eraseStoredSession();
    key = null;
    mode = 'plain';
    await setItem(KEYS.mode, 'plain');
    await writeSession();
  },

  async clear() {
    access = null;
    refresh = null;
    key = null;
    mode = 'memory';
    await eraseStoredSession();
  },

  // Préférences conservées après la déconnexion.
  getLanguage: () => getItem(KEYS.language),
  setLanguage: (language: string) => setItem(KEYS.language, language),
  getRememberedPhone: () => getItem(KEYS.phone),
  setRememberedPhone: (phone: string | null) => (phone ? setItem(KEYS.phone, phone) : removeItem(KEYS.phone)),
};
