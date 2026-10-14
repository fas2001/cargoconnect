import { useState } from 'react';
import { Text } from 'react-native';

import { Banner, Button, Card, Screen, TextField, textStyles } from '@/components/ui';
import { useAuth, useCurrentUser } from '@/features/auth/auth-context';
import { t } from '@/i18n';
import { ApiError, errorMessage } from '@/services/api';
import { api } from '@/services/endpoints';

/** Mon compte : nom, e-mail et mot de passe. Le numéro de téléphone sert d'identifiant et ne se modifie pas ici. */
export default function Account() {
  return (
    <Screen edges={['bottom']}>
      <PersonalInfo />
      <PasswordChange />
    </Screen>
  );
}

function PersonalInfo() {
  const auth = useAuth();
  const user = useCurrentUser();
  const [fullName, setFullName] = useState(user.full_name);
  const [email, setEmail] = useState(user.email);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [message, setMessage] = useState<{ tone: 'success' | 'danger'; text: string } | null>(null);
  const [saving, setSaving] = useState(false);

  const changed = fullName.trim() !== user.full_name || email.trim() !== user.email;

  const save = async () => {
    setErrors({});
    setMessage(null);
    setSaving(true);
    try {
      await api.updateMe({ full_name: fullName.trim(), email: email.trim() });
      await auth.refreshUser();
      setMessage({ tone: 'success', text: t('Informations enregistrées.') });
    } catch (e) {
      if (e instanceof ApiError && Object.keys(e.fieldErrors).length) setErrors(e.fieldErrors);
      else setMessage({ tone: 'danger', text: errorMessage(e) });
    } finally {
      setSaving(false);
    }
  };

  return (
    <Card>
      <Text style={textStyles.title}>{t('Mes informations')}</Text>
      <TextField label={t('Nom complet')} placeholder={t('Prénom Nom')} autoComplete="name" value={fullName} onChangeText={setFullName} error={errors.full_name} />
      <TextField
        label={t('E-mail (facultatif)')}
        keyboardType="email-address"
        autoCapitalize="none"
        autoComplete="email"
        value={email}
        onChangeText={setEmail}
        error={errors.email}
      />
      <TextField label={t('Numéro de téléphone')} value={user.phone} editable={false} hint={t('Il sert à vous connecter et ne peut pas être modifié ici.')} />
      {message ? <Banner tone={message.tone} message={message.text} /> : null}
      <Button title={t('Enregistrer')} onPress={save} loading={saving} disabled={!changed || !fullName.trim()} />
    </Card>
  );
}

function PasswordChange() {
  const [current, setCurrent] = useState('');
  const [next, setNext] = useState('');
  const [confirm, setConfirm] = useState('');
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [message, setMessage] = useState<{ tone: 'success' | 'danger'; text: string } | null>(null);
  const [saving, setSaving] = useState(false);

  const save = async () => {
    setErrors({});
    setMessage(null);
    if (next !== confirm) {
      setErrors({ confirm: t('Les deux mots de passe ne correspondent pas.') });
      return;
    }
    setSaving(true);
    try {
      await api.changePassword({ current_password: current, new_password: next });
      setCurrent('');
      setNext('');
      setConfirm('');
      setMessage({ tone: 'success', text: t('Mot de passe modifié.') });
    } catch (e) {
      if (e instanceof ApiError && Object.keys(e.fieldErrors).length) setErrors(e.fieldErrors);
      else setMessage({ tone: 'danger', text: errorMessage(e) });
    } finally {
      setSaving(false);
    }
  };

  return (
    <Card>
      <Text style={textStyles.title}>{t('Changer le mot de passe')}</Text>
      <TextField label={t('Mot de passe actuel')} secureTextEntry autoComplete="current-password" value={current} onChangeText={setCurrent} error={errors.current_password} />
      <TextField
        label={t('Nouveau mot de passe')}
        secureTextEntry
        autoComplete="new-password"
        textContentType="newPassword"
        value={next}
        onChangeText={setNext}
        error={errors.new_password}
        hint={t('8 caractères minimum.')}
      />
      <TextField label={t('Confirmer le nouveau mot de passe')} secureTextEntry autoComplete="new-password" value={confirm} onChangeText={setConfirm} error={errors.confirm} />
      {message ? <Banner tone={message.tone} message={message.text} /> : null}
      <Button title={t('Changer le mot de passe')} variant="secondary" onPress={save} loading={saving} disabled={!current || !next || !confirm} />
    </Card>
  );
}
