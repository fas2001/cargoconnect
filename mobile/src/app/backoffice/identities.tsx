import { router, useLocalSearchParams } from 'expo-router';
import { StyleSheet, Text, View } from 'react-native';

import { Avatar } from '@/components/avatar';
import { Card, textStyles } from '@/components/ui';
import { Colors, Fonts, FontSize, Spacing } from '@/constants/theme';
import { adminApi } from '@/features/staff/api';
import { AdminList, type Filter, VerificationPill } from '@/features/staff/components';

const FILTERS: Filter[] = [
  { label: 'À vérifier', value: 'pending' },
  { label: 'Vérifiées', value: 'verified' },
  { label: 'Refusées', value: 'rejected' },
  { label: 'Toutes' },
];

export default function Identities() {
  const { status } = useLocalSearchParams<{ status?: string }>();
  const initial = Math.max(0, FILTERS.findIndex((f) => f.value === (status ?? 'pending')));
  return (
    <AdminList
      queryKey="identities"
      fetchPage={adminApi.identities}
      filters={FILTERS}
      initialFilter={initial}
      searchPlaceholder="Nom, téléphone, CIN, ICE…"
      emptyTitle="Aucune identité"
      renderItem={(i) => (
        <Card onPress={() => router.push({ pathname: '/backoffice/identity/[id]', params: { id: i.id } })}>
          <View style={styles.row}>
            <Avatar uri={i.avatar} name={i.name} size={44} />
            <View style={{ flex: 1 }}>
              <Text style={styles.name}>{i.account_type === 'company' ? i.company_name : i.name}</Text>
              <Text style={textStyles.caption}>
                {i.account_type === 'company' ? `Entreprise · ICE ${i.ice}` : `Particulier · CIN ${i.cin_number}`} · {i.phone}
              </Text>
            </View>
            <VerificationPill status={i.status} />
          </View>
        </Card>
      )}
    />
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', gap: Spacing.md },
  name: { fontFamily: Fonts.bold, fontSize: FontSize.body, color: Colors.text },
});
