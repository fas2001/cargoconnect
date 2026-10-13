import { useInfiniteQuery, useQueryClient } from '@tanstack/react-query';
import { router, Stack } from 'expo-router';
import { ActivityIndicator, FlatList, StyleSheet, Text, View } from 'react-native';

import { Button, Card, EmptyState, ErrorState, Loading, textStyles } from '@/components/ui';
import { Colors, FontSize, Spacing } from '@/constants/theme';
import { errorMessage } from '@/services/api';
import { api } from '@/services/endpoints';
import type { AppNotification } from '@/types/api';
import { formatDateTime } from '@/utils/format';

export default function Notifications() {
  const queryClient = useQueryClient();
  const query = useInfiniteQuery({
    queryKey: ['notifications', 'list'],
    queryFn: ({ pageParam }) => api.notifications(pageParam),
    initialPageParam: 1,
    getNextPageParam: (last, pages) => (last.next ? pages.length + 1 : undefined),
  });
  const items = query.data?.pages.flatMap((p) => p.results) ?? [];

  const refresh = () => queryClient.invalidateQueries({ queryKey: ['notifications'] });

  const open = async (n: AppNotification) => {
    if (!n.is_read) api.markRead(n.id).then(refresh).catch(() => undefined);
    if (n.data.shipment_id) router.push({ pathname: '/shipment/[id]', params: { id: n.data.shipment_id } });
    else if (n.data.cargo_id) router.push({ pathname: '/cargo/[id]', params: { id: n.data.cargo_id } });
  };

  return (
    <>
      <Stack.Screen
        options={{
          headerRight: () =>
            items.some((n) => !n.is_read) ? (
              <Button title="Tout lire" variant="ghost" onPress={() => api.markAllRead().then(refresh)} />
            ) : null,
        }}
      />
      <FlatList
        style={{ backgroundColor: Colors.background }}
        contentContainerStyle={styles.list}
        data={items}
        keyExtractor={(n) => n.id}
        renderItem={({ item }) => (
          <Card onPress={() => open(item)} style={!item.is_read ? styles.unread : undefined}>
            <View style={styles.row}>
              {!item.is_read ? <View style={styles.dot} /> : null}
              <Text style={styles.title}>{item.title}</Text>
            </View>
            <Text style={textStyles.secondary}>{item.body}</Text>
            <Text style={textStyles.caption}>{formatDateTime(item.created_at)}</Text>
          </Card>
        )}
        ListEmptyComponent={
          query.isLoading ? (
            <Loading />
          ) : query.error ? (
            <ErrorState message={errorMessage(query.error)} onRetry={() => query.refetch()} />
          ) : (
            <EmptyState icon="notifications-outline" title="Aucune notification" />
          )
        }
        refreshing={query.isRefetching}
        onRefresh={() => query.refetch()}
        onEndReached={() => query.hasNextPage && !query.isFetchingNextPage && query.fetchNextPage()}
        ListFooterComponent={query.isFetchingNextPage ? <ActivityIndicator /> : null}
      />
    </>
  );
}

const styles = StyleSheet.create({
  list: { padding: Spacing.lg, gap: Spacing.md, flexGrow: 1 },
  unread: { borderColor: Colors.primary, borderWidth: 1 },
  row: { flexDirection: 'row', alignItems: 'center', gap: Spacing.sm },
  dot: { width: 8, height: 8, borderRadius: 4, backgroundColor: Colors.primary },
  title: { flex: 1, fontSize: FontSize.body, fontWeight: '700', color: Colors.text },
});
