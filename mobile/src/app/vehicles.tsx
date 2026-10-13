import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';

import { OptionPicker } from '@/components/option-picker';
import { Banner, Button, Card, EmptyState, ErrorState, Loading, Screen, SectionTitle, TextField, textStyles } from '@/components/ui';
import { Colors, FontSize } from '@/constants/theme';
import { useReferenceData } from '@/hooks/use-reference';
import { ApiError, errorMessage } from '@/services/api';
import { api } from '@/services/endpoints';
import type { TruckType } from '@/types/api';
import { confirmAction } from '@/utils/confirm';
import { formatWeight } from '@/utils/format';

export default function Vehicles() {
  const queryClient = useQueryClient();
  const ref = useReferenceData();
  const vehicles = useQuery({ queryKey: ['vehicles'], queryFn: api.vehicles });
  const [form, setForm] = useState<{ truck_type: TruckType | null; capacity_kg: string; registration_number: string; brand_model: string }>({
    truck_type: null,
    capacity_kg: '',
    registration_number: '',
    brand_model: '',
  });
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const refresh = async () => {
    await queryClient.invalidateQueries({ queryKey: ['vehicles'] });
    await queryClient.invalidateQueries({ queryKey: ['driver-profile'] });
  };

  const add = async () => {
    setError(null);
    setErrors({});
    setLoading(true);
    try {
      await api.addVehicle({
        truck_type: form.truck_type!,
        capacity_kg: form.capacity_kg,
        registration_number: form.registration_number.trim().toUpperCase(),
        brand_model: form.brand_model.trim(),
      });
      setForm({ truck_type: null, capacity_kg: '', registration_number: '', brand_model: '' });
      await refresh();
    } catch (e) {
      if (e instanceof ApiError && Object.keys(e.fieldErrors).length) setErrors(e.fieldErrors);
      else setError(errorMessage(e));
    } finally {
      setLoading(false);
    }
  };

  const remove = async (id: string) => {
    if (!(await confirmAction('Retirer ce véhicule ?', 'Il ne sera plus proposé dans vos offres.', 'Retirer'))) return;
    try {
      await api.removeVehicle(id);
      await refresh();
    } catch (e) {
      setError(errorMessage(e));
    }
  };

  if (vehicles.isLoading) return <Loading />;
  if (vehicles.error) return <ErrorState message={errorMessage(vehicles.error)} onRetry={() => vehicles.refetch()} />;
  const active = (vehicles.data?.results ?? []).filter((v) => v.is_active);

  return (
    <Screen edges={['bottom']}>
      {active.length === 0 ? <EmptyState icon="bus-outline" title="Aucun véhicule" message="Ajoutez votre camion pour proposer vos tarifs." /> : null}
      {active.map((v) => (
        <Card key={v.id}>
          <View style={styles.row}>
            <View style={{ flex: 1 }}>
              <Text style={styles.title}>{v.truck_type_label}</Text>
              <Text style={textStyles.secondary}>
                {v.registration_number} · {formatWeight(v.capacity_kg)}
                {v.brand_model ? ` · ${v.brand_model}` : ''}
              </Text>
            </View>
            <Button title="Retirer" variant="ghost" onPress={() => remove(v.id)} />
          </View>
        </Card>
      ))}

      <SectionTitle>Ajouter un véhicule</SectionTitle>
      {error ? <Banner tone="danger" message={error} /> : null}
      <OptionPicker label="Type de camion" placeholder="Choisir" options={ref.truckTypeOptions} value={form.truck_type} onChange={(v) => setForm((f) => ({ ...f, truck_type: v }))} error={errors.truck_type} />
      <TextField label="Capacité (kg)" keyboardType="number-pad" value={form.capacity_kg} onChangeText={(t) => setForm((f) => ({ ...f, capacity_kg: t.replace(/[^\d]/g, '') }))} error={errors.capacity_kg} />
      <TextField label="Immatriculation" placeholder="12345-A-6" autoCapitalize="characters" value={form.registration_number} onChangeText={(t) => setForm((f) => ({ ...f, registration_number: t }))} error={errors.registration_number} />
      <TextField label="Marque / modèle (facultatif)" value={form.brand_model} onChangeText={(t) => setForm((f) => ({ ...f, brand_model: t }))} />
      <Button title="Ajouter" loading={loading} disabled={!form.truck_type || !form.capacity_kg || !form.registration_number} onPress={add} />
    </Screen>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center' },
  title: { fontSize: FontSize.body, fontWeight: '700', color: Colors.text },
});
