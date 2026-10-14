import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useLocalSearchParams } from 'expo-router';
import { StyleSheet, Text, View } from 'react-native';

import { Avatar } from '@/components/avatar';
import { Banner, Card, ErrorState, Loading, Screen, SectionTitle, textStyles } from '@/components/ui';
import { Colors, Fonts, FontSize, Spacing } from '@/constants/theme';
import { adminApi } from '@/features/staff/api';
import { DecisionButtons, Field, PrivateImage, VerificationPill } from '@/features/staff/components';
import { errorMessage } from '@/services/api';
import { formatDateTime } from '@/utils/format';

export default function IdentityReview() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const queryClient = useQueryClient();
  const query = useQuery({ queryKey: ['backoffice', 'identity', id], queryFn: () => adminApi.identity(id) });

  if (query.isLoading) return <Loading />;
  if (query.error || !query.data) return <ErrorState message={errorMessage(query.error)} onRetry={() => query.refetch()} />;
  const i = query.data;
  const refresh = () => queryClient.invalidateQueries({ queryKey: ['backoffice'] });
  const company = i.account_type === 'company';

  return (
    <Screen edges={['bottom']} refreshing={query.isRefetching} onRefresh={() => query.refetch()}>
      <Card>
        <View style={styles.row}>
          <Avatar uri={i.avatar} name={i.name} size={56} />
          <View style={{ flex: 1 }}>
            <Text style={textStyles.title}>{i.name}</Text>
            <Text style={textStyles.secondary}>{company ? 'Entreprise' : 'Particulier'}</Text>
          </View>
          <VerificationPill status={i.status} />
        </View>
        {company ? (
          <>
            <Field label="Raison sociale" value={i.company_name} />
            <Field label="ICE" value={i.ice} />
          </>
        ) : (
          <Field label="N° de CIN" value={i.cin_number} />
        )}
        <Field label="Téléphone" value={i.phone} />
        <Field label="E-mail" value={i.email} />
        <Field label="Renseignée le" value={formatDateTime(i.created_at)} />
        {!i.is_active ? <Banner tone="danger" message="Compte suspendu." /> : null}
        {i.rejection_reason ? <Banner tone="danger" message={`Dernier refus : ${i.rejection_reason}`} /> : null}
      </Card>

      <SectionTitle>Documents</SectionTitle>
      {i.documents.length === 0 ? <Text style={textStyles.secondary}>Aucun document envoyé.</Text> : null}
      {i.documents.map((doc) => (
        <Card key={doc.id}>
          <View style={styles.row}>
            <Text style={[styles.name, { flex: 1 }]}>
              {doc.doc_type_label}
              {doc.side !== 'unique' ? ` · ${doc.side}` : ''}
            </Text>
            <VerificationPill status={doc.status} />
          </View>
          <PrivateImage uri={doc.file_url} />
          <Text style={textStyles.caption}>
            {company ? "Vérifiez que la raison sociale et l'ICE correspondent." : 'Vérifiez que le numéro et le nom correspondent à la CIN.'}
          </Text>
          <DecisionButtons
            onDecide={async (status, reason) => {
              await adminApi.decideClientDocument(doc.id, { status, reason });
              await refresh();
            }}
          />
        </Card>
      ))}

      <SectionTitle>Décision sur l&apos;identité</SectionTitle>
      <Text style={textStyles.secondary}>Une identité vérifiée affiche le badge « Client vérifié » aux transporteurs.</Text>
      <DecisionButtons
        verifyLabel="Vérifier l'identité"
        rejectLabel="Refuser l'identité"
        onDecide={async (status, reason) => {
          await adminApi.decideIdentity(i.id, { status, reason });
          await refresh();
        }}
      />
    </Screen>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', gap: Spacing.md },
  name: { fontFamily: Fonts.bold, fontSize: FontSize.body, color: Colors.text },
});
