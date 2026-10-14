import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useLocalSearchParams } from 'expo-router';
import { StyleSheet, Text, View } from 'react-native';

import { Avatar } from '@/components/avatar';
import { Banner, Card, ErrorState, Loading, Screen, SectionTitle, textStyles } from '@/components/ui';
import { Colors, Fonts, FontSize, Spacing } from '@/constants/theme';
import { type AdminDriverDocument, adminApi } from '@/features/staff/api';
import { DecisionButtons, Field, PrivateImage, VerificationPill } from '@/features/staff/components';
import { errorMessage } from '@/services/api';
import { formatDateTime, formatDay, formatWeight } from '@/utils/format';

const SIDE: Record<string, string> = { recto: 'recto', verso: 'verso', unique: '' };

export default function DriverReview() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const queryClient = useQueryClient();
  const query = useQuery({ queryKey: ['backoffice', 'driver', id], queryFn: () => adminApi.driver(id) });

  if (query.isLoading) return <Loading />;
  if (query.error || !query.data) return <ErrorState message={errorMessage(query.error)} onRetry={() => query.refetch()} />;
  const d = query.data;

  const refresh = async () => {
    await queryClient.invalidateQueries({ queryKey: ['backoffice'] });
  };

  const missing = d.checklist.filter((i) => i.state === 'missing');

  return (
    <Screen edges={['bottom']} refreshing={query.isRefetching} onRefresh={() => query.refetch()}>
      <Card>
        <View style={styles.row}>
          <Avatar uri={d.avatar} name={d.name} size={56} />
          <View style={{ flex: 1 }}>
            <Text style={textStyles.title}>{d.name}</Text>
            <Text style={textStyles.secondary}>{d.company_name || 'Transporteur indépendant'}</Text>
          </View>
          <VerificationPill status={d.verification_status} />
        </View>
        <Field label="Téléphone" value={`${d.phone}${d.phone_verified ? ' (vérifié)' : ' (non vérifié)'}`} />
        <Field label="E-mail" value={d.email} />
        <Field label="Inscrit le" value={formatDateTime(d.created_at)} />
        {!d.is_active ? <Banner tone="danger" message="Compte suspendu." /> : null}
        {d.rejection_reason ? <Banner tone="danger" message={`Dernier refus : ${d.rejection_reason}`} /> : null}
      </Card>

      <SectionTitle>Justificatifs exigés</SectionTitle>
      <Card>
        <Text style={textStyles.secondary}>
          {d.progress.verified}/{d.progress.total} validés · {d.progress.pending} à vérifier · {missing.length} manquant(s)
        </Text>
        {missing.map((item) => (
          <Text key={`${item.doc_type}-${item.side}-${item.vehicle_id}`} style={styles.missing}>
            Manquant : {item.doc_type.replace('_', ' ')} {SIDE[item.side]}
            {item.vehicle_label ? ` (camion ${item.vehicle_label})` : ''}
          </Text>
        ))}
      </Card>

      {d.documents.map((doc) => (
        <DocumentCard key={doc.id} doc={doc} onDecided={refresh} />
      ))}

      <SectionTitle>Camions</SectionTitle>
      {d.vehicles.length ? (
        d.vehicles.map((v) => (
          <Card key={v.id}>
            <Text style={styles.name}>
              {v.truck_type_label} — {v.registration_number}
            </Text>
            <Text style={textStyles.secondary}>
              {formatWeight(v.capacity_kg)}
              {v.brand_model ? ` · ${v.brand_model}` : ''}
              {v.is_active ? '' : ' · retiré'}
            </Text>
          </Card>
        ))
      ) : (
        <Text style={textStyles.secondary}>Aucun camion déclaré.</Text>
      )}

      {d.events.length ? (
        <>
          <SectionTitle>Historique des décisions</SectionTitle>
          <Card>
            {d.events.map((e) => (
              <View key={e.id} style={{ gap: 2 }}>
                <View style={styles.row}>
                  <VerificationPill status={e.status} />
                  <Text style={[textStyles.caption, { flex: 1 }]}>
                    {e.document || 'Profil'} · {formatDateTime(e.created_at)} · {e.decided_by || 'Système'}
                  </Text>
                </View>
                {e.reason ? <Text style={textStyles.secondary}>{e.reason}</Text> : null}
              </View>
            ))}
          </Card>
        </>
      ) : null}

      <SectionTitle>Décision sur le profil</SectionTitle>
      <Text style={textStyles.secondary}>
        Vérifier le profil autorise le transporteur à proposer des tarifs. Il est notifié de la décision.
      </Text>
      <DecisionButtons
        verifyLabel="Vérifier le profil"
        rejectLabel="Refuser le profil"
        onDecide={async (status, reason) => {
          await adminApi.decideDriver(d.id, { status, reason });
          await refresh();
        }}
      />
    </Screen>
  );
}

function DocumentCard({ doc, onDecided }: { doc: AdminDriverDocument; onDecided: () => Promise<void> }) {
  return (
    <Card>
      <View style={styles.row}>
        <Text style={[styles.name, { flex: 1 }]}>
          {doc.doc_type_label}
          {SIDE[doc.side] ? ` · ${SIDE[doc.side]}` : ''}
          {doc.vehicle_label ? ` · ${doc.vehicle_label}` : ''}
        </Text>
        <VerificationPill status={doc.is_expired ? 'expired' : doc.status} />
      </View>
      <PrivateImage uri={doc.file_url} />
      <Field label="Numéro" value={doc.document_number} />
      <Field label="Expire le" value={doc.expires_on ? formatDay(doc.expires_on) : null} />
      <Field label="Assureur" value={doc.issuer} />
      <Field
        label="Couvre la marchandise"
        value={doc.covers_goods === null ? null : doc.covers_goods ? 'Oui' : 'Non'}
      />
      <Field label="Envoyé le" value={formatDateTime(doc.created_at)} />
      {doc.review_note ? <Banner tone="danger" message={`Note : ${doc.review_note}`} /> : null}
      <Text style={textStyles.caption}>Comparez le numéro et la date saisis par le transporteur avec la photo.</Text>
      <DecisionButtons
        onDecide={async (status, reason) => {
          await adminApi.decideDriverDocument(doc.id, { status, reason });
          await onDecided();
        }}
      />
    </Card>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', gap: Spacing.md },
  name: { fontFamily: Fonts.bold, fontSize: FontSize.body, color: Colors.text },
  missing: { fontFamily: Fonts.regular, fontSize: FontSize.small, color: Colors.danger },
});
