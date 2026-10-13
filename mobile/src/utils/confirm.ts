import { Alert, Platform } from 'react-native';

import { t } from '@/i18n';

/** Confirmation native (Alert) ; window.confirm sur le web où Alert n'a pas de boutons. */
export function confirmAction(title: string, message: string, confirmLabel: string): Promise<boolean> {
  if (Platform.OS === 'web') return Promise.resolve(globalThis.confirm?.(`${title}\n\n${message}`) ?? false);
  return new Promise((resolve) =>
    Alert.alert(title, message, [
      { text: t('Annuler'), style: 'cancel', onPress: () => resolve(false) },
      { text: confirmLabel, onPress: () => resolve(true) },
    ]),
  );
}
