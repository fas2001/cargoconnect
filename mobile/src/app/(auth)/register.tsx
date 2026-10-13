import { useState } from 'react';
import { Text } from 'react-native';

import { Banner, Button, Screen, TextField, textStyles } from '@/components/ui';
import { useAuth } from '@/features/auth/auth-context';
import { ApiError, errorMessage } from '@/services/api';

export default function Register() {
  const { register } = useAuth();
  const [form, setForm] = useState({ full_name: '', phone: '', email: '', password: '' });
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const set = (key: keyof typeof form) => (value: string) => setForm((f) => ({ ...f, [key]: value }));

  const submit = async () => {
    setError(null);
    setFieldErrors({});
    setLoading(true);
    try {
      await register({
        full_name: form.full_name.trim(),
        phone: form.phone.trim(),
        password: form.password,
        ...(form.email.trim() ? { email: form.email.trim() } : {}),
      });
    } catch (e) {
      if (e instanceof ApiError && Object.keys(e.fieldErrors).length) setFieldErrors(e.fieldErrors);
      else setError(errorMessage(e));
    } finally {
      setLoading(false);
    }
  };

  return (
    <Screen edges={['bottom']}>
      {error ? <Banner tone="danger" message={error} icon="alert-circle-outline" /> : null}
      <TextField
        label="Nom complet"
        placeholder="Prénom Nom"
        autoComplete="name"
        value={form.full_name}
        onChangeText={set('full_name')}
        error={fieldErrors.full_name}
      />
      <TextField
        label="Numéro de téléphone"
        placeholder="06 12 34 56 78"
        keyboardType="phone-pad"
        autoComplete="tel"
        value={form.phone}
        onChangeText={set('phone')}
        error={fieldErrors.phone}
        hint="Il servira à vous connecter. Il n'est partagé qu'après confirmation d'un transport."
      />
      <TextField
        label="E-mail (facultatif)"
        keyboardType="email-address"
        autoCapitalize="none"
        autoComplete="email"
        value={form.email}
        onChangeText={set('email')}
        error={fieldErrors.email}
      />
      <TextField
        label="Mot de passe"
        secureTextEntry
        autoComplete="new-password"
        textContentType="newPassword"
        value={form.password}
        onChangeText={set('password')}
        error={fieldErrors.password}
        hint="8 caractères minimum."
      />
      <Button
        title="Créer mon compte"
        onPress={submit}
        loading={loading}
        disabled={!form.full_name || !form.phone || !form.password}
      />
      <Text style={textStyles.caption}>
        En créant un compte, vous acceptez les conditions d&apos;utilisation et la politique de confidentialité de
        CargoConnect.
      </Text>
    </Screen>
  );
}
