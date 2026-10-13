import { Link } from 'expo-router';
import { useState } from 'react';
import { StyleSheet, Text } from 'react-native';

import { Banner, Button, Screen, TextField } from '@/components/ui';
import { Colors, FontSize } from '@/constants/theme';
import { useAuth } from '@/features/auth/auth-context';
import { errorMessage } from '@/services/api';

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
        label="Numéro de téléphone"
        placeholder="06 12 34 56 78"
        keyboardType="phone-pad"
        autoComplete="tel"
        textContentType="telephoneNumber"
        value={phone}
        onChangeText={setPhone}
      />
      <TextField
        label="Mot de passe"
        secureTextEntry
        autoComplete="password"
        textContentType="password"
        value={password}
        onChangeText={setPassword}
        onSubmitEditing={submit}
      />
      <Button title="Se connecter" onPress={submit} loading={loading} disabled={!phone || !password} />
      <Link href="/forgot-password" style={styles.link}>
        Mot de passe oublié ?
      </Link>
      <Text style={styles.footer}>
        Pas encore de compte ?{' '}
        <Link href="/register" replace style={styles.link}>
          S&apos;inscrire
        </Link>
      </Text>
    </Screen>
  );
}

const styles = StyleSheet.create({
  link: { color: Colors.primary, fontWeight: '600', fontSize: FontSize.small, textAlign: 'center', paddingVertical: 8 },
  footer: { textAlign: 'center', color: Colors.textSecondary, fontSize: FontSize.small },
});
