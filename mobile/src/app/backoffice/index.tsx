import { Ionicons } from '@expo/vector-icons';
import { useQuery } from '@tanstack/react-query';
import { type Href, router } from 'expo-router';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { Card, Chevron, ErrorState, type IconName, Loading, Screen, SectionTitle, textStyles } from '@/components/ui';
import { Colors, Fonts, FontSize, Radius, Shadow, Spacing } from '@/constants/theme';
import { adminApi } from '@/features/staff/api';
import { errorMessage } from '@/services/api';

/** Tableau de bord : ce qui attend une décision, puis l'activité de la plateforme. */
export default function BackofficeHome() {
  const query = useQuery({ queryKey: ['backoffice', 'dashboard'], queryFn: adminApi.dashboard });
  if (query.isLoading) return <Loading />;
  if (query.error || !query.data) return <ErrorState message={errorMessage(query.error)} onRetry={() => query.refetch()} />;
  const d = query.data;

  return (
    <Screen edges={['bottom']} refreshing={query.isRefetching} onRefresh={() => query.refetch()}>
      <SectionTitle>À traiter</SectionTitle>
      <View style={styles.grid}>
        <Tile value={d.drivers_pending} label="Transporteurs à vérifier" todo href={{ pathname: '/backoffice/drivers', params: { status: 'pending' } }} />
        <Tile value={d.identities_pending} label="Identités clients à vérifier" todo href={{ pathname: '/backoffice/identities', params: { status: 'pending' } }} />
        <Tile value={d.reports_open} label="Signalements ouverts" todo href="/backoffice/reports" />
        <Tile value={d.shipments_disputed} label="Transports en litige" todo href={{ pathname: '/backoffice/shipments', params: { status: 'disputed' } }} />
      </View>
      <Text style={textStyles.caption}>{d.documents_pending} justificatif(s) en attente de vérification au total.</Text>

      <SectionTitle>Activité</SectionTitle>
      <View style={styles.grid}>
        <Tile value={d.users_total} label={`Comptes (${d.clients_total} clients, ${d.drivers_total} transporteurs)`} href="/backoffice/users" />
        <Tile value={d.new_users_7d} label="Inscriptions sur 7 jours" href="/backoffice/users" />
        <Tile value={d.cargos_published} label="Annonces publiées" href="/backoffice/cargos" />
        <Tile value={d.shipments_active} label="Transports en cours" href="/backoffice/shipments" />
      </View>

      <SectionTitle>Tout voir</SectionTitle>
      <Card>
        <Row icon="people-outline" label="Comptes" href="/backoffice/users" />
        <Row icon="bus-outline" label="Transporteurs" href="/backoffice/drivers" />
        <Row icon="id-card-outline" label="Identités clients" href="/backoffice/identities" />
        <Row icon="cube-outline" label="Annonces" href="/backoffice/cargos" />
        <Row icon="navigate-outline" label="Transports" href="/backoffice/shipments" />
        <Row icon="flag-outline" label="Signalements" href="/backoffice/reports" />
      </Card>
    </Screen>
  );
}

function Tile({ value, label, href, todo }: { value: number; label: string; href: Href; todo?: boolean }) {
  return (
    <Pressable style={styles.tile} onPress={() => router.push(href)} accessibilityRole="button">
      <Text style={[styles.value, todo && value > 0 && { color: Colors.cta }]}>{value}</Text>
      <Text style={styles.label}>{label}</Text>
    </Pressable>
  );
}

function Row({ icon, label, href }: { icon: IconName; label: string; href: Href }) {
  return (
    <Pressable style={styles.row} onPress={() => router.push(href)} accessibilityRole="button">
      <Ionicons name={icon} size={20} color={Colors.primary} />
      <Text style={styles.rowLabel}>{label}</Text>
      <Chevron size={18} color={Colors.textMuted} />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.md },
  tile: { flexBasis: '47%', flexGrow: 1, backgroundColor: Colors.surface, borderRadius: Radius.lg, padding: Spacing.md, gap: 2, ...Shadow },
  value: { fontFamily: Fonts.bold, fontSize: 28, color: Colors.text },
  label: { fontFamily: Fonts.regular, fontSize: FontSize.small, color: Colors.textSecondary },
  row: { flexDirection: 'row', alignItems: 'center', gap: Spacing.md, minHeight: 44 },
  rowLabel: { fontFamily: Fonts.regular, flex: 1, fontSize: FontSize.body, color: Colors.text },
});
