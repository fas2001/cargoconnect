import { useQuery, useQueryClient } from '@tanstack/react-query';
import * as ImagePicker from 'expo-image-picker';
import { useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';

import { OptionPicker } from '@/components/option-picker';
import { VerificationBadge } from '@/components/status-badge';
import { Banner, Button, Card, ErrorState, Loading, Screen, SectionTitle, textStyles } from '@/components/ui';
import { Colors, FontSize } from '@/constants/theme';
import { t, tr } from '@/i18n';
import { documentTypes } from '@/i18n/labels';
import { errorMessage } from '@/services/api';
import { api } from '@/services/endpoints';
import { assetToFormData } from '@/services/upload';
import { formatDateTime } from '@/utils/format';

export default function Documents() {
  const queryClient = useQueryClient();
  const profile = useQuery({ queryKey: ['driver-profile'], queryFn: api.driverProfile });
  const [docType, setDocType] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);

  const upload = async (source: 'camera' | 'library') => {
    setError(null);
    const options: ImagePicker.ImagePickerOptions = { mediaTypes: ['images'], quality: 0.7 };
    if (source === 'camera') {
      const permission = await ImagePicker.requestCameraPermissionsAsync();
      if (!permission.granted) {
        setError(t("L'accès à l'appareil photo a été refusé."));
        return;
      }
    }
    const result = source === 'camera' ? await ImagePicker.launchCameraAsync(options) : await ImagePicker.launchImageLibraryAsync(options);
    if (result.canceled) return;
    setUploading(true);
    try {
      await api.uploadDocument(await assetToFormData('file', result.assets[0], { doc_type: docType! }));
      setDocType(null);
      await queryClient.invalidateQueries({ queryKey: ['driver-profile'] });
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setUploading(false);
    }
  };

  if (profile.isLoading) return <Loading />;
  if (profile.error || !profile.data) return <ErrorState message={errorMessage(profile.error)} onRetry={() => profile.refetch()} />;

  return (
    <Screen edges={['bottom']}>
      <Banner message={t("Vos justificatifs sont privés : seule l'équipe CargoConnect y a accès pour vérifier votre profil.")} icon="lock-closed-outline" />

      {profile.data.documents.map((d) => (
        <Card key={d.id}>
          <View style={styles.row}>
            <Text style={styles.title}>{tr(d.doc_type_label)}</Text>
            <VerificationBadge status={d.status} />
          </View>
          <Text style={textStyles.caption}>{t('Envoyé le {date}', { date: formatDateTime(d.created_at) })}</Text>
          {d.review_note ? <Text style={textStyles.secondary}>{d.review_note}</Text> : null}
        </Card>
      ))}

      <SectionTitle>{t('Ajouter un justificatif')}</SectionTitle>
      {error ? <Banner tone="danger" message={error} /> : null}
      <OptionPicker label={t('Type de document')} placeholder={t('Choisir')} options={documentTypes()} value={docType} onChange={setDocType} />
      <Button title={t('Prendre une photo')} icon="camera-outline" disabled={!docType} loading={uploading} onPress={() => upload('camera')} />
      <Button title={t('Choisir dans la galerie')} variant="secondary" icon="images-outline" disabled={!docType || uploading} onPress={() => upload('library')} />
    </Screen>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8 },
  title: { flex: 1, fontSize: FontSize.body, fontWeight: '700', color: Colors.text },
});
