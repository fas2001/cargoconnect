import { Link } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useEffect, useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';

import { Banner, Button, Screen, TextField } from '@/components/ui';
import { Colors, Fonts, FontSize, Radius, Spacing } from '@/constants/theme';
import { useAuth } from '@/features/auth/auth-context';
import { useBiometrics } from '@/features/auth/biometrics';
import { errorMessage } from '@/services/api';
import { tokenStorage } from '@/services/token-storage';
import { t } from '@/i18n';

export default function Login() {
  const { login, unlock } = useAuth();
  const biometrics = useBiometrics();
  const [biometricPhone, setBiometricPhone] = useState<string | null>(null);
  const [unlocking, setUnlocking] = useState(false);
  const [phone, setPhone] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [remember, setRemember] = useState(true);

  // Numéro de la dernière connexion « mémorisée » : il ne reste qu'à taper le mot de passe.
  useEffect(() => {
    void tokenStorage.getRememberedPhone().then((saved) => {
      if (saved) setPhone((current) => current || saved);
    });
    void tokenStorage.biometricLoginPhone().then(setBiometricPhone);
  }, []);

  const loginWithBiometrics = async () => {
    setError(null);
    setUnlocking(true);
    try {
      if (!(await unlock(t('Déverrouiller CargoConnect')))) setBiometricPhone(await tokenStorage.biometricLoginPhone());
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setUnlocking(false);
    }
  };

  const submit = async () => {
    setError(null);
    setLoading(true);
    try {
      await login(phone.trim(), password, remember);
      // La redirection est faite par le layout (auth) dès que la session existe.
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setLoading(false);
    }
  };

  return (
    <Screen edges={['bottom']}>
      {error ? <Banner tone="danger" message={error} icon="alert-circle-outline" /> : null}
      <TextField
        label={t('Numéro de téléphone')}
        placeholder="06 12 34 56 78"
        keyboardType="phone-pad"
        autoComplete="tel"
        textContentType="telephoneNumber"
        value={phone}
        onChangeText={setPhone}
      />
      <View style={styles.passwordRow}>
        <View style={{ flex: 1 }}>
          <TextField
            label={t('Mot de passe')}
            secureTextEntry
            autoComplete="password"
            textContentType="password"
            value={password}
            onChangeText={setPassword}
            onSubmitEditing={submit}
          />
        </View>
        {biometrics && biometricPhone && samePhone(phone, biometricPhone) ? (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={t('Se connecter avec {method}', { method: biometrics.label })}
            onPress={loginWithBiometrics}
            disabled={unlocking}
            style={({ pressed }) => [styles.biometricButton, pressed && { opacity: 0.7 }]}>
            {unlocking ? <ActivityIndicator color={Colors.white} /> : <Ionicons name={biometrics.icon} size={30} color={Colors.white} />}
          </Pressable>
        ) : null}
      </View>
      <Pressable
        accessibilityRole="checkbox"
        accessibilityState={{ checked: remember }}
        onPress={() => setRemember((v) => !v)}
        style={styles.remember}>
        <Ionicons name={remember ? 'checkbox' : 'square-outline'} size={24} color={remember ? Colors.cta : Colors.textMuted} />
        <Text style={styles.rememberText}>{t('Se souvenir de moi')}</Text>
      </Pressable>
      {!remember ? <Text style={styles.hint}>{t('Vous serez déconnecté à la fermeture de l’application. Conseillé sur un téléphone partagé.')}</Text> : null}
      <Button title={t('Se connecter')} onPress={submit} loading={loading} disabled={!phone || !password} />
      <Link href="/forgot-password" style={styles.link}>
        {t('Mot de passe oublié ?')}
      </Link>
      <Text style={styles.footer}>
        {t('Pas encore de compte ?')}{' '}
        <Link href="/register" replace style={styles.link}>
          {t("S'inscrire")}
        </Link>
      </Text>
    </Screen>
  );
}

/** Compare deux numéros marocains quelle que soit l'écriture (06…, +2126…, espaces). */
function samePhone(a: string, b: string): boolean {
  const last9 = (p: string) => p.replace(/\D/g, '').slice(-9);
  return last9(a).length === 9 && last9(a) === last9(b);
}

const styles = StyleSheet.create({
  passwordRow: { flexDirection: 'row', alignItems: 'flex-end', gap: Spacing.sm },
  biometricButton: { width: 52, height: 52, borderRadius: Radius.md, backgroundColor: Colors.cta, alignItems: 'center', justifyContent: 'center' },
  remember: { flexDirection: 'row', alignItems: 'center', gap: 10, minHeight: 44 },
  rememberText: { fontFamily: Fonts.regular, fontSize: FontSize.body, color: Colors.text },
  hint: { fontFamily: Fonts.regular, fontSize: FontSize.small, color: Colors.textSecondary, marginTop: -8 },
  link: { color: Colors.primary, fontFamily: Fonts.semibold, fontSize: FontSize.small, textAlign: 'center', paddingVertical: 8 },
  footer: { fontFamily: Fonts.regular, textAlign: 'center', color: Colors.textSecondary, fontSize: FontSize.small },
});
