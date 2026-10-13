import { useState } from 'react';
import { Modal, StyleSheet, Text, View } from 'react-native';

import { Colors, FontSize, Radius, Spacing } from '@/constants/theme';
import { t } from '@/i18n';

import { Button, modalAnimation, TextField } from './ui';

type Props = {
  visible: boolean;
  title: string;
  label?: string;
  confirmLabel: string;
  required?: boolean;
  onCancel: () => void;
  onConfirm: (reason: string) => Promise<void> | void;
};

/** Petite fenêtre pour saisir un motif (annulation, litige...). Fonctionne sur Android, iOS et web. */
export function ReasonDialog({ visible, title, label = t('Motif'), confirmLabel, required, onCancel, onConfirm }: Props) {
  const [reason, setReason] = useState('');
  const [loading, setLoading] = useState(false);

  const confirm = async () => {
    setLoading(true);
    try {
      await onConfirm(reason.trim());
      setReason('');
    } finally {
      setLoading(false);
    }
  };

  return (
    <Modal visible={visible} transparent animationType={modalAnimation('fade')} onRequestClose={onCancel}>
      <View style={styles.backdrop}>
        <View style={styles.sheet}>
          <Text style={styles.title}>{title}</Text>
          <TextField label={label} multiline value={reason} onChangeText={setReason} maxLength={500} />
          <Button title={confirmLabel} variant="danger" loading={loading} disabled={required && !reason.trim()} onPress={confirm} />
          <Button title={t('Retour')} variant="ghost" onPress={onCancel} disabled={loading} />
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.45)', justifyContent: 'center', padding: Spacing.lg },
  sheet: { backgroundColor: Colors.surface, borderRadius: Radius.lg, padding: Spacing.lg, gap: Spacing.md },
  title: { fontSize: FontSize.title, fontWeight: '700', color: Colors.text },
});
