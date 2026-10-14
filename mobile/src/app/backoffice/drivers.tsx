import { router, useLocalSearchParams } from 'expo-router';
import { StyleSheet, Text, View } from 'react-native';

import { Avatar } from '@/components/avatar';
import { Card, textStyles } from '@/components/ui';
import { Colors, Fonts, FontSize, Spacing } from '@/constants/theme';
import { adminApi } from '@/features/staff/api';
import { AdminList, type Filter, VerificationPill } from '@/features/staff/components';

const FILTERS: Filter[] = [
  { label: 'À vérifier', value: 'pending' },
  { label: 'Vérifiés', value: 'verified' },
  { label: 'Refusés', value: 'rejected' },
  { label: 'Tous' },
];

export default function Drivers() {
  const { status } = useLocalSearchParams<{ status?: string }>();
  const initial = Math.max(0, FILTERS.findIndex((f) => f.value === (status ?? 'pending')));
  return (
    <AdminList
      queryKey="drivers"
      fetchPage={adminApi.drivers}
      filters={FILTERS}
      initialFilter={initial}
      searchPlaceholder="Nom, téléphone, entreprise…"
      emptyTitle="Aucun transporteur"
      renderItem={(d) => (
        <Card onPress={() => router.push({ pathname: '/backoffice/driver/[id]', params: { id: d.id } })}>
          <View style={styles.row}>
            <Avatar uri={d.avatar} name={d.name} size={44} />
            <View style={{ flex: 1 }}>
              <Text style={styles.name}>{d.name}</Text>
              <Text style={textStyles.caption}>
                {d.phone}
                {d.company_name ? ` · ${d.company_name}` : ''}
              </Text>
            </View>
            <VerificationPill status={d.verification_status} />
          </View>
          <Text style={textStyles.secondary}>
            Justificatifs : {d.progress.verified}/{d.progress.total} validés
            {d.progress.pending ? ` · ${d.progress.pending} à vérifier` : ''}
          </Text>
        </Card>
      )}
    />
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', gap: Spacing.md },
  name: { fontFamily: Fonts.bold, fontSize: FontSize.body, color: Colors.text },
});
