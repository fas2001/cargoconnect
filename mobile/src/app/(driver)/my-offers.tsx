import { useInfiniteQuery } from '@tanstack/react-query';
import { router } from 'expo-router';
import { useState } from 'react';
import { FlatList, ScrollView, StyleSheet, Text, View } from 'react-native';

import { Route } from '@/components/cargo-card';
import { OfferStatusBadge } from '@/components/status-badge';
import { Card, Chip, EmptyState, ErrorState, Loading, textStyles } from '@/components/ui';
import { Colors, FontSize, Spacing } from '@/constants/theme';
import { errorMessage } from '@/services/api';
import { api } from '@/services/endpoints';
import { formatDay, formatPrice } from '@/utils/format';
import { t, type TKey } from '@/i18n';
import { TruckLoader } from '@/components/truck-loader';

const FILTERS = [
  { label: 'En attente', status: 'pending' },
  { label: 'Acceptées', status: 'accepted' },
  { label: 'Historique', status: 'rejected,withdrawn,closed' },
] as const satisfies readonly { label: TKey; status: string }[];

export default function MyOffers() {
  const [filter, setFilter] = useState(0);
  const status = FILTERS[filter].status;
  const query = useInfiniteQuery({
    queryKey: ['offers', 'mine', status],
    queryFn: ({ pageParam }) => api.myOffers(status, pageParam),
    initialPageParam: 1,
    getNextPageParam: (last, pages) => (last.next ? pages.length + 1 : undefined),
  });
  const items = query.data?.pages.flatMap((p) => p.results) ?? [];

  return (
    <FlatList
      style={{ backgroundColor: Colors.background }}
      contentContainerStyle={styles.list}
      data={items}
      keyExtractor={(o) => o.id}
      ListHeaderComponent={
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chips}>
          {FILTERS.map((f, i) => (
            <Chip key={f.label} label={t(f.label)} selected={i === filter} onPress={() => setFilter(i)} />
          ))}
        </ScrollView>
      }
      renderItem={({ item }) => (
        <Card
          onPress={() =>
            item.shipment_id
              ? router.push({ pathname: '/shipment/[id]', params: { id: item.shipment_id } })
              : router.push({ pathname: '/cargo/[id]', params: { id: item.cargo.id } })
          }>
          <View style={styles.row}>
            <Route from={item.cargo.origin_city.name_fr} to={item.cargo.destination_city.name_fr} />
            <OfferStatusBadge status={item.status} />
          </View>
          <Text style={textStyles.secondary} numberOfLines={1}>
            {item.cargo.title} · {formatDay(item.cargo.loading_date)}
          </Text>
          <Text style={styles.price}>Mon offre : {formatPrice(item.price, item.currency)}</Text>
        </Card>
      )}
      ListEmptyComponent={
        query.isLoading ? (
          <Loading />
        ) : query.error ? (
          <ErrorState message={errorMessage(query.error)} onRetry={() => query.refetch()} />
        ) : (
          <EmptyState icon="pricetags-outline" title={t('Aucune proposition')} message={t('Parcourez les cargaisons disponibles et proposez votre tarif.')} />
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
  row: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: Spacing.sm },
  price: { fontSize: FontSize.body, fontWeight: '700', color: Colors.primary },
});
