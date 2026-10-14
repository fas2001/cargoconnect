import { useQuery, useQueryClient } from '@tanstack/react-query';
import * as ImagePicker from 'expo-image-picker';
import { useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';

import { Badge, type BadgeTone, Banner, Button, Card, Chip, ErrorState, Loading, Screen, SectionTitle, TextField, textStyles } from '@/components/ui';
import { Colors, Fonts, FontSize, Spacing } from '@/constants/theme';
import { useAuth } from '@/features/auth/auth-context';
import { t, type TKey } from '@/i18n';
import { ApiError, errorMessage } from '@/services/api';
import { api } from '@/services/endpoints';
import { assetToFormData } from '@/services/upload';
import type { AccountType, ClientIdentity, IdentityChecklistItem } from '@/types/api';

const STATE: Record<IdentityChecklistItem['state'], { label: TKey; tone: BadgeTone }> = {
  missing: { label: 'Manquant', tone: 'neutral' },
  pending: { label: 'À vérifier', tone: 'warning' },
  verified: { label: 'Validé', tone: 'success' },
  rejected: { label: 'Refusé', tone: 'danger' },
};

/** Identité de l'expéditeur (CIN ou ICE), exigée avant de publier une première annonce. */
export default function Identity() {
  const query = useQuery({
    queryKey: ['client-identity'],
    // 404 = pas encore renseignée : on affiche le formulaire vide.
    queryFn: () => api.clientIdentity().catch((e) => (e instanceof ApiError && e.status === 404 ? null : Promise.reject(e))),
  });

  if (query.isLoading) return <Loading />;
  if (query.error) return <ErrorState message={errorMessage(query.error)} onRetry={() => query.refetch()} />;
  return <IdentityForm key={query.data?.account_type ?? 'new'} identity={query.data ?? null} />;
}

function IdentityForm({ identity }: { identity: ClientIdentity | null }) {
  const queryClient = useQueryClient();
  const auth = useAuth();
  const [type, setType] = useState<AccountType>(identity?.account_type ?? 'individual');
  const [cin, setCin] = useState(identity?.cin_number ?? '');
  const [company, setCompany] = useState(identity?.company_name ?? '');
  const [ice, setIce] = useState(identity?.ice ?? '');
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const refresh = async () => {
    await queryClient.invalidateQueries({ queryKey: ['client-identity'] });
    await auth.refreshUser();
  };

  const save = async () => {
    setErrors({});
    setError(null);
    setSaving(true);
    try {
      await api.saveClientIdentity(
        type === 'individual' ? { account_type: type, cin_number: cin } : { account_type: type, company_name: company, ice },
      );
      await refresh();
    } catch (e) {
      if (e instanceof ApiError && Object.keys(e.fieldErrors).length) setErrors(e.fieldErrors);
      else setError(errorMessage(e));
    } finally {
      setSaving(false);
    }
  };

  // Documents attendus pour le type enregistré (après un changement de type, enregistrer d'abord).
  const checklist = identity && identity.account_type === type ? identity.checklist : [];

  return (
    <Screen edges={['bottom']}>
      <Banner
        icon="lock-closed-outline"
        message={t("Votre identité est exigée avant votre première annonce. Elle reste privée : seule l'équipe CargoConnect y a accès.")}
      />
      {identity ? <IdentityStatus identity={identity} /> : null}

      <SectionTitle>{t('Vous êtes :')}</SectionTitle>
      <View style={styles.choices}>
        <Chip label={t('Particulier')} selected={type === 'individual'} onPress={() => setType('individual')} />
        <Chip label={t('Entreprise')} selected={type === 'company'} onPress={() => setType('company')} />
      </View>

      {type === 'individual' ? (
        <TextField label={t('Numéro de la CIN')} placeholder="AB123456" autoCapitalize="characters" value={cin} onChangeText={setCin} error={errors.cin_number} />
      ) : (
        <>
          <TextField label={t('Raison sociale')} value={company} onChangeText={setCompany} error={errors.company_name} />
          <TextField label={t('ICE (15 chiffres)')} keyboardType="number-pad" maxLength={15} value={ice} onChangeText={setIce} error={errors.ice} />
        </>
      )}
      {error ? <Banner tone="danger" message={error} icon="alert-circle-outline" /> : null}
      <Button title={t('Enregistrer')} onPress={save} loading={saving} />

      {checklist.length ? (
        <>
          <SectionTitle>{t('Documents')}</SectionTitle>
          <Card>
            {checklist.map((item) => (
              <DocumentRow key={`${item.doc_type}-${item.side}`} item={item} onUploaded={refresh} />
            ))}
          </Card>
        </>
      ) : null}
    </Screen>
  );
}

function IdentityStatus({ identity }: { identity: ClientIdentity }) {
  switch (identity.status) {
    case 'verified':
      return <Banner tone="success" icon="shield-checkmark-outline" message={t('Identité vérifiée : le badge « Client vérifié » apparaît sur vos annonces.')} />;
    case 'pending':
      return <Banner message={t('Identité en cours de vérification. Vous pouvez déjà publier vos annonces.')} />;
    case 'rejected':
      return <Banner tone="danger" message={t('Identité refusée : {reason}', { reason: identity.rejection_reason || '—' })} />;
    default:
      return <Banner tone="warning" message={t('Ajoutez les documents demandés ci-dessous pour pouvoir publier.')} />;
  }
}

function DocumentRow({ item, onUploaded }: { item: IdentityChecklistItem; onUploaded: () => Promise<void> }) {
  const [error, setError] = useState<string | null>(null);
  const [sending, setSending] = useState(false);
  const state = STATE[item.state];
  const label =
    item.doc_type === 'cin'
      ? `${t("Carte d'identité nationale")} · ${item.side === 'recto' ? t('Recto') : t('Verso')}`
      : t('Registre de commerce / attestation ICE');

  const send = async (source: 'camera' | 'library') => {
    setError(null);
    if (source === 'camera') {
      const permission = await ImagePicker.requestCameraPermissionsAsync();
      if (!permission.granted) {
        setError(t("L'accès à l'appareil photo a été refusé."));
        return;
      }
    }
    const options: ImagePicker.ImagePickerOptions = { mediaTypes: ['images'], quality: 0.8 };
    const result = source === 'camera' ? await ImagePicker.launchCameraAsync(options) : await ImagePicker.launchImageLibraryAsync(options);
    if (result.canceled) return;
    setSending(true);
    try {
      await api.uploadClientDocument(await assetToFormData('file', result.assets[0], { doc_type: item.doc_type, side: item.side }));
      await onUploaded();
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setSending(false);
    }
  };

  return (
    <View style={styles.item}>
      <View style={styles.row}>
        <Text style={styles.label}>{label}</Text>
        <Badge label={t(state.label)} tone={state.tone} />
      </View>
      {item.state === 'rejected' && item.review_note ? <Text style={styles.rejected}>{item.review_note}</Text> : null}
      <Text style={textStyles.caption}>{t('Document entier, bien à plat, lisible et sans reflet.')}</Text>
      {error ? <Text style={styles.rejected}>{error}</Text> : null}
      <View style={styles.row}>
        <Button title={t('Prendre une photo')} icon="camera-outline" variant={item.state === 'missing' ? 'primary' : 'secondary'} loading={sending} onPress={() => send('camera')} style={{ flex: 1 }} />
        <Button title={t('Galerie')} icon="images-outline" variant="ghost" disabled={sending} onPress={() => send('library')} style={{ flex: 1 }} />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  choices: { flexDirection: 'row', gap: Spacing.sm },
  item: { gap: Spacing.xs, paddingVertical: Spacing.xs },
  row: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: Spacing.sm },
  label: { flex: 1, fontSize: FontSize.body, fontFamily: Fonts.semibold, color: Colors.text },
  rejected: { fontFamily: Fonts.regular, fontSize: FontSize.small, color: Colors.danger },
});
