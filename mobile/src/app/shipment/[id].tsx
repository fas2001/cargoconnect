import { Ionicons } from '@expo/vector-icons';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { Linking, Pressable, StyleSheet, Text, View } from 'react-native';

import { Route } from '@/components/cargo-card';
import { OptionPicker } from '@/components/option-picker';
import { ReasonDialog } from '@/components/reason-dialog';
import { ShipmentStatusBadge } from '@/components/status-badge';
import { Banner, Button, Card, ErrorState, InfoRow, Loading, Screen, SectionTitle, TextField, textStyles } from '@/components/ui';
import { Colors, FontSize, Spacing } from '@/constants/theme';
import { localName, t, tr } from '@/i18n';
import { reportReasons, shipmentActionLabel, shipmentStatusLabel } from '@/i18n/labels';
import { errorMessage } from '@/services/api';
import { api } from '@/services/endpoints';
import type { Contact, Shipment, ShipmentStatus } from '@/types/api';
import { confirmAction } from '@/utils/confirm';
import { formatDateTime, formatDay, formatPrice, formatWeight } from '@/utils/format';

const PROGRESS: ShipmentStatus[] = ['confirmed', 'loaded', 'in_transit', 'delivered', 'completed'];

export default function ShipmentScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const queryClient = useQueryClient();
  const query = useQuery({ queryKey: ['shipment', id], queryFn: () => api.shipment(id) });
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState<ShipmentStatus | null>(null);
  const [reasonFor, setReasonFor] = useState<ShipmentStatus | null>(null);

  if (query.isLoading) return <Loading />;
  if (query.error || !query.data) return <ErrorState message={errorMessage(query.error)} onRetry={() => query.refetch()} />;

  const shipment = query.data;
  const other: Contact = shipment.my_role === 'client' ? shipment.driver : shipment.client;
  const { cargo } = shipment;

  const transition = async (status: ShipmentStatus, note = '') => {
    setError(null);
    setBusy(status);
    try {
      const updated = await api.changeShipmentStatus(shipment.id, status, note);
      queryClient.setQueryData(['shipment', id], updated);
      await queryClient.invalidateQueries({ queryKey: ['shipments'] });
      setReasonFor(null);
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setBusy(null);
    }
  };

  const onAction = async (status: ShipmentStatus, noteRequired: boolean) => {
    if (noteRequired) {
      setReasonFor(status);
      return;
    }
    const ok = await confirmAction(shipmentActionLabel(status), t('Confirmez-vous cette étape ?'), t('Confirmer'));
    if (ok) await transition(status);
  };

  const mainActions = shipment.allowed_transitions.filter((a) => !a.note_required);
  const problemActions = shipment.allowed_transitions.filter((a) => a.note_required);

  return (
    <Screen edges={['bottom']} refreshing={query.isRefetching} onRefresh={() => query.refetch()}>
      <Card>
        <View style={styles.between}>
          <Route from={localName(cargo.origin_city)} to={localName(cargo.destination_city)} />
          <ShipmentStatusBadge status={shipment.status} />
        </View>
        <Text style={textStyles.title}>{cargo.title}</Text>
        <Text style={styles.price}>{formatPrice(shipment.agreed_price, shipment.currency)}</Text>
        <Text style={textStyles.caption}>{t('Tarif convenu — paiement à régler directement entre vous, hors application.')}</Text>
        <ProgressBar status={shipment.status} />
      </Card>

      {error ? <Banner tone="danger" message={error} icon="alert-circle-outline" /> : null}
      {shipment.status === 'delivered' && shipment.my_role === 'client' ? (
        <Banner tone="warning" message={t('Le transporteur a déclaré la livraison. Confirmez la réception, ou signalez un problème. Sans réponse sous 48 h, la livraison sera confirmée automatiquement.')} />
      ) : null}
      {shipment.status === 'disputed' ? (
        <Banner tone="danger" message={t("Un litige est ouvert. L'équipe CargoConnect vous contactera.")} />
      ) : null}

      {mainActions.map((a) => (
        <Button key={a.status} title={shipmentActionLabel(a.status) || tr(a.label)} loading={busy === a.status} onPress={() => onAction(a.status, false)} />
      ))}

      <SectionTitle>{shipment.my_role === 'client' ? t('Votre transporteur') : t('Votre client')}</SectionTitle>
      <Card>
        <Text style={styles.name}>{other.name}</Text>
        {other.company_name ? <Text style={textStyles.secondary}>{other.company_name}</Text> : null}
        <View style={styles.contactRow}>
          <ContactButton icon="call-outline" label={t('Appeler')} onPress={() => Linking.openURL(`tel:${other.phone}`)} />
          <ContactButton icon="logo-whatsapp" label="WhatsApp" onPress={() => Linking.openURL(`https://wa.me/${other.phone.replace('+', '')}`)} />
        </View>
        <Text style={textStyles.caption}>{other.phone}</Text>
      </Card>

      <SectionTitle>{t('Détails')}</SectionTitle>
      <Card>
        <InfoRow icon="calendar-outline" label={t('Chargement')} value={formatDay(cargo.loading_date)} />
        <InfoRow icon="location-outline" label={t('Adresse départ')} value={cargo.origin_address || localName(cargo.origin_city)} />
        <InfoRow icon="flag-outline" label={t('Adresse arrivée')} value={cargo.destination_address || localName(cargo.destination_city)} />
        <InfoRow icon="barbell-outline" label={t('Poids')} value={formatWeight(cargo.weight_kg)} />
        {shipment.vehicle ? (
          <InfoRow icon="bus-outline" label={t('Véhicule')} value={`${tr(shipment.vehicle.truck_type_label)} — ${shipment.vehicle.registration_number}`} />
        ) : null}
        {cargo.instructions ? <Text style={textStyles.secondary}>{t('Instructions : {text}', { text: cargo.instructions })}</Text> : null}
      </Card>

      <SectionTitle>{t('Historique')}</SectionTitle>
      <Card>
        {shipment.events.map((e, index) => (
          <View key={e.id} style={styles.event}>
            <View style={[styles.dot, index === shipment.events.length - 1 && styles.dotActive]} />
            <View style={{ flex: 1 }}>
              <Text style={styles.eventTitle}>{shipmentStatusLabel(e.to_status)}</Text>
              <Text style={textStyles.caption}>
                {formatDateTime(e.created_at)} · {e.actor_name}
              </Text>
              {e.note ? <Text style={textStyles.secondary}>{e.note}</Text> : null}
            </View>
          </View>
        ))}
      </Card>

      {shipment.can_review ? <ReviewForm shipment={shipment} /> : null}

      {problemActions.map((a) => (
        <Button key={a.status} title={shipmentActionLabel(a.status) || tr(a.label)} variant="danger" onPress={() => onAction(a.status, true)} />
      ))}
      <ReportLink shipment={shipment} />

      <ReasonDialog
        visible={reasonFor !== null}
        title={reasonFor ? shipmentActionLabel(reasonFor) : ''}
        label={t('Expliquez la situation')}
        confirmLabel={t('Confirmer')}
        required
        onCancel={() => setReasonFor(null)}
        onConfirm={(reason) => (reasonFor ? transition(reasonFor, reason) : undefined)}
      />
    </Screen>
  );
}

function ProgressBar({ status }: { status: ShipmentStatus }) {
  const index = PROGRESS.indexOf(status);
  if (index < 0) return null;
  return (
    <View style={styles.progress}>
      {PROGRESS.map((s, i) => (
        <View key={s} style={[styles.step, i <= index && styles.stepDone]} />
      ))}
    </View>
  );
}

function ContactButton({ icon, label, onPress }: { icon: 'call-outline' | 'logo-whatsapp'; label: string; onPress: () => void }) {
  return (
    <Pressable accessibilityRole="button" onPress={onPress} style={styles.contactButton}>
      <Ionicons name={icon} size={20} color={Colors.primary} />
      <Text style={styles.contactLabel}>{label}</Text>
    </Pressable>
  );
}

function ReviewForm({ shipment }: { shipment: Shipment }) {
  const queryClient = useQueryClient();
  const [rating, setRating] = useState(0);
  const [comment, setComment] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const submit = async () => {
    setError(null);
    setLoading(true);
    try {
      await api.reviewShipment(shipment.id, rating, comment);
      await queryClient.invalidateQueries({ queryKey: ['shipment', shipment.id] });
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setLoading(false);
    }
  };

  return (
    <Card>
      <Text style={styles.name}>{shipment.my_role === 'client' ? t('Notez le transporteur') : t('Notez le client')}</Text>
      <View style={styles.stars}>
        {[1, 2, 3, 4, 5].map((n) => (
          <Pressable key={n} onPress={() => setRating(n)} accessibilityLabel={t('{count} étoile(s)', { count: n })} hitSlop={6}>
            <Ionicons name={n <= rating ? 'star' : 'star-outline'} size={32} color={Colors.accent} />
          </Pressable>
        ))}
      </View>
      <TextField label={t('Commentaire (facultatif)')} multiline value={comment} onChangeText={setComment} maxLength={500} />
      {error ? <Banner tone="danger" message={error} /> : null}
      <Button title={t('Envoyer mon avis')} disabled={!rating} loading={loading} onPress={submit} />
    </Card>
  );
}

function ReportLink({ shipment }: { shipment: Shipment }) {
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState<string | null>(null);
  const [description, setDescription] = useState('');
  const [state, setState] = useState<'idle' | 'sending' | 'sent'>('idle');
  const [error, setError] = useState<string | null>(null);

  if (state === 'sent') return <Banner tone="success" message={t("Signalement envoyé. Notre équipe va l'examiner.")} />;
  if (!open) return <Button title={t('Signaler à CargoConnect')} variant="ghost" icon="flag-outline" onPress={() => setOpen(true)} />;

  const submit = async () => {
    setError(null);
    setState('sending');
    try {
      await api.report({ reason: reason!, description, shipment: shipment.id });
      setState('sent');
    } catch (e) {
      setError(errorMessage(e));
      setState('idle');
    }
  };

  return (
    <Card>
      <Text style={styles.name}>{t('Signaler un problème')}</Text>
      <OptionPicker label={t('Motif')} placeholder={t('Choisir')} options={reportReasons()} value={reason} onChange={setReason} />
      <TextField label={t('Description')} multiline value={description} onChangeText={setDescription} maxLength={2000} />
      {error ? <Banner tone="danger" message={error} /> : null}
      <Button title={t('Envoyer')} variant="danger" disabled={!reason || !description.trim()} loading={state === 'sending'} onPress={submit} />
      <Button title={t('Annuler')} variant="ghost" onPress={() => setOpen(false)} />
    </Card>
  );
}

const styles = StyleSheet.create({
  between: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: Spacing.sm },
  price: { fontSize: FontSize.title, fontWeight: '700', color: Colors.primary },
  name: { fontSize: FontSize.body, fontWeight: '700', color: Colors.text },
  progress: { flexDirection: 'row', gap: 4, marginTop: Spacing.xs },
  step: { flex: 1, height: 6, borderRadius: 3, backgroundColor: Colors.border },
  stepDone: { backgroundColor: Colors.primary },
  contactRow: { flexDirection: 'row', gap: Spacing.sm },
  contactButton: {
    flex: 1,
    flexDirection: 'row',
    gap: Spacing.sm,
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: Spacing.md,
    borderRadius: 10,
    backgroundColor: Colors.primarySoft,
  },
  contactLabel: { fontSize: FontSize.body, color: Colors.primary, fontWeight: '600' },
  event: { flexDirection: 'row', gap: Spacing.md, paddingVertical: Spacing.xs },
  dot: { width: 10, height: 10, borderRadius: 5, backgroundColor: Colors.border, marginTop: 6 },
  dotActive: { backgroundColor: Colors.primary },
  eventTitle: { fontSize: FontSize.small, fontWeight: '600', color: Colors.text },
  stars: { flexDirection: 'row', gap: Spacing.sm },
});
