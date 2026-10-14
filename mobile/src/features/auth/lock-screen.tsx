import { Ionicons } from '@expo/vector-icons';
import { useEffect, useRef, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { Banner, Button } from '@/components/ui';
import { Colors, Fonts, FontSize, Spacing } from '@/constants/theme';
import { useAuth } from '@/features/auth/auth-context';
import { useBiometrics } from '@/features/auth/biometrics';
import { errorMessage } from '@/services/api';
import { t } from '@/i18n';

/** Affiché au démarrage quand la session est protégée par empreinte / Face ID. */
export function LockScreen() {
  const auth = useAuth();
  const biometrics = useBiometrics();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const asked = useRef(false);

  const unlock = async () => {
    setError(null);
    setBusy(true);
    try {
      await auth.unlock(t('Déverrouiller CargoConnect'));
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setBusy(false);
    }
  };

  // La demande s'ouvre d'elle-même à l'arrivée sur l'écran (une seule fois).
  useEffect(() => {
    if (asked.current) return;
    asked.current = true;
    void unlock();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.hero}>
        <View style={styles.logo}>
          <Ionicons name="lock-closed" size={40} color={Colors.white} />
        </View>
        <Text style={styles.brand}>CargoConnect</Text>
        <Text style={styles.tagline}>{t('Votre session est protégée. Déverrouillez pour continuer.')}</Text>
      </View>
      <View style={styles.actions}>
        {error ? <Banner tone="danger" message={error} icon="alert-circle-outline" /> : null}
        <Button
          title={t('Déverrouiller')}
          icon={biometrics?.icon ?? 'finger-print-outline'}
          onPress={unlock}
          loading={busy}
        />
        <Pressable accessibilityRole="button" onPress={() => void auth.logout()} style={styles.link}>
          <Text style={styles.linkText}>{t('Se connecter avec le mot de passe')}</Text>
        </Pressable>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.background, padding: Spacing.xl, justifyContent: 'space-between' },
  hero: { alignItems: 'center', marginTop: Spacing.xxl, gap: Spacing.md },
  logo: { width: 88, height: 88, borderRadius: 24, backgroundColor: Colors.primary, alignItems: 'center', justifyContent: 'center' },
  brand: { fontSize: 32, fontFamily: Fonts.bold, color: Colors.primary },
  tagline: { fontFamily: Fonts.regular, fontSize: FontSize.body, color: Colors.textSecondary, textAlign: 'center' },
  actions: { gap: Spacing.md },
  link: { alignItems: 'center', paddingVertical: Spacing.sm },
  linkText: { color: Colors.primary, fontFamily: Fonts.semibold, fontSize: FontSize.small },
});
