import { Ionicons } from '@expo/vector-icons';
import { Image } from 'expo-image';
import * as ImagePicker from 'expo-image-picker';
import * as Location from 'expo-location';
import { useEffect, useState } from 'react';
import { Modal, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { Colors, FontSize, Radius, Spacing } from '@/constants/theme';
import { t } from '@/i18n';
import type { ShipmentProof } from '@/types/api';

import { SignaturePad } from './signature-pad';
import { Banner, Button, modalAnimation, TextField, textStyles } from './ui';

const MAX_PHOTOS = 5;

type Position = { latitude: number; longitude: number; accuracy: number | null };
type LocationResult = { position: Position } | { error: string };

/** Position actuelle du téléphone (demande l'autorisation si besoin). */
async function readPosition(): Promise<LocationResult> {
  try {
    const permission = await Location.requestForegroundPermissionsAsync();
    if (!permission.granted) return { error: t('La position GPS est nécessaire : activez la localisation de votre téléphone.') };
    const current = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.High });
    return { position: { latitude: current.coords.latitude, longitude: current.coords.longitude, accuracy: current.coords.accuracy } };
  } catch {
    return { error: t('Position introuvable. Vérifiez que la localisation est activée, puis réessayez.') };
  }
}

/**
 * Preuves du chauffeur au chargement et à la livraison : photos prises sur place (appareil photo
 * uniquement, pas la galerie), position GPS du téléphone et, à la livraison, nom et signature
 * de la personne qui réceptionne.
 */
export function ProofSheet({
  visible,
  title,
  withSignature,
  defaultReceiver = '',
  onCancel,
  onSubmit,
}: {
  visible: boolean;
  title: string;
  withSignature: boolean;
  defaultReceiver?: string;
  onCancel: () => void;
  onSubmit: (proof: ShipmentProof) => Promise<void>;
}) {
  return (
    <Modal visible={visible} animationType={modalAnimation('slide')} onRequestClose={onCancel}>
      {visible ? (
        <ProofForm title={title} withSignature={withSignature} defaultReceiver={defaultReceiver} onCancel={onCancel} onSubmit={onSubmit} />
      ) : null}
    </Modal>
  );
}

function ProofForm({
  title,
  withSignature,
  defaultReceiver,
  onCancel,
  onSubmit,
}: {
  title: string;
  withSignature: boolean;
  defaultReceiver: string;
  onCancel: () => void;
  onSubmit: (proof: ShipmentProof) => Promise<void>;
}) {
  const [photos, setPhotos] = useState<ImagePicker.ImagePickerAsset[]>([]);
  const [position, setPosition] = useState<Position | null>(null);
  const [locating, setLocating] = useState(true);
  const [receiver, setReceiver] = useState(defaultReceiver);
  const [signature, setSignature] = useState('');
  const [signing, setSigning] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [sending, setSending] = useState(false);

  const applyLocation = (result: LocationResult) => {
    if ('error' in result) setError(result.error);
    else setPosition(result.position);
    setLocating(false);
  };

  const retryLocation = () => {
    setLocating(true);
    setError(null);
    void readPosition().then(applyLocation);
  };

  // La position est relevée dès l'ouverture, pendant que le chauffeur prend ses photos.
  useEffect(() => {
    let open = true;
    void readPosition().then((result) => {
      if (open) applyLocation(result);
    });
    return () => {
      open = false;
    };
  }, []);

  const takePhoto = async () => {
    setError(null);
    const permission = await ImagePicker.requestCameraPermissionsAsync();
    if (!permission.granted) {
      setError(t("L'accès à l'appareil photo a été refusé."));
      return;
    }
    const result = await ImagePicker.launchCameraAsync({ mediaTypes: ['images'], quality: 0.6 });
    if (!result.canceled) setPhotos((list) => [...list, result.assets[0]].slice(0, MAX_PHOTOS));
  };

  const ready = photos.length > 0 && position !== null && (!withSignature || (receiver.trim() !== '' && signature !== ''));

  const submit = async () => {
    if (!ready || !position) return;
    setSending(true);
    setError(null);
    try {
      await onSubmit({
        photos,
        ...position,
        ...(withSignature ? { receiver_name: receiver.trim(), signature } : {}),
      });
    } catch (e) {
      setError(e instanceof Error ? e.message : t('Une erreur inattendue est survenue.'));
    } finally {
      setSending(false);
    }
  };

  return (
    <SafeAreaView style={styles.sheet}>
      <ScrollView contentContainerStyle={styles.content} scrollEnabled={!signing} keyboardShouldPersistTaps="handled">
        <Text style={textStyles.title}>{title}</Text>
        <Text style={textStyles.secondary}>
          {t('Ces preuves protègent le client et le transporteur en cas de litige ou de vol.')}
        </Text>

        <Step done={photos.length > 0} label={t('Photos de la marchandise ({count}/{max})', { count: photos.length, max: MAX_PHOTOS })} />
        <View style={styles.photos}>
          {photos.map((photo) => (
            <Pressable
              key={photo.uri}
              onPress={() => setPhotos((list) => list.filter((p) => p.uri !== photo.uri))}
              accessibilityLabel={t('Retirer la photo')}>
              <Image source={photo.uri} style={styles.photo} />
              <View style={styles.remove}>
                <Ionicons name="close" size={14} color={Colors.white} />
              </View>
            </Pressable>
          ))}
          {photos.length < MAX_PHOTOS ? (
            <Pressable onPress={takePhoto} style={[styles.photo, styles.addPhoto]} accessibilityRole="button" accessibilityLabel={t('Prendre une photo')}>
              <Ionicons name="camera-outline" size={28} color={Colors.primary} />
            </Pressable>
          ) : null}
        </View>

        <Step
          done={position !== null}
          label={
            position
              ? t('Position enregistrée (±{meters} m)', { meters: Math.round(position.accuracy ?? 0) })
              : locating
                ? t('Localisation en cours…')
                : t('Position GPS')
          }
        />
        {!position && !locating ? <Button title={t('Réessayer la localisation')} variant="secondary" icon="locate-outline" onPress={retryLocation} /> : null}

        {withSignature ? (
          <>
            <Step done={receiver.trim() !== '' && signature !== ''} label={t('Réception de la marchandise')} />
            <TextField label={t('Nom de la personne qui réceptionne')} value={receiver} onChangeText={setReceiver} />
            <SignaturePad onChange={setSignature} onSigning={setSigning} />
          </>
        ) : null}

        {error ? <Banner tone="danger" message={error} icon="alert-circle-outline" /> : null}
        <Button title={t('Confirmer')} onPress={submit} loading={sending} disabled={!ready} />
        <Button title={t('Annuler')} variant="ghost" onPress={onCancel} disabled={sending} />
      </ScrollView>
    </SafeAreaView>
  );
}

function Step({ done, label }: { done: boolean; label: string }) {
  return (
    <View style={styles.step}>
      <Ionicons name={done ? 'checkmark-circle' : 'ellipse-outline'} size={22} color={done ? Colors.success : Colors.textMuted} />
      <Text style={styles.stepLabel}>{label}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  sheet: { flex: 1, backgroundColor: Colors.background },
  content: { padding: Spacing.lg, gap: Spacing.md },
  step: { flexDirection: 'row', alignItems: 'center', gap: Spacing.sm, marginTop: Spacing.sm },
  stepLabel: { flex: 1, fontSize: FontSize.body, fontWeight: '600', color: Colors.text },
  photos: { flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.sm },
  photo: { width: 84, height: 84, borderRadius: Radius.md, backgroundColor: Colors.border },
  addPhoto: {
    borderWidth: 1.5,
    borderStyle: 'dashed',
    borderColor: Colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: Colors.primarySoft,
  },
  remove: { position: 'absolute', top: 4, right: 4, backgroundColor: 'rgba(0,0,0,0.6)', borderRadius: 10, padding: 2 },
});
