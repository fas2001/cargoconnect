import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Image } from 'expo-image';
import * as ImagePicker from 'expo-image-picker';
import { useState } from 'react';
import { Modal, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { DateField } from '@/components/date-field';
import { OptionPicker } from '@/components/option-picker';
import { Badge, type BadgeTone, Banner, Button, Card, Chip, ErrorState, Loading, modalAnimation, Screen, SectionTitle, TextField, textStyles } from '@/components/ui';
import { Colors, Fonts, FontSize, Radius, Spacing } from '@/constants/theme';
import { t, type TKey } from '@/i18n';
import { documentTypeLabel } from '@/i18n/labels';
import { errorMessage } from '@/services/api';
import { api } from '@/services/endpoints';
import { assetToFormData } from '@/services/upload';
import type { ChecklistItem, ChecklistState, DocumentSide, DocumentType, Vehicle } from '@/types/api';
import { formatDay } from '@/utils/format';

/** Ce qu'on envoie : un document précis (type, face, camion). */
type Target = { doc_type: DocumentType; side: DocumentSide; vehicle_id: string | null; vehicle_label: string };

const STATE: Record<ChecklistState, { label: TKey; tone: BadgeTone }> = {
  missing: { label: 'Manquant', tone: 'neutral' },
  pending: { label: 'À vérifier', tone: 'warning' },
  verified: { label: 'Validé', tone: 'success' },
  rejected: { label: 'Refusé', tone: 'danger' },
  expired: { label: 'Expiré', tone: 'danger' },
};

const OPTIONAL_TYPES: DocumentType[] = ['agrement', 'visite_technique', 'autre'];
const VEHICLE_TYPES: DocumentType[] = ['carte_grise', 'assurance', 'visite_technique'];

export default function Documents() {
  const profile = useQuery({ queryKey: ['driver-profile'], queryFn: api.driverProfile });
  const [target, setTarget] = useState<Target | null>(null);
  const [optionalType, setOptionalType] = useState<DocumentType | null>(null);
  const [optionalVehicle, setOptionalVehicle] = useState<string | null>(null);

  if (profile.isLoading) return <Loading />;
  if (profile.error || !profile.data) return <ErrorState message={errorMessage(profile.error)} onRetry={() => profile.refetch()} />;

  const { checklist, vehicles } = profile.data;
  const activeVehicles = vehicles.filter((v) => v.is_active);
  const done = checklist.filter((i) => i.state === 'verified').length;
  const personal = checklist.filter((i) => !i.vehicle_id);
  const optionalDocs = profile.data.documents.filter((d) => OPTIONAL_TYPES.includes(d.doc_type));

  const openOptional = () => {
    if (!optionalType) return;
    const vehicle = activeVehicles.find((v) => v.id === optionalVehicle);
    setTarget({ doc_type: optionalType, side: 'unique', vehicle_id: vehicle?.id ?? null, vehicle_label: vehicle?.registration_number ?? '' });
  };

  return (
    <Screen edges={['bottom']} refreshing={profile.isRefetching} onRefresh={() => profile.refetch()}>
      <Banner
        icon="lock-closed-outline"
        message={t("Vos justificatifs sont privés : seule l'équipe CargoConnect y a accès pour vérifier votre profil.")}
      />
      <Text style={textStyles.secondary}>{t('{done} / {total} justificatifs validés', { done, total: checklist.length })}</Text>

      <SectionTitle>{t('Identité')}</SectionTitle>
      <Card>
        {personal.filter((i) => i.doc_type !== 'permis').map((item) => <ChecklistRow key={key(item)} item={item} onPress={() => setTarget(item)} />)}
      </Card>

      <SectionTitle>{t('Permis de conduire')}</SectionTitle>
      <Card>
        {personal.filter((i) => i.doc_type === 'permis').map((item) => <ChecklistRow key={key(item)} item={item} onPress={() => setTarget(item)} />)}
      </Card>

      {activeVehicles.map((vehicle) => (
        <View key={vehicle.id} style={{ gap: Spacing.sm }}>
          <SectionTitle>{t('Camion {plate}', { plate: vehicle.registration_number })}</SectionTitle>
          <Card>
            {checklist.filter((i) => i.vehicle_id === vehicle.id).map((item) => <ChecklistRow key={key(item)} item={item} onPress={() => setTarget(item)} />)}
          </Card>
        </View>
      ))}
      {activeVehicles.length === 0 ? <Banner tone="warning" message={t('Ajoutez votre camion pour proposer vos tarifs.')} /> : null}

      <SectionTitle>{t('Autres justificatifs (facultatif)')}</SectionTitle>
      {optionalDocs.map((d) => (
        <Card key={d.id}>
          <View style={styles.row}>
            <Text style={styles.label}>{documentTypeLabel(d.doc_type)}</Text>
            <Badge label={t(STATE[d.is_expired ? 'expired' : d.status].label)} tone={STATE[d.is_expired ? 'expired' : d.status].tone} />
          </View>
        </Card>
      ))}
      <OptionPicker
        label={t('Type de document')}
        placeholder={t('Choisir')}
        options={OPTIONAL_TYPES.map((value) => ({ value, label: documentTypeLabel(value) }))}
        value={optionalType}
        onChange={setOptionalType}
      />
      {optionalType && VEHICLE_TYPES.includes(optionalType) ? (
        <OptionPicker
          label={t('Camion')}
          placeholder={t('Choisir un véhicule')}
          options={activeVehicles.map((v) => ({ value: v.id, label: v.registration_number }))}
          value={optionalVehicle}
          onChange={setOptionalVehicle}
        />
      ) : null}
      <Button
        title={t('Ajouter')}
        variant="secondary"
        icon="add-outline"
        disabled={!optionalType || (VEHICLE_TYPES.includes(optionalType) && !optionalVehicle)}
        onPress={openOptional}
      />

      <UploadSheet target={target} vehicles={activeVehicles} onClose={() => setTarget(null)} />
    </Screen>
  );
}

const key = (item: ChecklistItem) => `${item.doc_type}-${item.side}-${item.vehicle_id ?? ''}`;

const sideLabel = (side: DocumentSide) => (side === 'recto' ? t('Recto') : side === 'verso' ? t('Verso') : '');

function ChecklistRow({ item, onPress }: { item: ChecklistItem; onPress: () => void }) {
  const state = STATE[item.state];
  return (
    <View style={styles.item}>
      <View style={styles.row}>
        <Text style={styles.label}>
          {documentTypeLabel(item.doc_type)}
          {item.side !== 'unique' ? ` · ${sideLabel(item.side)}` : ''}
        </Text>
        <Badge label={t(state.label)} tone={state.tone} />
      </View>
      {item.expires_on ? <Text style={textStyles.caption}>{t('Expire le {date}', { date: formatDay(item.expires_on) })}</Text> : null}
      {item.state === 'rejected' && item.review_note ? <Text style={styles.rejected}>{item.review_note}</Text> : null}
      <Button
        title={item.state === 'missing' ? t('Ajouter') : t('Remplacer')}
        variant={item.state === 'missing' || item.state === 'rejected' || item.state === 'expired' ? 'primary' : 'ghost'}
        icon="camera-outline"
        onPress={onPress}
      />
    </View>
  );
}

/** Conseils de prise de vue : une photo nette évite un refus (et facilitera la lecture automatique). */
function photoTip(type: DocumentType): string {
  if (type === 'selfie') return t('Visage bien visible, de face, sans lunettes de soleil ni casquette.');
  return t('Document entier, bien à plat, lisible et sans reflet.');
}

function numberLabel(type: DocumentType): string {
  switch (type) {
    case 'cin':
      return t('Numéro de la CIN');
    case 'permis':
      return t('Numéro du permis');
    case 'carte_grise':
      return t("Numéro d'immatriculation");
    case 'assurance':
      return t('Numéro de police');
    default:
      return t('Numéro (facultatif)');
  }
}

function UploadSheet({ target, vehicles, onClose }: { target: Target | null; vehicles: Vehicle[]; onClose: () => void }) {
  return (
    <Modal visible={target !== null} animationType={modalAnimation('slide')} onRequestClose={onClose}>
      {target ? (
        <UploadForm key={`${target.doc_type}-${target.side}-${target.vehicle_id ?? ''}`} target={target} vehicles={vehicles} onClose={onClose} />
      ) : null}
    </Modal>
  );
}

function UploadForm({ target, vehicles, onClose }: { target: Target; vehicles: Vehicle[]; onClose: () => void }) {
  const queryClient = useQueryClient();
  const type = target.doc_type;
  const mainFace = target.side !== 'verso';
  const askNumber = mainFace && type !== 'selfie';
  const askExpiry = mainFace && ['cin', 'permis', 'assurance', 'visite_technique'].includes(type);
  const vehicle = vehicles.find((v) => v.id === target.vehicle_id);

  const [photo, setPhoto] = useState<ImagePicker.ImagePickerAsset | null>(null);
  const [number, setNumber] = useState(type === 'carte_grise' && vehicle ? vehicle.registration_number : '');
  const [expiresOn, setExpiresOn] = useState<string | null>(null);
  const [issuer, setIssuer] = useState('');
  const [coversGoods, setCoversGoods] = useState<boolean | null>(null);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [error, setError] = useState<string | null>(null);
  const [sending, setSending] = useState(false);

  const pick = async (source: 'camera' | 'library') => {
    setError(null);
    if (source === 'camera') {
      const permission = await ImagePicker.requestCameraPermissionsAsync();
      if (!permission.granted) {
        setError(t("L'accès à l'appareil photo a été refusé."));
        return;
      }
    }
    const options: ImagePicker.ImagePickerOptions = {
      mediaTypes: ['images'],
      quality: 0.8,
      cameraType: type === 'selfie' ? ImagePicker.CameraType.front : ImagePicker.CameraType.back,
    };
    const result = source === 'camera' ? await ImagePicker.launchCameraAsync(options) : await ImagePicker.launchImageLibraryAsync(options);
    if (!result.canceled) setPhoto(result.assets[0]);
  };

  const send = async () => {
    if (!photo) return;
    setError(null);
    setErrors({});
    setSending(true);
    const fields: Record<string, string> = { doc_type: type, side: target.side };
    if (target.vehicle_id) fields.vehicle = target.vehicle_id;
    if (askNumber && number.trim()) fields.document_number = number.trim();
    if (askExpiry && expiresOn) fields.expires_on = expiresOn;
    if (type === 'assurance') {
      if (issuer.trim()) fields.issuer = issuer.trim();
      if (coversGoods !== null) fields.covers_goods = String(coversGoods);
    }
    try {
      await api.uploadDocument(await assetToFormData('file', photo, fields));
      await queryClient.invalidateQueries({ queryKey: ['driver-profile'] });
      onClose();
    } catch (e) {
      const fieldErrors = (e as { fieldErrors?: Record<string, string> }).fieldErrors ?? {};
      setErrors(fieldErrors);
      setError(errorMessage(e));
    } finally {
      setSending(false);
    }
  };

  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const title = `${documentTypeLabel(type)}${target.side !== 'unique' ? ` · ${sideLabel(target.side)}` : ''}`;

  return (
    <SafeAreaView style={styles.sheet}>
      <ScrollView contentContainerStyle={styles.sheetContent} keyboardShouldPersistTaps="handled">
        <Text style={textStyles.title}>{title}</Text>
        {target.vehicle_label ? <Text style={textStyles.secondary}>{t('Camion {plate}', { plate: target.vehicle_label })}</Text> : null}
        <Text style={textStyles.secondary}>{photoTip(type)}</Text>

        {photo ? <Image source={photo.uri} style={styles.preview} contentFit="contain" /> : null}
        <Button title={photo ? t('Reprendre la photo') : t('Prendre une photo')} icon="camera-outline" variant={photo ? 'secondary' : 'primary'} onPress={() => pick('camera')} />
        {type !== 'selfie' ? (
          <Button title={t('Choisir dans la galerie')} variant="ghost" icon="images-outline" onPress={() => pick('library')} />
        ) : null}

        {askNumber ? (
          <TextField label={numberLabel(type)} autoCapitalize="characters" value={number} onChangeText={setNumber} error={errors.document_number} />
        ) : null}
        {askExpiry ? (
          <DateField label={t("Date d'expiration")} value={expiresOn} onChange={setExpiresOn} minimumDate={today} error={errors.expires_on} />
        ) : null}
        {type === 'assurance' ? (
          <>
            <TextField label={t("Compagnie d'assurance")} placeholder={t('Ex. Wafa Assurance')} value={issuer} onChangeText={setIssuer} error={errors.issuer} />
            <Text style={styles.question}>{t("L'assurance couvre-t-elle la marchandise transportée ?")}</Text>
            <View style={styles.choices}>
              <Chip label={t('Oui')} selected={coversGoods === true} onPress={() => setCoversGoods(true)} />
              <Chip label={t('Non')} selected={coversGoods === false} onPress={() => setCoversGoods(false)} />
            </View>
            {errors.covers_goods ? <Text style={styles.rejected}>{errors.covers_goods}</Text> : null}
          </>
        ) : null}

        {error ? <Banner tone="danger" message={error} icon="alert-circle-outline" /> : null}
        <Button title={t('Envoyer')} onPress={send} loading={sending} disabled={!photo} />
        <Button title={t('Annuler')} variant="ghost" onPress={onClose} disabled={sending} />
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: Spacing.sm },
  item: { gap: Spacing.xs, paddingVertical: Spacing.xs },
  label: { flex: 1, fontSize: FontSize.body, fontFamily: Fonts.semibold, color: Colors.text },
  rejected: { fontFamily: Fonts.regular, fontSize: FontSize.small, color: Colors.danger },
  sheet: { flex: 1, backgroundColor: Colors.background },
  sheetContent: { padding: Spacing.lg, gap: Spacing.md },
  preview: { width: '100%', height: 220, borderRadius: Radius.md, backgroundColor: Colors.border },
  question: { fontFamily: Fonts.regular, fontSize: FontSize.body, color: Colors.text },
  choices: { flexDirection: 'row', gap: Spacing.sm },
});
