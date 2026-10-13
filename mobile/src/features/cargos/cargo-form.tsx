import { Ionicons } from '@expo/vector-icons';
import { Image } from 'expo-image';
import * as ImagePicker from 'expo-image-picker';
import { useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { DateField } from '@/components/date-field';
import { OptionPicker } from '@/components/option-picker';
import { Banner, Button, ErrorState, Loading, SectionTitle, TextField } from '@/components/ui';
import { Colors, Radius, Spacing } from '@/constants/theme';
import { useReferenceData } from '@/hooks/use-reference';
import { ApiError, errorMessage } from '@/services/api';
import type { CargoInput, TruckType } from '@/types/api';

export const MAX_PHOTOS = 5;

export type CargoFormValues = {
  title: string;
  description: string;
  category: number | null;
  weight_kg: string;
  volume_m3: string;
  truck_type: TruckType | null;
  origin_city: number | null;
  origin_address: string;
  destination_city: number | null;
  destination_address: string;
  loading_date: string | null;
  proposed_price: string;
  instructions: string;
};

export const EMPTY_CARGO: CargoFormValues = {
  title: '',
  description: '',
  category: null,
  weight_kg: '',
  volume_m3: '',
  truck_type: null,
  origin_city: null,
  origin_address: '',
  destination_city: null,
  destination_address: '',
  loading_date: null,
  proposed_price: '',
  instructions: '',
};

const decimal = (v: string) => v.replace(',', '.').replace(/[^\d.]/g, '');

function validate(v: CargoFormValues): Record<string, string> {
  const errors: Record<string, string> = {};
  if (!v.title.trim()) errors.title = 'Indiquez un titre.';
  if (!v.category) errors.category = 'Choisissez une catégorie.';
  if (!v.weight_kg || Number(v.weight_kg) <= 0) errors.weight_kg = 'Indiquez le poids.';
  if (!v.truck_type) errors.truck_type = 'Choisissez un type de camion.';
  if (!v.origin_city) errors.origin_city = 'Choisissez la ville de départ.';
  if (!v.destination_city) errors.destination_city = "Choisissez la ville d'arrivée.";
  if (!v.loading_date) errors.loading_date = 'Choisissez une date.';
  return errors;
}

function toInput(v: CargoFormValues, publish: boolean): CargoInput {
  return {
    title: v.title.trim(),
    description: v.description.trim(),
    category: v.category!,
    weight_kg: v.weight_kg,
    volume_m3: v.volume_m3 || null,
    truck_type: v.truck_type!,
    origin_city: v.origin_city!,
    origin_address: v.origin_address.trim(),
    destination_city: v.destination_city!,
    destination_address: v.destination_address.trim(),
    loading_date: v.loading_date!,
    proposed_price: v.proposed_price || null,
    instructions: v.instructions.trim(),
    publish,
  };
}

type Props = {
  initial?: CargoFormValues;
  submitLabel: string;
  allowDraft?: boolean;
  withPhotos?: boolean;
  onSubmit: (input: CargoInput, photos: ImagePicker.ImagePickerAsset[]) => Promise<void>;
};

export function CargoForm({ initial = EMPTY_CARGO, submitLabel, allowDraft, withPhotos, onSubmit }: Props) {
  const ref = useReferenceData();
  const [values, setValues] = useState<CargoFormValues>(initial);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [photos, setPhotos] = useState<ImagePicker.ImagePickerAsset[]>([]);
  const [submitting, setSubmitting] = useState<'publish' | 'draft' | null>(null);

  const set = <K extends keyof CargoFormValues>(key: K) => (value: CargoFormValues[K]) =>
    setValues((v) => ({ ...v, [key]: value }));

  if (ref.isLoading) return <Loading />;
  if (ref.error) return <ErrorState message={errorMessage(ref.error)} onRetry={ref.refetch} />;

  const pickPhotos = async () => {
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images'],
      allowsMultipleSelection: true,
      selectionLimit: MAX_PHOTOS - photos.length,
      quality: 0.6, // photos allégées pour les connexions mobiles
    });
    if (!result.canceled) setPhotos((p) => [...p, ...result.assets].slice(0, MAX_PHOTOS));
  };

  const submit = async (publish: boolean) => {
    const localErrors = validate(values);
    setErrors(localErrors);
    setFormError(null);
    if (Object.keys(localErrors).length) {
      setFormError('Merci de compléter les champs indiqués.');
      return;
    }
    setSubmitting(publish ? 'publish' : 'draft');
    try {
      await onSubmit(toInput(values, publish), photos);
    } catch (e) {
      if (e instanceof ApiError && Object.keys(e.fieldErrors).length) {
        setErrors(e.fieldErrors);
        setFormError(e.message);
      } else {
        setFormError(errorMessage(e));
      }
    } finally {
      setSubmitting(null);
    }
  };

  const today = new Date();
  today.setHours(0, 0, 0, 0);

  return (
    <>
      <SectionTitle>Marchandise</SectionTitle>
      <TextField label="Titre" placeholder="Ex. 20 palettes de carrelage" value={values.title} onChangeText={set('title')} error={errors.title} maxLength={120} />
      <OptionPicker label="Catégorie" placeholder="Choisir" options={ref.categoryOptions} value={values.category} onChange={set('category')} error={errors.category} />
      <TextField
        label="Description"
        placeholder="Nature, conditionnement, fragilité..."
        multiline
        value={values.description}
        onChangeText={set('description')}
        error={errors.description}
      />
      <View style={styles.row}>
        <View style={styles.flex}>
          <TextField label="Poids (kg)" keyboardType="decimal-pad" placeholder="18000" value={values.weight_kg} onChangeText={(t) => set('weight_kg')(decimal(t))} error={errors.weight_kg} />
        </View>
        <View style={styles.flex}>
          <TextField label="Volume (m³)" keyboardType="decimal-pad" placeholder="Facultatif" value={values.volume_m3} onChangeText={(t) => set('volume_m3')(decimal(t))} error={errors.volume_m3} />
        </View>
      </View>
      <OptionPicker label="Type de camion" placeholder="Choisir" options={ref.truckTypeOptions} value={values.truck_type} onChange={set('truck_type')} error={errors.truck_type} />

      <SectionTitle>Trajet</SectionTitle>
      <OptionPicker label="Ville de départ" placeholder="Choisir une ville" searchable options={ref.cityOptions} value={values.origin_city} onChange={set('origin_city')} error={errors.origin_city} />
      <TextField
        label="Adresse de chargement"
        placeholder="Quartier, rue, zone industrielle..."
        value={values.origin_address}
        onChangeText={set('origin_address')}
        hint="Visible uniquement par le transporteur retenu."
        error={errors.origin_address}
      />
      <OptionPicker label="Ville d'arrivée" placeholder="Choisir une ville" searchable options={ref.cityOptions} value={values.destination_city} onChange={set('destination_city')} error={errors.destination_city} />
      <TextField label="Adresse de livraison" value={values.destination_address} onChangeText={set('destination_address')} hint="Visible uniquement par le transporteur retenu." error={errors.destination_address} />
      <DateField label="Date de chargement souhaitée" value={values.loading_date} onChange={set('loading_date')} minimumDate={today} error={errors.loading_date} />

      <SectionTitle>Prix et détails</SectionTitle>
      <TextField
        label="Prix proposé (DH)"
        keyboardType="number-pad"
        placeholder="Facultatif — laissez vide pour recevoir des offres"
        value={values.proposed_price}
        onChangeText={(t) => set('proposed_price')(decimal(t))}
        error={errors.proposed_price}
      />
      <TextField label="Instructions" placeholder="Horaires d'accès, manutention..." multiline value={values.instructions} onChangeText={set('instructions')} error={errors.instructions} />

      {withPhotos ? (
        <>
          <SectionTitle>Photos ({photos.length}/{MAX_PHOTOS})</SectionTitle>
          <View style={styles.photos}>
            {photos.map((p) => (
              <Pressable key={p.uri} onPress={() => setPhotos((list) => list.filter((x) => x.uri !== p.uri))} accessibilityLabel="Retirer la photo">
                <Image source={p.uri} style={styles.photo} />
                <View style={styles.remove}>
                  <Ionicons name="close" size={14} color={Colors.white} />
                </View>
              </Pressable>
            ))}
            {photos.length < MAX_PHOTOS ? (
              <Pressable onPress={pickPhotos} style={[styles.photo, styles.addPhoto]} accessibilityLabel="Ajouter des photos">
                <Ionicons name="camera-outline" size={26} color={Colors.primary} />
              </Pressable>
            ) : null}
          </View>
        </>
      ) : null}

      <Text style={styles.notice}>
        Ne mettez pas votre numéro de téléphone dans l&apos;annonce : il sera partagé automatiquement avec le transporteur retenu.
      </Text>
      {formError ? <Banner tone="danger" message={formError} icon="alert-circle-outline" /> : null}
      <Button title={submitLabel} onPress={() => submit(true)} loading={submitting === 'publish'} disabled={!!submitting} />
      {allowDraft ? (
        <Button title="Enregistrer en brouillon" variant="secondary" onPress={() => submit(false)} loading={submitting === 'draft'} disabled={!!submitting} />
      ) : null}
    </>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', gap: Spacing.md },
  flex: { flex: 1 },
  photos: { flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.sm },
  photo: { width: 76, height: 76, borderRadius: Radius.md, backgroundColor: Colors.background },
  addPhoto: {
    borderWidth: 1.5,
    borderStyle: 'dashed',
    borderColor: Colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: Colors.primarySoft,
  },
  remove: {
    position: 'absolute',
    top: 4,
    right: 4,
    backgroundColor: 'rgba(0,0,0,0.6)',
    borderRadius: 10,
    padding: 2,
  },
  notice: { fontSize: 12, color: Colors.textSecondary },
});
