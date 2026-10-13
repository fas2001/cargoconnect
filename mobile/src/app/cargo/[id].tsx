import { Ionicons } from '@expo/vector-icons';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Image } from 'expo-image';
import { router, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';

import { Route } from '@/components/cargo-card';
import { OptionPicker } from '@/components/option-picker';
import { ReasonDialog } from '@/components/reason-dialog';
import { CargoStatusBadge, OfferStatusBadge } from '@/components/status-badge';
import { Banner, Button, Card, ErrorState, InfoRow, Loading, Screen, SectionTitle, TextField, textStyles } from '@/components/ui';
import { Colors, FontSize, Radius, Spacing } from '@/constants/theme';
import { useAuth } from '@/features/auth/auth-context';
import { errorMessage } from '@/services/api';
import { api } from '@/services/endpoints';
import type { CargoDetail, ClientOffer, OwnOffer } from '@/types/api';
import { confirmAction } from '@/utils/confirm';
import { formatDay, formatPrice, formatWeight } from '@/utils/format';
import { localName, t, tr } from '@/i18n';

export default function CargoScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const query = useQuery({ queryKey: ['cargo', id], queryFn: () => api.cargo(id) });

  if (query.isLoading) return <Loading />;
  if (query.error || !query.data) return <ErrorState message={errorMessage(query.error)} onRetry={() => query.refetch()} />;

  const cargo = query.data;
  return (
    <Screen edges={['bottom']} refreshing={query.isRefetching} onRefresh={() => query.refetch()}>
      <CargoSummaryCard cargo={cargo} />
      {cargo.is_mine ? <OwnerSection cargo={cargo} /> : <DriverSection cargo={cargo} />}
    </Screen>
  );
}

function CargoSummaryCard({ cargo }: { cargo: CargoDetail }) {
  return (
    <>
      {cargo.photos.length ? (
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: Spacing.sm }}>
          {cargo.photos.map((p) => (
            <Image key={p.id} source={p.image} style={styles.photo} contentFit="cover" />
          ))}
        </ScrollView>
      ) : null}
      <Card>
        <View style={styles.between}>
          <Route from={localName(cargo.origin_city)} to={localName(cargo.destination_city)} />
          <CargoStatusBadge status={cargo.status} />
        </View>
        <Text style={textStyles.title}>{cargo.title}</Text>
        {cargo.agreed_price ? (
          <>
            <Text style={styles.price}>{t('{price} · prix convenu', { price: formatPrice(cargo.agreed_price, cargo.currency) })}</Text>
            {cargo.proposed_price && Number(cargo.proposed_price) !== Number(cargo.agreed_price) ? (
              <Text style={textStyles.secondary}>{t('Prix proposé au départ : {price}', { price: formatPrice(cargo.proposed_price, cargo.currency) })}</Text>
            ) : null}
          </>
        ) : (
          <Text style={styles.price}>{formatPrice(cargo.proposed_price, cargo.currency)}</Text>
        )}
        <InfoRow icon="calendar-outline" label={t('Chargement')} value={formatDay(cargo.loading_date)} />
        <InfoRow icon="barbell-outline" label={t('Poids')} value={formatWeight(cargo.weight_kg)} />
        {cargo.volume_m3 ? <InfoRow icon="cube-outline" label={t('Volume')} value={`${Number(cargo.volume_m3)} m³`} /> : null}
        <InfoRow icon="bus-outline" label={t('Camion')} value={tr(cargo.truck_type_label)} />
        <InfoRow icon="pricetag-outline" label={t('Catégorie')} value={localName(cargo.category)} />
        {cargo.origin_address ? <InfoRow icon="location-outline" label={t('Chargement à')} value={cargo.origin_address} /> : null}
        {cargo.destination_address ? <InfoRow icon="flag-outline" label={t('Livraison à')} value={cargo.destination_address} /> : null}
        {cargo.description ? <Text style={textStyles.body}>{cargo.description}</Text> : null}
        {cargo.instructions ? <Text style={textStyles.secondary}>{t('Instructions : {text}', { text: cargo.instructions })}</Text> : null}
        {!cargo.is_mine ? (
          <Text style={textStyles.caption}>
            {t('Publié par {name}', { name: cargo.client.name })}
            {cargo.client.rating.average ? ` · ★ ${cargo.client.rating.average} (${cargo.client.rating.count})` : ''}
          </Text>
        ) : null}
      </Card>
    </>
  );
}

// ---------------------------------------------------------------------------
// Vue du client (auteur de l'annonce)

function OwnerSection({ cargo }: { cargo: CargoDetail }) {
  const queryClient = useQueryClient();
  const offers = useQuery({
    queryKey: ['cargo', cargo.id, 'offers'],
    queryFn: () => api.cargoOffers<ClientOffer>(cargo.id),
    enabled: cargo.status !== 'draft',
  });
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [cancelOpen, setCancelOpen] = useState(false);

  const refreshAll = () => queryClient.invalidateQueries({ queryKey: ['cargo', cargo.id] }).then(() =>
    queryClient.invalidateQueries({ queryKey: ['cargos'] }),
  );

  const run = async (key: string, fn: () => Promise<unknown>) => {
    setError(null);
    setBusy(key);
    try {
      await fn();
      await refreshAll();
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setBusy(null);
    }
  };

  const accept = async (offer: ClientOffer) => {
    const ok = await confirmAction(
      t('Accepter cette proposition ?'),
      `${offer.driver.name} — ${formatPrice(offer.price, offer.currency)}.\n${t('Les autres propositions seront automatiquement clôturées et vos coordonnées seront partagées avec ce transporteur.')}`,
      t('Accepter'),
    );
    if (!ok) return;
    setError(null);
    setBusy(offer.id);
    try {
      const shipment = await api.acceptOffer(offer.id);
      await refreshAll();
      await queryClient.invalidateQueries({ queryKey: ['shipments'] });
      router.replace({ pathname: '/shipment/[id]', params: { id: shipment.id } });
    } catch (e) {
      setError(errorMessage(e));
      await refreshAll();
    } finally {
      setBusy(null);
    }
  };

  const pending = (offers.data ?? []).filter((o) => o.status === 'pending');

  return (
    <>
      {error ? <Banner tone="danger" message={error} icon="alert-circle-outline" /> : null}

      {cargo.status === 'draft' ? (
        <>
          <Banner message={t("Cette annonce est un brouillon : elle n'est pas visible par les transporteurs.")} />
          <Button title={t('Publier maintenant')} loading={busy === 'publish'} onPress={() => run('publish', () => api.publishCargo(cargo.id))} />
        </>
      ) : null}

      {cargo.shipment_id ? (
        <Button
          title={t('Voir le transport')}
          icon="navigate-outline"
          onPress={() => router.push({ pathname: '/shipment/[id]', params: { id: cargo.shipment_id! } })}
        />
      ) : null}

      {cargo.status === 'cancelled' && cargo.cancel_reason ? <Banner tone="danger" message={t('Annulée : {reason}', { reason: cargo.cancel_reason })} /> : null}
      {cargo.status === 'expired' ? <Banner tone="warning" message={t('Cette annonce a expiré sans être attribuée. Vous pouvez en publier une nouvelle.')} /> : null}

      {cargo.status === 'published' ? (
        <>
          <SectionTitle>{t('Propositions reçues ({count})', { count: pending.length })}</SectionTitle>
          {offers.isLoading ? <Loading /> : null}
          {offers.error ? <ErrorState message={errorMessage(offers.error)} onRetry={() => offers.refetch()} /> : null}
          {offers.data && pending.length === 0 ? (
            <Text style={textStyles.secondary}>
              {t("Aucune proposition pour l'instant. Vous recevrez une notification dès qu'un transporteur proposera un tarif.")}
            </Text>
          ) : null}
          {pending.map((offer) => (
            <OfferCard
              key={offer.id}
              offer={offer}
              busy={busy === offer.id || busy === `reject-${offer.id}`}
              onAccept={() => accept(offer)}
              onReject={() => run(`reject-${offer.id}`, () => api.rejectOffer(offer.id))}
            />
          ))}
        </>
      ) : null}

      {cargo.status === 'draft' || cargo.status === 'published' ? (
        <Button title={t("Annuler l'annonce")} variant="danger" onPress={() => setCancelOpen(true)} />
      ) : null}

      <ReasonDialog
        visible={cancelOpen}
        title={t("Annuler l'annonce")}
        label={t('Motif (facultatif)')}
        confirmLabel={t("Confirmer l'annulation")}
        onCancel={() => setCancelOpen(false)}
        onConfirm={async (reason) => {
          await run('cancel', () => api.cancelCargo(cargo.id, reason));
          setCancelOpen(false);
        }}
      />
    </>
  );
}

function OfferCard({ offer, busy, onAccept, onReject }: { offer: ClientOffer; busy: boolean; onAccept: () => void; onReject: () => void }) {
  const d = offer.driver;
  return (
    <Card>
      <View style={styles.between}>
        <Text style={styles.offerPrice}>{formatPrice(offer.price, offer.currency)}</Text>
        {d.is_verified ? (
          <View style={styles.verified}>
            <Ionicons name="shield-checkmark" size={14} color={Colors.success} />
            <Text style={styles.verifiedText}>{t('Vérifié')}</Text>
          </View>
        ) : null}
      </View>
      <Text style={styles.driverName}>
        {d.name}
        {d.company_name ? ` · ${d.company_name}` : ''}
      </Text>
      <Text style={textStyles.secondary}>
        {d.rating.average ? t('★ {average}/5 ({count} avis)', { average: d.rating.average, count: d.rating.count }) : t('Nouveau transporteur')} · {t('{count} transport(s) réalisé(s)', { count: d.completed_shipments })}
      </Text>
      {offer.vehicle ? (
        <Text style={textStyles.secondary}>
          {tr(offer.vehicle.truck_type_label)} · {t('{weight} de capacité', { weight: formatWeight(offer.vehicle.capacity_kg) })}
        </Text>
      ) : null}
      {offer.message ? <Text style={textStyles.body}>« {offer.message} »</Text> : null}
      <View style={styles.actions}>
        <Button title={t('Refuser')} variant="secondary" onPress={onReject} disabled={busy} style={{ flex: 1 }} />
        <Button title={t('Accepter')} onPress={onAccept} loading={busy} style={{ flex: 1 }} />
      </View>
    </Card>
  );
}

// ---------------------------------------------------------------------------
// Vue du chauffeur

function DriverSection({ cargo }: { cargo: CargoDetail }) {
  const auth = useAuth();
  const isDriver = auth.status === 'signedIn' && auth.user.roles.includes('driver');
  const offer = cargo.my_offer;

  if (cargo.shipment_id) {
    return (
      <>
        <Banner tone="success" icon="checkmark-circle-outline" message={t('Vous avez été retenu pour ce transport.')} />
        <Button title={t('Voir la mission')} onPress={() => router.push({ pathname: '/shipment/[id]', params: { id: cargo.shipment_id! } })} />
      </>
    );
  }
  if (!isDriver) {
    return <Banner message={t('Seuls les comptes transporteurs peuvent proposer un tarif.')} />;
  }
  if (offer && offer.status === 'pending') return <PendingOffer cargo={cargo} offer={offer} />;
  if (cargo.status !== 'published') {
    return <Banner tone="warning" message={t("Cette annonce n'accepte plus de propositions.")} />;
  }
  return (
    <>
      {offer ? (
        <View style={styles.between}>
          <Text style={textStyles.secondary}>{t('Votre dernière proposition : {price}', { price: formatPrice(offer.price, offer.currency) })}</Text>
          <OfferStatusBadge status={offer.status} />
        </View>
      ) : null}
      <OfferForm cargo={cargo} />
    </>
  );
}

function OfferForm({ cargo, existing, onDone }: { cargo: CargoDetail; existing?: OwnOffer; onDone?: () => void }) {
  const queryClient = useQueryClient();
  const profile = useQuery({ queryKey: ['driver-profile'], queryFn: api.driverProfile });
  const [price, setPrice] = useState(existing ? String(Number(existing.price)) : cargo.proposed_price ? String(Number(cargo.proposed_price)) : '');
  const [message, setMessage] = useState(existing?.message ?? '');
  const [vehicle, setVehicle] = useState<string | null>(existing?.vehicle?.id ?? null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const vehicles = (profile.data?.vehicles ?? []).filter((v) => v.is_active);
  const notVerified = profile.data && profile.data.verification_status !== 'verified';

  const submit = async () => {
    setError(null);
    setLoading(true);
    try {
      if (existing) await api.updateOffer(existing.id, { price, message });
      else await api.createOffer(cargo.id, { price, message, vehicle });
      await queryClient.invalidateQueries({ queryKey: ['cargo', cargo.id] });
      await queryClient.invalidateQueries({ queryKey: ['offers'] });
      onDone?.();
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setLoading(false);
    }
  };

  return (
    <Card>
      <Text style={styles.driverName}>{existing ? t('Modifier ma proposition') : t('Proposer mon tarif')}</Text>
      {notVerified && !existing ? (
        <Banner tone="warning" message={t('Votre profil doit être vérifié pour envoyer une proposition. Ajoutez vos justificatifs depuis votre profil.')} />
      ) : null}
      {error ? <Banner tone="danger" message={error} /> : null}
      <TextField label={t('Tarif (DH)')} keyboardType="number-pad" value={price} onChangeText={(text) => setPrice(text.replace(/[^\d]/g, ''))} />
      {!existing && vehicles.length ? (
        <OptionPicker
          label={t('Véhicule')}
          placeholder={t('Choisir un véhicule')}
          options={vehicles.map((v) => ({ value: v.id, label: `${tr(v.truck_type_label)} — ${v.registration_number}`, sublabel: formatWeight(v.capacity_kg) }))}
          value={vehicle}
          onChange={setVehicle}
        />
      ) : null}
      <TextField
        label={t('Commentaire (facultatif)')}
        placeholder={t('Disponibilité, conditions...')}
        multiline
        maxLength={500}
        value={message}
        onChangeText={setMessage}
        hint={t('Pas de numéro de téléphone : il sera partagé si votre offre est acceptée.')}
      />
      <Button title={existing ? t('Enregistrer') : t('Envoyer ma proposition')} loading={loading} disabled={!price || Number(price) <= 0} onPress={submit} />
      {onDone ? <Button title={t('Annuler')} variant="ghost" onPress={onDone} /> : null}
    </Card>
  );
}

function PendingOffer({ cargo, offer }: { cargo: CargoDetail; offer: OwnOffer }) {
  const queryClient = useQueryClient();
  const [editing, setEditing] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (editing) return <OfferForm cargo={cargo} existing={offer} onDone={() => setEditing(false)} />;

  const withdraw = async () => {
    if (!(await confirmAction(t('Retirer la proposition ?'), t('Le client ne la verra plus.'), t('Retirer')))) return;
    setLoading(true);
    setError(null);
    try {
      await api.withdrawOffer(offer.id);
      await queryClient.invalidateQueries({ queryKey: ['cargo', cargo.id] });
      await queryClient.invalidateQueries({ queryKey: ['offers'] });
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setLoading(false);
    }
  };

  return (
    <Card>
      <View style={styles.between}>
        <Text style={styles.driverName}>{t('Ma proposition')}</Text>
        <OfferStatusBadge status={offer.status} />
      </View>
      <Text style={styles.offerPrice}>{formatPrice(offer.price, offer.currency)}</Text>
      {offer.message ? <Text style={textStyles.secondary}>« {offer.message} »</Text> : null}
      <Text style={textStyles.caption}>{t('Le client a été notifié. Vous serez prévenu de sa décision.')}</Text>
      {error ? <Banner tone="danger" message={error} /> : null}
      <View style={styles.actions}>
        <Button title={t('Retirer')} variant="danger" onPress={withdraw} loading={loading} style={{ flex: 1 }} />
        <Button title={t('Modifier')} variant="secondary" onPress={() => setEditing(true)} style={{ flex: 1 }} />
      </View>
    </Card>
  );
}

const styles = StyleSheet.create({
  between: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: Spacing.sm },
  price: { fontSize: FontSize.title, fontWeight: '700', color: Colors.primary },
  photo: { width: 220, height: 150, borderRadius: Radius.md, backgroundColor: Colors.border },
  offerPrice: { fontSize: FontSize.title, fontWeight: '800', color: Colors.text },
  driverName: { fontSize: FontSize.body, fontWeight: '700', color: Colors.text },
  verified: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  verifiedText: { fontSize: FontSize.caption, color: Colors.success, fontWeight: '600' },
  actions: { flexDirection: 'row', gap: Spacing.sm, marginTop: Spacing.xs },
});
