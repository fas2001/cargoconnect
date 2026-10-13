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
import { fr } from '@/i18n/fr';
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
    const ok = await confirmAction(fr.shipmentAction[status], 'Confirmez-vous cette étape ?', 'Confirmer');
    if (ok) await transition(status);
  };

  const mainActions = shipment.allowed_transitions.filter((t) => !t.note_required);
  const problemActions = shipment.allowed_transitions.filter((t) => t.note_required);

  return (
    <Screen edges={['bottom']} refreshing={query.isRefetching} onRefresh={() => query.refetch()}>
      <Card>
        <View style={styles.between}>
          <Route from={cargo.origin_city.name_fr} to={cargo.destination_city.name_fr} />
          <ShipmentStatusBadge status={shipment.status} />
        </View>
        <Text style={textStyles.title}>{cargo.title}</Text>
        <Text style={styles.price}>{formatPrice(shipment.agreed_price, shipment.currency)}</Text>
        <Text style={textStyles.caption}>Tarif convenu — paiement à régler directement entre vous, hors application.</Text>
        <ProgressBar status={shipment.status} />
      </Card>

      {error ? <Banner tone="danger" message={error} icon="alert-circle-outline" /> : null}
      {shipment.status === 'delivered' && shipment.my_role === 'client' ? (
        <Banner tone="warning" message="Le transporteur a déclaré la livraison. Confirmez la réception, ou signalez un problème. Sans réponse sous 48 h, la livraison sera confirmée automatiquement." />
      ) : null}
      {shipment.status === 'disputed' ? (
        <Banner tone="danger" message="Un litige est ouvert. L'équipe CargoConnect vous contactera." />
      ) : null}

      {mainActions.map((t) => (
        <Button key={t.status} title={fr.shipmentAction[t.status] || t.label} loading={busy === t.status} onPress={() => onAction(t.status, false)} />
      ))}

      <SectionTitle>{shipment.my_role === 'client' ? 'Votre transporteur' : 'Votre client'}</SectionTitle>
      <Card>
        <Text style={styles.name}>{other.name}</Text>
        {other.company_name ? <Text style={textStyles.secondary}>{other.company_name}</Text> : null}
        <View style={styles.contactRow}>
          <ContactButton icon="call-outline" label="Appeler" onPress={() => Linking.openURL(`tel:${other.phone}`)} />
          <ContactButton icon="logo-whatsapp" label="WhatsApp" onPress={() => Linking.openURL(`https://wa.me/${other.phone.replace('+', '')}`)} />
        </View>
        <Text style={textStyles.caption}>{other.phone}</Text>
      </Card>

      <SectionTitle>Détails</SectionTitle>
      <Card>
        <InfoRow icon="calendar-outline" label="Chargement" value={formatDay(cargo.loading_date)} />
        <InfoRow icon="location-outline" label="Adresse départ" value={cargo.origin_address || cargo.origin_city.name_fr} />
        <InfoRow icon="flag-outline" label="Adresse arrivée" value={cargo.destination_address || cargo.destination_city.name_fr} />
        <InfoRow icon="barbell-outline" label="Poids" value={formatWeight(cargo.weight_kg)} />
        {shipment.vehicle ? (
          <InfoRow icon="bus-outline" label="Véhicule" value={`${shipment.vehicle.truck_type_label} — ${shipment.vehicle.registration_number}`} />
        ) : null}
        {cargo.instructions ? <Text style={textStyles.secondary}>Instructions : {cargo.instructions}</Text> : null}
      </Card>

      <SectionTitle>Historique</SectionTitle>
      <Card>
        {shipment.events.map((e, index) => (
          <View key={e.id} style={styles.event}>
            <View style={[styles.dot, index === shipment.events.length - 1 && styles.dotActive]} />
            <View style={{ flex: 1 }}>
              <Text style={styles.eventTitle}>{fr.shipmentStatus[e.to_status]}</Text>
              <Text style={textStyles.caption}>
                {formatDateTime(e.created_at)} · {e.actor_name}
              </Text>
              {e.note ? <Text style={textStyles.secondary}>{e.note}</Text> : null}
            </View>
          </View>
        ))}
      </Card>

      {shipment.can_review ? <ReviewForm shipment={shipment} /> : null}

      {problemActions.map((t) => (
        <Button key={t.status} title={fr.shipmentAction[t.status] || t.label} variant="danger" onPress={() => onAction(t.status, true)} />
      ))}
      <ReportLink shipment={shipment} />

      <ReasonDialog
        visible={reasonFor !== null}
        title={reasonFor ? fr.shipmentAction[reasonFor] : ''}
        label="Expliquez la situation"
        confirmLabel="Confirmer"
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
      <Text style={styles.name}>Notez {shipment.my_role === 'client' ? 'le transporteur' : 'le client'}</Text>
      <View style={styles.stars}>
        {[1, 2, 3, 4, 5].map((n) => (
          <Pressable key={n} onPress={() => setRating(n)} accessibilityLabel={`${n} étoile${n > 1 ? 's' : ''}`} hitSlop={6}>
            <Ionicons name={n <= rating ? 'star' : 'star-outline'} size={32} color={Colors.accent} />
          </Pressable>
        ))}
      </View>
      <TextField label="Commentaire (facultatif)" multiline value={comment} onChangeText={setComment} maxLength={500} />
      {error ? <Banner tone="danger" message={error} /> : null}
      <Button title="Envoyer mon avis" disabled={!rating} loading={loading} onPress={submit} />
    </Card>
  );
}

function ReportLink({ shipment }: { shipment: Shipment }) {
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState<string | null>(null);
  const [description, setDescription] = useState('');
  const [state, setState] = useState<'idle' | 'sending' | 'sent'>('idle');
  const [error, setError] = useState<string | null>(null);

  if (state === 'sent') return <Banner tone="success" message="Signalement envoyé. Notre équipe va l'examiner." />;
  if (!open) return <Button title="Signaler à CargoConnect" variant="ghost" icon="flag-outline" onPress={() => setOpen(true)} />;

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
      <Text style={styles.name}>Signaler un problème</Text>
      <OptionPicker label="Motif" placeholder="Choisir" options={fr.reportReasons} value={reason} onChange={setReason} />
      <TextField label="Description" multiline value={description} onChangeText={setDescription} maxLength={2000} />
      {error ? <Banner tone="danger" message={error} /> : null}
      <Button title="Envoyer" variant="danger" disabled={!reason || !description.trim()} loading={state === 'sending'} onPress={submit} />
      <Button title="Annuler" variant="ghost" onPress={() => setOpen(false)} />
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
