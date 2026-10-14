import { Link } from 'expo-router';
import { useState } from 'react';
import { StyleSheet, Text } from 'react-native';

import { Banner, Button, Screen, TextField } from '@/components/ui';
import { Colors, Fonts, FontSize } from '@/constants/theme';
import { useAuth } from '@/features/auth/auth-context';
import { errorMessage } from '@/services/api';
import { t } from '@/i18n';

export default function Login() {
  const { login } = useAuth();
  const [phone, setPhone] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const submit = async () => {
    setError(null);
    setLoading(true);
    try {
      await login(phone.trim(), password);
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
      <TextField
        label={t('Mot de passe')}
        secureTextEntry
        autoComplete="password"
        textContentType="password"
        value={password}
        onChangeText={setPassword}
        onSubmitEditing={submit}
      />
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

const styles = StyleSheet.create({
  link: { color: Colors.primary, fontFamily: Fonts.semibold, fontSize: FontSize.small, textAlign: 'center', paddingVertical: 8 },
  footer: { fontFamily: Fonts.regular, textAlign: 'center', color: Colors.textSecondary, fontSize: FontSize.small },
});
