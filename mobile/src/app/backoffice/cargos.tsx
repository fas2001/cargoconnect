import { router } from 'expo-router';
import { StyleSheet, Text, View } from 'react-native';

import { Badge, Card, textStyles } from '@/components/ui';
import { Colors, Fonts, FontSize, Spacing } from '@/constants/theme';
import { adminApi } from '@/features/staff/api';
import { AdminList, type Filter } from '@/features/staff/components';
import { formatDay, formatPrice, formatWeight } from '@/utils/format';

const FILTERS: Filter[] = [
  { label: 'Toutes' },
  { label: 'Publiées', value: 'published' },
  { label: 'Attribuées', value: 'assigned' },
  { label: 'Livrées', value: 'completed' },
  { label: 'Annulées', value: 'cancelled' },
  { label: 'Expirées', value: 'expired' },
  { label: 'Brouillons', value: 'draft' },
];

export default function Cargos() {
  return (
    <AdminList
      queryKey="cargos"
      fetchPage={adminApi.cargos}
      filters={FILTERS}
      searchPlaceholder="Titre, client, téléphone…"
      emptyTitle="Aucune annonce"
      renderItem={(c) => (
        <Card onPress={c.shipment_id ? () => router.push({ pathname: '/backoffice/shipment/[id]', params: { id: c.shipment_id! } }) : undefined}>
          <View style={styles.row}>
            <Text style={[styles.name, { flex: 1 }]}>
              {c.origin} → {c.destination}
            </Text>
            <Badge label={c.status_label} tone={c.status === 'published' ? 'info' : c.status === 'completed' ? 'success' : 'neutral'} />
          </View>
          <Text style={textStyles.secondary}>{c.title}</Text>
          <Text style={textStyles.caption}>
            {c.client} · {formatDay(c.loading_date)} · {formatWeight(c.weight_kg)} · {c.offers_count} offre(s)
          </Text>
          <Text style={textStyles.caption}>
            Prix proposé : {formatPrice(c.proposed_price)}
            {c.declared_value ? ` · valeur déclarée : ${formatPrice(c.declared_value)}` : ''}
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
