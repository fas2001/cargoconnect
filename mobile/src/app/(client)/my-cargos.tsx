import { useInfiniteQuery } from '@tanstack/react-query';
import { router } from 'expo-router';
import { useState } from 'react';
import { FlatList, ScrollView, StyleSheet } from 'react-native';

import { CargoCard } from '@/components/cargo-card';
import { Button, Chip, EmptyState, ErrorState, Loading } from '@/components/ui';
import { Colors, Spacing } from '@/constants/theme';
import { errorMessage } from '@/services/api';
import { api } from '@/services/endpoints';
import type { CargoStatus } from '@/types/api';
import { t, type TKey } from '@/i18n';
import { TruckLoader } from '@/components/truck-loader';

const FILTERS: { label: TKey; statuses?: CargoStatus[] }[] = [
  { label: 'Toutes' },
  { label: 'Ouvertes', statuses: ['published'] },
  { label: 'Brouillons', statuses: ['draft'] },
  { label: 'Attribuées', statuses: ['assigned'] },
  { label: 'Terminées', statuses: ['completed', 'cancelled', 'expired'] },
];

export default function MyCargos() {
  const [filter, setFilter] = useState(0);
  const statuses = FILTERS[filter].statuses;
  const query = useInfiniteQuery({
    queryKey: ['cargos', 'mine', statuses ?? 'all'],
    queryFn: ({ pageParam }) => api.myCargos(statuses, pageParam),
    initialPageParam: 1,
    getNextPageParam: (last, pages) => (last.next ? pages.length + 1 : undefined),
  });

  const items = query.data?.pages.flatMap((p) => p.results) ?? [];

  return (
    <FlatList
      style={{ backgroundColor: Colors.background }}
      contentContainerStyle={styles.list}
      data={items}
      keyExtractor={(c) => c.id}
      ListHeaderComponent={
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chips}>
          {FILTERS.map((f, i) => (
            <Chip key={f.label} label={t(f.label)} selected={i === filter} onPress={() => setFilter(i)} />
          ))}
        </ScrollView>
      }
      renderItem={({ item }) => (
        <CargoCard cargo={item} showStatus onPress={() => router.push({ pathname: '/cargo/[id]', params: { id: item.id } })} />
      )}
      ListEmptyComponent={
        query.isLoading ? (
          <Loading />
        ) : query.error ? (
          <ErrorState message={errorMessage(query.error)} onRetry={() => query.refetch()} />
        ) : (
          <EmptyState
            title={t('Aucune annonce')}
            action={<Button title={t('Publier une cargaison')} onPress={() => router.push('/publish')} />}
          />
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
  chips: { gap: Spacing.sm, paddingBottom: Spacing.xs },
});
