import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';

import { EventProof } from '@/components/event-proof';
import { ReasonDialog } from '@/components/reason-dialog';
import { ShipmentStatusBadge } from '@/components/status-badge';
import { Banner, Button, Card, ErrorState, Loading, Screen, SectionTitle, textStyles } from '@/components/ui';
import { Colors, Fonts, FontSize, Spacing } from '@/constants/theme';
import { adminApi } from '@/features/staff/api';
import { Field } from '@/features/staff/components';
import { shipmentStatusLabel } from '@/i18n/labels';
import { errorMessage } from '@/services/api';
import { formatDateTime, formatPrice } from '@/utils/format';

/** Dossier complet d'un transport, preuves comprises : la référence en cas de litige ou de vol. */
export default function ShipmentFile() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const queryClient = useQueryClient();
  const query = useQuery({ queryKey: ['backoffice', 'shipment', id], queryFn: () => adminApi.shipment(id) });
  const [outcome, setOutcome] = useState<'completed' | 'cancelled' | null>(null);
  const [error, setError] = useState<string | null>(null);

  if (query.isLoading) return <Loading />;
  if (query.error || !query.data) return <ErrorState message={errorMessage(query.error)} onRetry={() => query.refetch()} />;
  const s = query.data;

  const resolve = async (note: string) => {
    if (!outcome) return;
    setError(null);
    try {
      const updated = await adminApi.resolveShipment(s.id, { status: outcome, note });
      queryClient.setQueryData(['backoffice', 'shipment', id], updated);
      await queryClient.invalidateQueries({ queryKey: ['backoffice'] });
      setOutcome(null);
    } catch (e) {
      setError(errorMessage(e));
      setOutcome(null);
    }
  };

  return (
    <Screen edges={['bottom']} refreshing={query.isRefetching} onRefresh={() => query.refetch()}>
      <Card>
        <View style={styles.row}>
          <Text style={[textStyles.title, { flex: 1 }]}>
            {s.origin} → {s.destination}
          </Text>
          <ShipmentStatusBadge status={s.status} />
        </View>
        <Text style={textStyles.secondary}>{s.title}</Text>
        <Field label="Tarif convenu" value={formatPrice(s.agreed_price, s.currency)} />
        <Field label="Valeur déclarée" value={s.declared_value ? formatPrice(s.declared_value, s.currency) : null} />
        <Field label="Confirmé le" value={formatDateTime(s.confirmed_at)} />
        {s.status === 'delivered' || s.status === 'completed' ? (
          <Field label="Code du destinataire" value={s.delivered_with_code ? 'Saisi par le chauffeur à la livraison' : 'Non saisi'} />
        ) : null}
      </Card>

      {error ? <Banner tone="danger" message={error} icon="alert-circle-outline" /> : null}
      {s.can_resolve ? (
        <>
          <SectionTitle>{"Décision de l'équipe"}</SectionTitle>
          <Text style={textStyles.secondary}>
            {
              "Litige, chauffeur absent, client qui ne répond pas : clôturez le transport après avoir contacté les deux parties. Le motif leur est envoyé et reste dans l'historique."
            }
          </Text>
          <View style={styles.row}>
            <Button title="Clôturer comme livré" variant="secondary" onPress={() => setOutcome('completed')} style={{ flex: 1 }} />
            <Button title="Annuler le transport" variant="danger" onPress={() => setOutcome('cancelled')} style={{ flex: 1 }} />
          </View>
        </>
      ) : null}
      <ReasonDialog
        visible={outcome !== null}
        title={outcome === 'completed' ? 'Clôturer comme livré' : 'Annuler le transport'}
        label="Motif (envoyé au client et au transporteur)"
        confirmLabel="Confirmer la décision"
        required
        onCancel={() => setOutcome(null)}
        onConfirm={resolve}
      />

      <SectionTitle>Parties</SectionTitle>
      <Card>
        <Field label="Client" value={`${s.client} · ${s.client_phone}`} />
        <Field label="Transporteur" value={`${s.driver} · ${s.driver_phone}`} />
        <Field label="Camion" value={s.vehicle ? `${s.vehicle.truck_type_label} — ${s.vehicle.registration_number}` : null} />
        <Field label="Destinataire" value={s.recipient_name ? `${s.recipient_name}${s.recipient_phone ? ` · ${s.recipient_phone}` : ''}` : null} />
      </Card>

      <SectionTitle>Adresses</SectionTitle>
      <Card>
        <Field label="Chargement" value={s.origin_address || s.origin} />
        <Field label="Livraison" value={s.destination_address || s.destination} />
      </Card>

      <SectionTitle>Historique et preuves</SectionTitle>
      <Card>
        {s.events.map((e) => (
          <View key={e.id} style={styles.event}>
            <Text style={styles.eventTitle}>{shipmentStatusLabel(e.to_status)}</Text>
            <Text style={textStyles.caption}>
              {formatDateTime(e.created_at)} · {e.actor_name}
            </Text>
            {e.note ? <Text style={textStyles.secondary}>{e.note}</Text> : null}
            <EventProof event={e} />
          </View>
        ))}
      </Card>
    </Screen>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', gap: Spacing.sm },
  event: { gap: 2, paddingVertical: Spacing.xs, borderBottomWidth: 1, borderBottomColor: Colors.border },
  eventTitle: { fontFamily: Fonts.semibold, fontSize: FontSize.body, color: Colors.text },
});
