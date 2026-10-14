import * as LocalAuthentication from 'expo-local-authentication';
import { useEffect, useState } from 'react';

import { t } from '@/i18n';
import { tokenStorage } from '@/services/token-storage';

export type BiometricInfo = {
  /** Capteur présent et au moins une empreinte / un visage enregistré sur le téléphone. */
  available: boolean;
  /** « Face ID » ou « empreinte digitale », selon le téléphone. */
  label: string;
  icon: 'scan-outline' | 'finger-print-outline';
};

const FINGERPRINT: BiometricInfo = { available: false, label: t('empreinte digitale'), icon: 'finger-print-outline' };

export function useBiometrics(): BiometricInfo | null {
  const [info, setInfo] = useState<BiometricInfo | null>(null);
  useEffect(() => {
    let alive = true;
    (async () => {
      if (!tokenStorage.biometricSupported()) return FINGERPRINT;
      const [hardware, enrolled, types] = await Promise.all([
        LocalAuthentication.hasHardwareAsync(),
        LocalAuthentication.isEnrolledAsync(),
        LocalAuthentication.supportedAuthenticationTypesAsync(),
      ]);
      const face = types.includes(LocalAuthentication.AuthenticationType.FACIAL_RECOGNITION) && !types.includes(LocalAuthentication.AuthenticationType.FINGERPRINT);
      return face
        ? { available: hardware && enrolled, label: 'Face ID', icon: 'scan-outline' as const }
        : { ...FINGERPRINT, available: hardware && enrolled };
    })()
      .catch(() => FINGERPRINT)
      .then((result) => alive && setInfo(result));
    return () => {
      alive = false;
    };
  }, []);
  return info;
}
