import { router, useLocalSearchParams } from 'expo-router';
import { StyleSheet, Text, View } from 'react-native';

import { ShipmentStatusBadge } from '@/components/status-badge';
import { Card, textStyles } from '@/components/ui';
import { Colors, Fonts, FontSize, Spacing } from '@/constants/theme';
import { adminApi } from '@/features/staff/api';
import { AdminList, type Filter } from '@/features/staff/components';
import { formatDateTime, formatPrice } from '@/utils/format';

const FILTERS: Filter[] = [
  { label: 'Tous' },
  { label: 'À traiter', value: 'attention' },
  { label: 'En cours', value: 'confirmed,loaded,in_transit,delivered' },
  { label: 'Litiges', value: 'disputed' },
  { label: 'Livrés', value: 'completed' },
  { label: 'Annulés', value: 'cancelled' },
];

export default function Shipments() {
  const { status } = useLocalSearchParams<{ status?: string }>();
  const initial = Math.max(0, FILTERS.findIndex((f) => f.value === status));
  return (
    <AdminList
      queryKey="shipments"
      fetchPage={adminApi.shipments}
      filters={FILTERS}
      initialFilter={initial}
      searchPlaceholder="Titre, client, transporteur…"
      emptyTitle="Aucun transport"
      renderItem={(s) => (
        <Card onPress={() => router.push({ pathname: '/backoffice/shipment/[id]', params: { id: s.id } })}>
          <View style={styles.row}>
            <Text style={[styles.name, { flex: 1 }]}>
              {s.origin} → {s.destination}
            </Text>
            <ShipmentStatusBadge status={s.status} />
          </View>
          <Text style={textStyles.secondary}>{s.title}</Text>
          <Text style={textStyles.caption}>
            {s.client} → {s.driver} · {formatPrice(s.agreed_price, s.currency)} · {formatDateTime(s.confirmed_at)}
          </Text>
        </Card>
      )}
    />
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', gap: Spacing.sm },
  name: { fontFamily: Fonts.bold, fontSize: FontSize.body, color: Colors.text },
});
