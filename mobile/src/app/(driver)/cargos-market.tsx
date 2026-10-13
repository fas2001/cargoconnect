import { Ionicons } from '@expo/vector-icons';
import { useInfiniteQuery } from '@tanstack/react-query';
import { router } from 'expo-router';
import { useState } from 'react';
import { FlatList, Pressable, StyleSheet, Text, View } from 'react-native';

import { CargoCard } from '@/components/cargo-card';
import { OptionPicker } from '@/components/option-picker';
import { Button, Card, EmptyState, ErrorState, Loading } from '@/components/ui';
import { Colors, FontSize, Spacing } from '@/constants/theme';
import { useReferenceData } from '@/hooks/use-reference';
import { errorMessage } from '@/services/api';
import { api, type CargoFilters } from '@/services/endpoints';
import type { TruckType } from '@/types/api';
import { t } from '@/i18n';
import { TruckLoader } from '@/components/truck-loader';

export default function CargosMarket() {
  const ref = useReferenceData();
  const [filters, setFilters] = useState<{ origin?: number; destination?: number; truck?: TruckType; weightMax?: string }>({});
  const [showFilters, setShowFilters] = useState(false);

  const params: CargoFilters = {
    origin_city: filters.origin,
    destination_city: filters.destination,
    truck_type: filters.truck ? [filters.truck] : undefined,
    weight_max: filters.weightMax,
  };

  const query = useInfiniteQuery({
    queryKey: ['cargos', 'market', params],
    queryFn: ({ pageParam }) => api.marketplace({ ...params, page: pageParam }),
    initialPageParam: 1,
    getNextPageParam: (last, pages) => (last.next ? pages.length + 1 : undefined),
  });

  const items = query.data?.pages.flatMap((p) => p.results) ?? [];
  const activeCount = [filters.origin, filters.destination, filters.truck].filter(Boolean).length;

  return (
    <FlatList
      style={{ backgroundColor: Colors.background }}
      contentContainerStyle={styles.list}
      data={items}
      keyExtractor={(c) => c.id}
      ListHeaderComponent={
        <View style={{ gap: Spacing.sm }}>
          <Pressable style={styles.filterToggle} onPress={() => setShowFilters((s) => !s)} accessibilityRole="button">
            <Ionicons name="options-outline" size={20} color={Colors.primary} />
            <Text style={styles.filterText}>{activeCount ? t('Filtres ({count})', { count: activeCount }) : t('Filtres')}</Text>
            <Text style={styles.count}>{query.data ? t('{count} annonce(s)', { count: query.data.pages[0].count }) : ''}</Text>
          </Pressable>
          {showFilters ? (
            <Card>
              <OptionPicker label={t('Départ')} placeholder={t('Toutes les villes')} searchable allowClear options={ref.cityOptions} value={filters.origin} onChange={(v) => setFilters((f) => ({ ...f, origin: v ?? undefined }))} />
              <OptionPicker label={t('Destination')} placeholder={t('Toutes les villes')} searchable allowClear options={ref.cityOptions} value={filters.destination} onChange={(v) => setFilters((f) => ({ ...f, destination: v ?? undefined }))} />
              <OptionPicker label={t('Type de camion')} placeholder={t('Tous')} allowClear options={ref.truckTypeOptions} value={filters.truck} onChange={(v) => setFilters((f) => ({ ...f, truck: v ?? undefined }))} />
              {activeCount ? <Button title={t('Effacer les filtres')} variant="ghost" onPress={() => setFilters({})} /> : null}
            </Card>
          ) : null}
        </View>
      }
      renderItem={({ item }) => (
        <CargoCard cargo={item} onPress={() => router.push({ pathname: '/cargo/[id]', params: { id: item.id } })} />
      )}
      ListEmptyComponent={
        query.isLoading ? (
          <Loading />
        ) : query.error ? (
          <ErrorState message={errorMessage(query.error)} onRetry={() => query.refetch()} />
        ) : (
          <EmptyState icon="search-outline" title={t('Aucune cargaison')} message={t('Aucune annonce ne correspond à vos critères pour le moment.')} />
        )
      }
      refreshing={query.isRefetching}
      onRefresh={() => query.refetch()}
      onEndReached={() => query.hasNextPage && !query.isFetchingNextPage && query.fetchNextPage()}
      ListFooterComponent={query.isFetchingNextPage ? <TruckLoader size="small" label={false} /> : null}
    />
  );
}

const styles = StyleSheet.create({
  list: { padding: Spacing.lg, gap: Spacing.md, flexGrow: 1 },
  filterToggle: { flexDirection: 'row', alignItems: 'center', gap: Spacing.sm, paddingVertical: Spacing.xs },
  filterText: { fontSize: FontSize.body, fontWeight: '600', color: Colors.primary },
  count: { flex: 1, textAlign: 'right', fontSize: FontSize.small, color: Colors.textSecondary },
});
