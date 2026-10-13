import { router } from 'expo-router';
import { StyleSheet, Text, View } from 'react-native';

import { Colors, FontSize } from '@/constants/theme';
import type { ShipmentSummary } from '@/types/api';
import { formatDay, formatPrice } from '@/utils/format';
import { localName, t } from '@/i18n';

import { Route } from './cargo-card';
import { ShipmentStatusBadge } from './status-badge';
import { Card } from './ui';

export function ShipmentCard({ shipment }: { shipment: ShipmentSummary }) {
  const { cargo } = shipment;
  return (
    <Card onPress={() => router.push({ pathname: '/shipment/[id]', params: { id: shipment.id } })}>
      <View style={styles.row}>
        <Route from={localName(cargo.origin_city)} to={localName(cargo.destination_city)} />
        <ShipmentStatusBadge status={shipment.status} />
      </View>
      <Text style={styles.title} numberOfLines={1}>
        {cargo.title}
      </Text>
      <View style={styles.row}>
        <Text style={styles.meta}>{t('Chargement : {date}', { date: formatDay(cargo.loading_date) })}</Text>
        <Text style={styles.price}>{formatPrice(shipment.agreed_price, shipment.currency)}</Text>
      </View>
    </Card>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8 },
  title: { fontSize: FontSize.small, color: Colors.textSecondary },
  meta: { fontSize: FontSize.caption, color: Colors.textSecondary },
  price: { fontSize: FontSize.body, fontWeight: '700', color: Colors.primary },
});
