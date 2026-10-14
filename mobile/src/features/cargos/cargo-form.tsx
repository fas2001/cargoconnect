import { Ionicons } from '@expo/vector-icons';
import { Image } from 'expo-image';
import * as ImagePicker from 'expo-image-picker';
import { useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { DateField } from '@/components/date-field';
import { OptionPicker } from '@/components/option-picker';
import { Banner, Button, ErrorState, Loading, SectionTitle, TextField } from '@/components/ui';
import { Colors, Fonts, Radius, Spacing } from '@/constants/theme';
import { useReferenceData } from '@/hooks/use-reference';
import { ApiError, errorMessage } from '@/services/api';
import type { CargoInput, TruckType } from '@/types/api';
import { t } from '@/i18n';

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
  declared_value: string;
  recipient_name: string;
  recipient_phone: string;
  accept_declaration: boolean;
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
  declared_value: '',
  recipient_name: '',
  recipient_phone: '',
  accept_declaration: false,
};

const decimal = (v: string) => v.replace(',', '.').replace(/[^\d.]/g, '');

function validate(v: CargoFormValues): Record<string, string> {
  const errors: Record<string, string> = {};
  if (!v.title.trim()) errors.title = t('Indiquez un titre.');
  if (!v.category) errors.category = t('Choisissez une catégorie.');
  if (!v.weight_kg || Number(v.weight_kg) <= 0) errors.weight_kg = t('Indiquez le poids.');
  if (!v.truck_type) errors.truck_type = t('Choisissez un type de camion.');
  if (!v.origin_city) errors.origin_city = t('Choisissez la ville de départ.');
  if (!v.destination_city) errors.destination_city = t("Choisissez la ville d'arrivée.");
  if (!v.loading_date) errors.loading_date = t('Choisissez une date.');
  if (!v.declared_value || Number(v.declared_value) <= 0) errors.declared_value = t('Indiquez la valeur de la marchandise.');
  if (!v.accept_declaration) errors.accept_goods_declaration = t('Cochez la déclaration pour publier.');
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
    declared_value: v.declared_value,
    recipient_name: v.recipient_name.trim(),
    recipient_phone: v.recipient_phone.trim(),
    accept_goods_declaration: v.accept_declaration,
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
      setFormError(t('Merci de compléter les champs indiqués.'));
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
      <SectionTitle>{t('Marchandise')}</SectionTitle>
      <TextField label={t('Titre')} placeholder={t('Ex. 20 palettes de carrelage')} value={values.title} onChangeText={set('title')} error={errors.title} maxLength={120} />
      <OptionPicker label={t('Catégorie')} placeholder={t('Choisir')} options={ref.categoryOptions} value={values.category} onChange={set('category')} error={errors.category} />
      <TextField
        label={t('Description')}
        placeholder={t('Nature, conditionnement, fragilité...')}
        multiline
        value={values.description}
        onChangeText={set('description')}
        error={errors.description}
      />
      <View style={styles.row}>
        <View style={styles.flex}>
          <TextField label={t('Poids (kg)')} keyboardType="decimal-pad" placeholder="18000" value={values.weight_kg} onChangeText={(text) => set('weight_kg')(decimal(text))} error={errors.weight_kg} />
        </View>
        <View style={styles.flex}>
          <TextField label={t('Volume (m³)')} keyboardType="decimal-pad" placeholder={t('Facultatif')} value={values.volume_m3} onChangeText={(text) => set('volume_m3')(decimal(text))} error={errors.volume_m3} />
        </View>
      </View>
      <OptionPicker label={t('Type de camion')} placeholder={t('Choisir')} options={ref.truckTypeOptions} value={values.truck_type} onChange={set('truck_type')} error={errors.truck_type} />

      <SectionTitle>{t('Trajet')}</SectionTitle>
      <OptionPicker label={t('Ville de départ')} placeholder={t('Choisir une ville')} searchable options={ref.cityOptions} value={values.origin_city} onChange={set('origin_city')} error={errors.origin_city} />
      <TextField
        label={t('Adresse de chargement')}
        placeholder={t('Quartier, rue, zone industrielle...')}
        value={values.origin_address}
        onChangeText={set('origin_address')}
        hint={t('Visible uniquement par le transporteur retenu.')}
        error={errors.origin_address}
      />
      <OptionPicker label={t("Ville d'arrivée")} placeholder={t('Choisir une ville')} searchable options={ref.cityOptions} value={values.destination_city} onChange={set('destination_city')} error={errors.destination_city} />
      <TextField label={t('Adresse de livraison')} value={values.destination_address} onChangeText={set('destination_address')} hint={t('Visible uniquement par le transporteur retenu.')} error={errors.destination_address} />
      <DateField label={t('Date de chargement souhaitée')} value={values.loading_date} onChange={set('loading_date')} minimumDate={today} error={errors.loading_date} />

      <SectionTitle>{t('Prix et détails')}</SectionTitle>
      <TextField
        label={t('Prix proposé (DH)')}
        keyboardType="number-pad"
        placeholder={t('Facultatif — laissez vide pour recevoir des offres')}
        value={values.proposed_price}
        onChangeText={(text) => set('proposed_price')(decimal(text))}
        error={errors.proposed_price}
      />
      <TextField label={t('Instructions')} placeholder={t("Horaires d'accès, manutention...")} multiline value={values.instructions} onChangeText={set('instructions')} error={errors.instructions} />
      <TextField
        label={t('Valeur de la marchandise (DH)')}
        keyboardType="number-pad"
        value={values.declared_value}
        onChangeText={(text) => set('declared_value')(decimal(text))}
        hint={t('Visible uniquement par le transporteur retenu. Sert de référence en cas de litige ou de vol.')}
        error={errors.declared_value}
      />

      <SectionTitle>{t('Destinataire (facultatif)')}</SectionTitle>
      <TextField label={t('Nom du destinataire')} value={values.recipient_name} onChangeText={set('recipient_name')} error={errors.recipient_name} />
      <TextField
        label={t('Téléphone du destinataire')}
        keyboardType="phone-pad"
        placeholder="06 12 34 56 78"
        value={values.recipient_phone}
        onChangeText={set('recipient_phone')}
        hint={t("Si la marchandise est réceptionnée par quelqu'un d'autre que vous. Visible uniquement par le transporteur retenu.")}
        error={errors.recipient_phone}
      />

      {withPhotos ? (
        <>
          <SectionTitle>{t('Photos ({count}/{max})', { count: photos.length, max: MAX_PHOTOS })}</SectionTitle>
          <View style={styles.photos}>
            {photos.map((p) => (
              <Pressable key={p.uri} onPress={() => setPhotos((list) => list.filter((x) => x.uri !== p.uri))} accessibilityLabel={t('Retirer la photo')}>
                <Image source={p.uri} style={styles.photo} />
                <View style={styles.remove}>
                  <Ionicons name="close" size={14} color={Colors.white} />
                </View>
              </Pressable>
            ))}
            {photos.length < MAX_PHOTOS ? (
              <Pressable onPress={pickPhotos} style={[styles.photo, styles.addPhoto]} accessibilityLabel={t('Ajouter des photos')}>
                <Ionicons name="camera-outline" size={26} color={Colors.primary} />
              </Pressable>
            ) : null}
          </View>
        </>
      ) : null}

      <Pressable
        accessibilityRole="checkbox"
        accessibilityState={{ checked: values.accept_declaration }}
        onPress={() => set('accept_declaration')(!values.accept_declaration)}
        style={styles.declaration}>
        <Ionicons
          name={values.accept_declaration ? 'checkbox' : 'square-outline'}
          size={24}
          color={errors.accept_goods_declaration ? Colors.danger : Colors.primary}
        />
        <Text style={styles.declarationText}>
          {t('Je certifie que la marchandise est licite et conforme à la description, et que sa valeur déclarée est exacte.')}
        </Text>
      </Pressable>
      {errors.accept_goods_declaration ? <Text style={styles.error}>{errors.accept_goods_declaration}</Text> : null}

      <Text style={styles.notice}>
        {t("Ne mettez pas votre numéro de téléphone dans l'annonce : il sera partagé automatiquement avec le transporteur retenu.")}
      </Text>
      {formError ? <Banner tone="danger" message={formError} icon="alert-circle-outline" /> : null}
      <Button title={submitLabel} onPress={() => submit(true)} loading={submitting === 'publish'} disabled={!!submitting} />
      {allowDraft ? (
        <Button title={t('Enregistrer en brouillon')} variant="secondary" onPress={() => submit(false)} loading={submitting === 'draft'} disabled={!!submitting} />
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
  notice: { fontFamily: Fonts.regular, fontSize: 12, color: Colors.textSecondary },
  declaration: { flexDirection: 'row', gap: Spacing.sm, alignItems: 'flex-start' },
  declarationText: { fontFamily: Fonts.regular, flex: 1, fontSize: 14, color: Colors.text },
  error: { fontFamily: Fonts.regular, fontSize: 12, color: Colors.danger },
});
