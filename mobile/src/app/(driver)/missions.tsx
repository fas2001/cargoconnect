import { useInfiniteQuery } from '@tanstack/react-query';
import { useState } from 'react';
import { ActivityIndicator, FlatList, ScrollView, StyleSheet } from 'react-native';

import { ShipmentCard } from '@/components/shipment-card';
import { Chip, EmptyState, ErrorState, Loading } from '@/components/ui';
import { Colors, Spacing } from '@/constants/theme';
import { errorMessage } from '@/services/api';
import { api } from '@/services/endpoints';

const SCOPES = [
  { label: 'En cours', scope: 'active' as const },
  { label: 'Historique', scope: 'past' as const },
];

export default function Missions() {
  const [index, setIndex] = useState(0);
  const scope = SCOPES[index].scope;
  const query = useInfiniteQuery({
    queryKey: ['shipments', 'driver', scope],
    queryFn: ({ pageParam }) => api.shipments('driver', scope, pageParam),
    initialPageParam: 1,
    getNextPageParam: (last, pages) => (last.next ? pages.length + 1 : undefined),
  });
  const items = query.data?.pages.flatMap((p) => p.results) ?? [];

  return (
    <FlatList
      style={{ backgroundColor: Colors.background }}
      contentContainerStyle={styles.list}
      data={items}
      keyExtractor={(s) => s.id}
      ListHeaderComponent={
        <ScrollView horizontal contentContainerStyle={styles.chips}>
          {SCOPES.map((s, i) => (
            <Chip key={s.label} label={s.label} selected={i === index} onPress={() => setIndex(i)} />
          ))}
        </ScrollView>
      }
      renderItem={({ item }) => <ShipmentCard shipment={item} />}
      ListEmptyComponent={
        query.isLoading ? (
          <Loading />
        ) : query.error ? (
          <ErrorState message={errorMessage(query.error)} onRetry={() => query.refetch()} />
        ) : (
          <EmptyState icon="navigate-outline" title="Aucune mission" message="Vos transports confirmés apparaîtront ici." />
        )
      }
      refreshing={query.isRefetching}
      onRefresh={() => query.refetch()}
      onEndReached={() => query.hasNextPage && !query.isFetchingNextPage && query.fetchNextPage()}
      ListFooterComponent={query.isFetchingNextPage ? <ActivityIndicator /> : null}
    />
  );
}

const styles = StyleSheet.create({
  list: { padding: Spacing.lg, gap: Spacing.md, flexGrow: 1 },
  chips: { gap: Spacing.sm, paddingBottom: Spacing.xs },
});
