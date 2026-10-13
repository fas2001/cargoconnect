import { Ionicons } from '@expo/vector-icons';
import { Image } from 'expo-image';
import { I18nManager, StyleSheet, Text, View } from 'react-native';

import { Colors, FontSize, Radius, Spacing } from '@/constants/theme';
import type { CargoSummary } from '@/types/api';
import { formatDay, formatPrice, formatWeight } from '@/utils/format';
import { localName, t, tr } from '@/i18n';

import { CargoStatusBadge } from './status-badge';
import { Card } from './ui';

export function Route({ from, to }: { from: string; to: string }) {
  return (
    <View style={styles.route}>
      <Text style={styles.city} numberOfLines={1}>
        {from}
      </Text>
      <Ionicons name={I18nManager.isRTL ? 'arrow-back' : 'arrow-forward'} size={16} color={Colors.accent} />
      <Text style={styles.city} numberOfLines={1}>
        {to}
      </Text>
    </View>
  );
}

export function CargoCard({ cargo, onPress, showStatus }: { cargo: CargoSummary; onPress: () => void; showStatus?: boolean }) {
  return (
    <Card onPress={onPress}>
      <View style={styles.top}>
        <View style={{ flex: 1, gap: 4 }}>
          <Route from={localName(cargo.origin_city)} to={localName(cargo.destination_city)} />
          <Text style={styles.title} numberOfLines={1}>
            {cargo.title}
          </Text>
        </View>
        {cargo.thumbnail ? <Image source={cargo.thumbnail} style={styles.thumb} contentFit="cover" /> : null}
      </View>
      <View style={styles.meta}>
        <Meta icon="calendar-outline" text={formatDay(cargo.loading_date)} />
        <Meta icon="barbell-outline" text={formatWeight(cargo.weight_kg)} />
        <Meta icon="bus-outline" text={tr(cargo.truck_type_label)} />
      </View>
      <View style={styles.bottom}>
        <Text style={styles.price}>{formatPrice(cargo.agreed_price ?? cargo.proposed_price, cargo.currency)}</Text>
        {showStatus ? (
          <CargoStatusBadge status={cargo.status} />
        ) : (
          <Text style={styles.offers}>
            {t('{count} offre(s)', { count: cargo.offers_count })}
          </Text>
        )}
      </View>
      {showStatus && cargo.status === 'published' ? (
        <Text style={styles.offers}>
          {t('{count} proposition(s) en attente', { count: cargo.offers_count })}
        </Text>
      ) : null}
    </Card>
  );
}

function Meta({ icon, text }: { icon: React.ComponentProps<typeof Ionicons>['name']; text: string }) {
  return (
    <View style={styles.metaItem}>
      <Ionicons name={icon} size={14} color={Colors.textSecondary} />
      <Text style={styles.metaText}>{text}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  top: { flexDirection: 'row', gap: Spacing.md },
  route: { flexDirection: 'row', alignItems: 'center', gap: Spacing.xs, flexShrink: 1 },
  city: { fontSize: FontSize.body, fontWeight: '700', color: Colors.text, flexShrink: 1 },
  title: { fontSize: FontSize.small, color: Colors.textSecondary },
  thumb: { width: 56, height: 56, borderRadius: Radius.sm, backgroundColor: Colors.background },
  meta: { flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.md },
  metaItem: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  metaText: { fontSize: FontSize.caption, color: Colors.textSecondary },
  bottom: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  price: { fontSize: FontSize.body, fontWeight: '700', color: Colors.primary },
  offers: { fontSize: FontSize.caption, color: Colors.textSecondary },
});
