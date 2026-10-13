import { router } from 'expo-router';
import { useState } from 'react';
import { Text } from 'react-native';

import { Banner, Button, Screen, TextField, textStyles } from '@/components/ui';
import { errorMessage } from '@/services/api';
import { api } from '@/services/endpoints';
import { t } from '@/i18n';

export default function ForgotPassword() {
  const [step, setStep] = useState<'phone' | 'code' | 'done'>('phone');
  const [phone, setPhone] = useState('');
  const [code, setCode] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const run = async (action: () => Promise<void>) => {
    setError(null);
    setLoading(true);
    try {
      await action();
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setLoading(false);
    }
  };

  const sendCode = () =>
    run(async () => {
      await api.requestOtp(phone.trim(), 'reset_password');
      setStep('code');
    });

  const reset = () =>
    run(async () => {
      await api.resetPassword({ phone: phone.trim(), code: code.trim(), new_password: password });
      setStep('done');
    });

  return (
    <Screen edges={['bottom']}>
      {error ? <Banner tone="danger" message={error} icon="alert-circle-outline" /> : null}

      {step === 'phone' ? (
        <>
          <Text style={textStyles.secondary}>{t('Nous allons vous envoyer un code sur WhatsApp, au numéro de votre compte.')}</Text>
          <TextField
            label={t('Numéro de téléphone')}
            placeholder="06 12 34 56 78"
            keyboardType="phone-pad"
            value={phone}
            onChangeText={setPhone}
          />
          <Button title={t('Recevoir le code sur WhatsApp')} icon="logo-whatsapp" onPress={sendCode} loading={loading} disabled={!phone} />
        </>
      ) : null}

      {step === 'code' ? (
        <>
          <Banner message={t("Si ce numéro est associé à un compte, un code vient d'être envoyé sur WhatsApp au {phone}.", { phone })} />
          <TextField
            label={t('Code reçu sur WhatsApp')}
            keyboardType="number-pad"
            autoComplete="sms-otp"
            textContentType="oneTimeCode"
            maxLength={6}
            value={code}
            onChangeText={setCode}
          />
          <TextField
            label={t('Nouveau mot de passe')}
            secureTextEntry
            autoComplete="new-password"
            value={password}
            onChangeText={setPassword}
          />
          <Button title={t('Changer le mot de passe')} onPress={reset} loading={loading} disabled={code.length < 4 || !password} />
          <Button title={t('Renvoyer le code')} variant="ghost" onPress={sendCode} disabled={loading} />
        </>
      ) : null}

      {step === 'done' ? (
        <>
          <Banner tone="success" icon="checkmark-circle-outline" message={t('Mot de passe modifié. Vous pouvez vous connecter.')} />
          <Button title={t('Se connecter')} onPress={() => router.replace('/login')} />
        </>
      ) : null}
    </Screen>
  );
}
