import { useState } from 'react';
import { StyleSheet, Text } from 'react-native';

import { Colors, Fonts, FontSize } from '@/constants/theme';
import { t } from '@/i18n';
import { reportReasons } from '@/i18n/labels';
import { errorMessage } from '@/services/api';
import { api } from '@/services/endpoints';

import { OptionPicker } from './option-picker';
import { Banner, Button, Card, TextField } from './ui';

/**
 * « Signaler à CargoConnect » : sur une annonce (fraude, annonce inexacte…) ou sur un transport.
 * La personne signalée est déduite par le serveur, jamais choisie ici.
 */
export function ReportLink({ cargo, shipment }: { cargo?: string; shipment?: string }) {
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState<string | null>(null);
  const [description, setDescription] = useState('');
  const [state, setState] = useState<'idle' | 'sending' | 'sent'>('idle');
  const [error, setError] = useState<string | null>(null);

  if (state === 'sent') return <Banner tone="success" message={t("Signalement envoyé. Notre équipe va l'examiner.")} />;
  if (!open) return <Button title={t('Signaler à CargoConnect')} variant="ghost" icon="flag-outline" onPress={() => setOpen(true)} />;

  const submit = async () => {
    setError(null);
    setState('sending');
    try {
      await api.report({ reason: reason!, description, cargo, shipment });
      setState('sent');
    } catch (e) {
      setError(errorMessage(e));
      setState('idle');
    }
  };

  return (
    <Card>
      <Text style={styles.title}>{shipment ? t('Signaler un problème') : t('Signaler cette annonce')}</Text>
      <OptionPicker label={t('Motif')} placeholder={t('Choisir')} options={reportReasons()} value={reason} onChange={setReason} />
      <TextField label={t('Description')} multiline value={description} onChangeText={setDescription} maxLength={2000} />
      {error ? <Banner tone="danger" message={error} /> : null}
      <Button title={t('Envoyer')} variant="danger" disabled={!reason || !description.trim()} loading={state === 'sending'} onPress={submit} />
      <Button title={t('Annuler')} variant="ghost" onPress={() => setOpen(false)} />
    </Card>
  );
}

const styles = StyleSheet.create({
  title: { fontSize: FontSize.body, fontFamily: Fonts.bold, color: Colors.text },
});
