import { useQueryClient } from '@tanstack/react-query';
import { router } from 'expo-router';
import { useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';

import { Avatar } from '@/components/avatar';
import { Badge, Button, Card, textStyles } from '@/components/ui';
import { Colors, Fonts, FontSize, Spacing } from '@/constants/theme';
import { type AdminUser, adminApi } from '@/features/staff/api';
import { AdminList, type Filter, VerificationPill } from '@/features/staff/components';
import { errorMessage } from '@/services/api';
import { confirmAction } from '@/utils/confirm';
import { formatDay } from '@/utils/format';

const FILTERS: Filter[] = [{ label: 'Tous' }, { label: 'Clients', value: 'client' }, { label: 'Transporteurs', value: 'driver' }, { label: 'Équipe', value: 'staff' }];
const ROLE = { client: 'Client', driver: 'Transporteur', staff: 'Équipe' } as const;

export default function Users() {
  return (
    <AdminList
      queryKey="users"
      // Le filtre de cet écran porte sur le rôle (et non sur un statut).
      fetchPage={({ status, ...rest }) => adminApi.users({ ...rest, role: status })}
      filters={FILTERS}
      searchPlaceholder="Nom, téléphone, e-mail…"
      emptyTitle="Aucun compte"
      renderItem={(u) => <UserCard user={u} />}
    />
  );
}

function UserCard({ user }: { user: AdminUser }) {
  const queryClient = useQueryClient();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const open = () => {
    if (user.driver_id) router.push({ pathname: '/backoffice/driver/[id]', params: { id: user.driver_id } });
    else if (user.identity_id) router.push({ pathname: '/backoffice/identity/[id]', params: { id: user.identity_id } });
  };

  const toggle = async () => {
    const suspend = user.is_active;
    const ok = await confirmAction(
      suspend ? 'Suspendre ce compte ?' : 'Réactiver ce compte ?',
      suspend ? "L'utilisateur ne pourra plus se connecter." : "L'utilisateur pourra de nouveau se connecter.",
      suspend ? 'Suspendre' : 'Réactiver',
    );
    if (!ok) return;
    setBusy(true);
    setError(null);
    try {
      await adminApi.setUserActive(user.id, !suspend);
      await queryClient.invalidateQueries({ queryKey: ['backoffice'] });
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Card onPress={user.driver_id || user.identity_id ? open : undefined}>
      <View style={styles.row}>
        <Avatar uri={user.avatar} name={user.full_name} size={44} />
        <View style={{ flex: 1 }}>
          <Text style={styles.name}>{user.full_name}</Text>
          <Text style={textStyles.caption}>
            {user.phone} · inscrit le {formatDay(user.date_joined.slice(0, 10))}
          </Text>
        </View>
        <Badge label={ROLE[user.role]} tone={user.role === 'staff' ? 'info' : 'neutral'} />
      </View>
      <View style={styles.row}>
        {user.role !== 'staff' ? <VerificationPill status={user.verification} /> : null}
        {!user.is_active ? <Badge label="Suspendu" tone="danger" /> : null}
      </View>
      {error ? <Text style={styles.error}>{error}</Text> : null}
      {user.role !== 'staff' ? (
        <Button
          title={user.is_active ? 'Suspendre le compte' : 'Réactiver le compte'}
          variant={user.is_active ? 'danger' : 'secondary'}
          onPress={toggle}
          loading={busy}
        />
      ) : null}
    </Card>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', gap: Spacing.sm },
  name: { fontFamily: Fonts.bold, fontSize: FontSize.body, color: Colors.text },
  error: { fontFamily: Fonts.regular, fontSize: FontSize.small, color: Colors.danger },
});
