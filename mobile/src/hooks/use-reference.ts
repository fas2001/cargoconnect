import { useQuery } from '@tanstack/react-query';

import type { PickerOption } from '@/components/option-picker';
import { isArabic, localName, tr } from '@/i18n';
import { api } from '@/services/endpoints';
import type { TruckType } from '@/types/api';

const DAY = 24 * 60 * 60 * 1000;

/** Référentiels (villes, catégories, types de camion) : mis en cache longtemps. */
export function useReferenceData() {
  const cities = useQuery({ queryKey: ['reference', 'cities'], queryFn: api.cities, staleTime: DAY });
  const categories = useQuery({ queryKey: ['reference', 'categories'], queryFn: api.categories, staleTime: DAY });
  const truckTypes = useQuery({ queryKey: ['reference', 'truck-types'], queryFn: api.truckTypes, staleTime: DAY });

  return {
    isLoading: cities.isLoading || categories.isLoading || truckTypes.isLoading,
    error: cities.error ?? categories.error ?? truckTypes.error,
    refetch: () => Promise.all([cities.refetch(), categories.refetch(), truckTypes.refetch()]),
    cityOptions: (cities.data ?? []).map<PickerOption<number>>((c) => ({
      value: c.id,
      label: localName(c),
      sublabel: isArabic() ? c.name_fr : c.name_ar,
    })),
    categoryOptions: (categories.data ?? []).map<PickerOption<number>>((c) => ({ value: c.id, label: localName(c) })),
    truckTypeOptions: (truckTypes.data ?? []).map<PickerOption<TruckType>>((type) => ({ value: type.value, label: tr(type.label) })),
  };
}
