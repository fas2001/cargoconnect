import { useQueryClient } from '@tanstack/react-query';
import { router } from 'expo-router';
import { useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';

import { ReasonDialog } from '@/components/reason-dialog';
import { Badge, type BadgeTone, Button, Card, textStyles } from '@/components/ui';
import { Colors, Fonts, FontSize, Spacing } from '@/constants/theme';
import { type AdminReport, adminApi, type ReportStatus } from '@/features/staff/api';
import { AdminList, type Filter } from '@/features/staff/components';
import { errorMessage } from '@/services/api';
import { formatDateTime } from '@/utils/format';

const FILTERS: Filter[] = [
  { label: 'À traiter', value: 'open,in_review' },
  { label: 'Résolus', value: 'resolved' },
  { label: 'Classés', value: 'dismissed' },
  { label: 'Tous' },
];
const TONE: Record<ReportStatus, BadgeTone> = { open: 'danger', in_review: 'warning', resolved: 'success', dismissed: 'neutral' };

export default function Reports() {
  return (
    <AdminList
      queryKey="reports"
      fetchPage={adminApi.reports}
      filters={FILTERS}
      emptyTitle="Aucun signalement"
      renderItem={(r) => <ReportCard report={r} />}
    />
  );
}

function ReportCard({ report }: { report: AdminReport }) {
  const queryClient = useQueryClient();
  const [closing, setClosing] = useState<'resolved' | 'dismissed' | null>(null);
  const [error, setError] = useState<string | null>(null);

  const update = async (body: { status: ReportStatus; admin_note?: string }) => {
    setError(null);
    try {
      await adminApi.updateReport(report.id, body);
      await queryClient.invalidateQueries({ queryKey: ['backoffice'] });
      setClosing(null);
    } catch (e) {
      setError(errorMessage(e));
    }
  };

  const open = report.status === 'open' || report.status === 'in_review';

  return (
    <Card>
      <View style={styles.row}>
        <Text style={[styles.name, { flex: 1 }]}>{report.reason_label}</Text>
        <Badge label={report.status_label} tone={TONE[report.status]} />
      </View>
      <Text style={textStyles.body}>{report.description}</Text>
      <Text style={textStyles.caption}>
        Par {report.reporter} ({report.reporter_phone}) · {formatDateTime(report.created_at)}
      </Text>
      {report.reported_user ? <Text style={textStyles.caption}>Concerne : {report.reported_user}</Text> : null}
      {report.cargo_title ? <Text style={textStyles.caption}>Annonce : {report.cargo_title}</Text> : null}
      {report.admin_note ? <Text style={textStyles.secondary}>Note de l&apos;équipe : {report.admin_note}</Text> : null}
      {report.shipment ? (
        <Button
          title="Voir le dossier du transport"
          variant="ghost"
          icon="navigate-outline"
          onPress={() => router.push({ pathname: '/backoffice/shipment/[id]', params: { id: report.shipment! } })}
        />
      ) : null}
      {error ? <Text style={styles.error}>{error}</Text> : null}
      {open ? (
        <View style={{ gap: Spacing.sm }}>
          {report.status === 'open' ? (
            <Button title="Prendre en charge" variant="secondary" onPress={() => update({ status: 'in_review' })} />
          ) : null}
          <View style={styles.row}>
            <Button title="Classer" variant="ghost" onPress={() => setClosing('dismissed')} style={{ flex: 1 }} />
            <Button title="Résolu" onPress={() => setClosing('resolved')} style={{ flex: 1 }} />
          </View>
        </View>
      ) : null}
      <ReasonDialog
        visible={closing !== null}
        title={closing === 'resolved' ? 'Marquer comme résolu' : 'Classer sans suite'}
        label="Note de l'équipe (ce qui a été fait)"
        confirmLabel="Enregistrer"
        required
        onCancel={() => setClosing(null)}
        onConfirm={(note) => (closing ? update({ status: closing, admin_note: note }) : undefined)}
      />
    </Card>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', gap: Spacing.sm },
  name: { fontFamily: Fonts.bold, fontSize: FontSize.body, color: Colors.text },
  error: { fontFamily: Fonts.regular, fontSize: FontSize.small, color: Colors.danger },
});
