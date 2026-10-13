import { Ionicons } from '@expo/vector-icons';
import { useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';

import { Banner, Button, Card, type IconName, Screen, TextField, textStyles } from '@/components/ui';
import { Colors, FontSize, Spacing } from '@/constants/theme';
import { useAuth } from '@/features/auth/auth-context';
import { ApiError, errorMessage } from '@/services/api';
import type { Role } from '@/types/api';
import { t } from '@/i18n';

export default function Register() {
  const { register } = useAuth();
  const [role, setRole] = useState<Role | null>(null);
  const [form, setForm] = useState({ full_name: '', phone: '', email: '', password: '', company_name: '' });
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const set = (key: keyof typeof form) => (value: string) => setForm((f) => ({ ...f, [key]: value }));

  const submit = async () => {
    if (!role) return;
    setError(null);
    setFieldErrors({});
    setLoading(true);
    try {
      await register({
        role,
        full_name: form.full_name.trim(),
        phone: form.phone.trim(),
        password: form.password,
        ...(form.email.trim() ? { email: form.email.trim() } : {}),
        ...(role === 'driver' && form.company_name.trim() ? { company_name: form.company_name.trim() } : {}),
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

      <Text style={styles.question}>{t('Vous êtes :')}</Text>
      <View style={styles.roles}>
        <RoleOption
          icon="cube-outline"
          title={t('Expéditeur')}
          subtitle={t("J'ai des marchandises à transporter")}
          selected={role === 'client'}
          onPress={() => setRole('client')}
        />
        <RoleOption
          icon="bus-outline"
          title={t('Transporteur')}
          subtitle={t('Je suis chauffeur / transporteur')}
          selected={role === 'driver'}
          onPress={() => setRole('driver')}
        />
      </View>

      <TextField
        label={t('Nom complet')}
        placeholder={t('Prénom Nom')}
        autoComplete="name"
        value={form.full_name}
        onChangeText={set('full_name')}
        error={fieldErrors.full_name}
      />
      {role === 'driver' ? (
        <TextField
          label={t("Nom de l'entreprise (facultatif)")}
          placeholder={t('Ex. Transports Atlas')}
          value={form.company_name}
          onChangeText={set('company_name')}
          error={fieldErrors.company_name}
        />
      ) : null}
      <TextField
        label={t('Numéro de téléphone')}
        placeholder="06 12 34 56 78"
        keyboardType="phone-pad"
        autoComplete="tel"
        value={form.phone}
        onChangeText={set('phone')}
        error={fieldErrors.phone}
        hint={t("Il servira à vous connecter. Il n'est partagé qu'après confirmation d'un transport.")}
      />
      <TextField
        label={t('E-mail (facultatif)')}
        keyboardType="email-address"
        autoCapitalize="none"
        autoComplete="email"
        value={form.email}
        onChangeText={set('email')}
        error={fieldErrors.email}
      />
      <TextField
        label={t('Mot de passe')}
        secureTextEntry
        autoComplete="new-password"
        textContentType="newPassword"
        value={form.password}
        onChangeText={set('password')}
        error={fieldErrors.password}
        hint={t('8 caractères minimum.')}
      />
      {role === 'driver' ? (
        <Banner message={t("Après l'inscription, ajoutez votre véhicule et vos justificatifs : notre équipe vérifiera votre profil avant vos premières propositions.")} />
      ) : null}
      <Button
        title={t('Créer mon compte')}
        onPress={submit}
        loading={loading}
        disabled={!role || !form.full_name || !form.phone || !form.password}
      />
      <Text style={textStyles.caption}>
        {t("En créant un compte, vous acceptez les conditions d'utilisation et la politique de confidentialité de CargoConnect.")}
      </Text>
    </Screen>
  );
}

function RoleOption({
  icon,
  title,
  subtitle,
  selected,
  onPress,
}: {
  icon: IconName;
  title: string;
  subtitle: string;
  selected: boolean;
  onPress: () => void;
}) {
  return (
    <Card onPress={onPress} style={[styles.option, selected && styles.optionSelected]}>
      <View accessible accessibilityRole="radio" accessibilityState={{ selected }} style={styles.optionInner}>
        <Ionicons name={icon} size={30} color={selected ? Colors.primary : Colors.textMuted} />
        <Text style={[styles.optionTitle, selected && { color: Colors.primary }]}>{title}</Text>
        <Text style={[textStyles.caption, { textAlign: 'center' }]}>{subtitle}</Text>
      </View>
    </Card>
  );
}

const styles = StyleSheet.create({
  question: { fontSize: FontSize.body, fontWeight: '700', color: Colors.text },
  roles: { flexDirection: 'row', gap: Spacing.md },
  option: { flex: 1, borderWidth: 2, borderColor: Colors.border },
  optionSelected: { borderColor: Colors.primary, backgroundColor: Colors.primarySoft },
  optionInner: { alignItems: 'center', gap: Spacing.xs },
  optionTitle: { fontSize: FontSize.body, fontWeight: '700', color: Colors.text },
});
