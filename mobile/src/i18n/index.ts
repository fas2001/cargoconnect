import * as Localization from 'expo-localization';
import * as Updates from 'expo-updates';
import { useSyncExternalStore } from 'react';
import { I18nManager } from 'react-native';

import { tokenStorage } from '@/services/token-storage';

import { ar, type TKey } from './ar';

/**
 * Langue de l'interface. Les textes sont écrits en français dans le code (`t('Mes annonces')`) ;
 * `ar.ts` donne leur traduction. Une clé absente de `ar.ts` est une erreur TypeScript.
 */
export type Language = 'fr' | 'ar';
export type { TKey };

let current: Language = 'fr';
const listeners = new Set<() => void>();

export const getLanguage = () => current;
export const isArabic = () => current === 'ar';
/** Locale pour les dates et les nombres (chiffres latins dans les deux cas). */
export const locale = () => (current === 'ar' ? 'ar-MA' : 'fr-MA');

export function t(key: TKey, params?: Record<string, string | number>): string {
  let text: string = current === 'ar' ? ar[key] : key;
  if (params) {
    for (const [name, value] of Object.entries(params)) text = text.replaceAll(`{${name}}`, String(value));
  }
  return text;
}

/** Texte venant du serveur (libellé de camion, message d'erreur…) : traduit s'il est connu. */
export function tr(text: string): string {
  return current === 'ar' ? ((ar as Record<string, string>)[text] ?? text) : text;
}

/** Nom d'une ville ou d'une catégorie : le serveur fournit les deux langues. */
export function localName(item: { name_fr: string; name_ar?: string }): string {
  return current === 'ar' && item.name_ar ? item.name_ar : item.name_fr;
}

function applyDirection() {
  I18nManager.allowRTL(true);
  I18nManager.forceRTL(current === 'ar');
}

/** À appeler avant le premier affichage : langue mémorisée, sinon celle du téléphone. */
export async function initLanguage(): Promise<void> {
  const stored = await tokenStorage.getLanguage().catch(() => null);
  if (stored === 'fr' || stored === 'ar') current = stored;
  else current = Localization.getLocales()[0]?.languageCode === 'ar' ? 'ar' : 'fr';
  // Le sens de lecture (droite à gauche) ne change qu'au prochain démarrage de l'app.
  applyDirection();
}

/** Change la langue puis redémarre l'app pour appliquer le sens de lecture. */
export async function setLanguage(language: Language): Promise<void> {
  if (language === current) return;
  await tokenStorage.setLanguage(language);
  current = language;
  applyDirection();
  try {
    await Updates.reloadAsync();
  } catch {
    // Redémarrage impossible (ex. web) : les textes changent tout de suite, la mise en page au prochain lancement.
    listeners.forEach((listener) => listener());
  }
}

/** Langue courante, pour redessiner l'app quand elle change. */
export function useLanguage(): Language {
  return useSyncExternalStore(
    (listener) => {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    getLanguage,
  );
}
