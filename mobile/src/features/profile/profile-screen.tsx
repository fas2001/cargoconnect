import { Ionicons } from '@expo/vector-icons';
import { useQuery } from '@tanstack/react-query';
import { router } from 'expo-router';
import { useState } from 'react';
import { Alert, Pressable, StyleSheet, Text, View } from 'react-native';

import { VerificationBadge } from '@/components/status-badge';
import { Banner, Button, Card, type IconName, Screen, TextField, textStyles } from '@/components/ui';
import { Colors, FontSize, Spacing } from '@/constants/theme';
import { useAuth, useCurrentUser } from '@/features/auth/auth-context';
import { errorMessage } from '@/services/api';
import { api } from '@/services/endpoints';
import type { Role } from '@/types/api';

export function ProfileScreen({ role }: { role: Role }) {
  const auth = useAuth();
  const user = useCurrentUser();
  const driver = useQuery({ queryKey: ['driver-profile'], queryFn: api.driverProfile, enabled: role === 'driver' });

  const switchTo = async (target: Role) => {
    if (target === 'driver' && !user.roles.includes('driver')) {
      router.push('/role');
      return;
    }
    await auth.setActiveRole(target);
    router.replace(target === 'driver' ? '/cargos-market' : '/home');
  };

  const confirmLogout = () =>
    Alert.alert('Déconnexion', 'Voulez-vous vous déconnecter ?', [
      { text: 'Annuler', style: 'cancel' },
      { text: 'Se déconnecter', style: 'destructive', onPress: () => void auth.logout() },
    ]);

  const rating = role === 'driver' ? driver.data?.rating : user.rating_as_client;

  return (
    <Screen refreshing={driver.isRefetching} onRefresh={role === 'driver' ? () => driver.refetch() : undefined}>
      <Card>
        <Text style={textStyles.title}>{user.full_name}</Text>
        <Text style={textStyles.secondary}>{user.phone}</Text>
        {user.email ? <Text style={textStyles.secondary}>{user.email}</Text> : null}
        <View style={styles.rating}>
          <Ionicons name="star" size={16} color={Colors.accent} />
          <Text style={textStyles.secondary}>
            {rating?.average ? `${rating.average}/5 (${rating.count} avis)` : 'Pas encore d’avis'}
          </Text>
        </View>
      </Card>

      {!user.phone_verified ? <PhoneVerification /> : null}

      {role === 'driver' && driver.data ? (
        <Card>
          <View style={styles.between}>
            <Text style={styles.cardTitle}>{driver.data.company_name || 'Profil transporteur'}</Text>
            <VerificationBadge status={driver.data.verification_status} />
          </View>
          {driver.data.verification_status === 'pending' ? (
            <Text style={textStyles.secondary}>
              Ajoutez au moins un véhicule et vos justificatifs (CIN, permis, carte grise, assurance). Notre équipe vérifie
              votre profil avant vos premières propositions.
            </Text>
          ) : null}
          {driver.data.verification_status === 'rejected' && driver.data.rejection_reason ? (
            <Banner tone="danger" message={`Motif : ${driver.data.rejection_reason}`} />
          ) : null}
          <MenuRow icon="bus-outline" label={`Mes véhicules (${driver.data.vehicles.filter((v) => v.is_active).length})`} onPress={() => router.push('/vehicles')} />
          <MenuRow icon="document-text-outline" label={`Mes justificatifs (${driver.data.documents.length})`} onPress={() => router.push('/documents')} />
        </Card>
      ) : null}

      <Card>
        <MenuRow icon="notifications-outline" label="Notifications" onPress={() => router.push('/notifications')} />
        {role === 'client' ? (
          <MenuRow
            icon="swap-horizontal-outline"
            label={user.roles.includes('driver') ? "Passer à l'espace chauffeur" : 'Devenir transporteur'}
            onPress={() => switchTo('driver')}
          />
        ) : (
          <MenuRow icon="swap-horizontal-outline" label="Passer à l'espace client" onPress={() => switchTo('client')} />
        )}
      </Card>

      <Button title="Se déconnecter" variant="danger" icon="log-out-outline" onPress={confirmLogout} />
      <Text style={[textStyles.caption, { textAlign: 'center' }]}>CargoConnect — version MVP</Text>
    </Screen>
  );
}

function MenuRow({ icon, label, onPress }: { icon: IconName; label: string; onPress: () => void }) {
  return (
    <Pressable accessibilityRole="button" onPress={onPress} style={styles.menuRow}>
      <Ionicons name={icon} size={20} color={Colors.primary} />
      <Text style={styles.menuLabel}>{label}</Text>
      <Ionicons name="chevron-forward" size={18} color={Colors.textMuted} />
    </Pressable>
  );
}

function PhoneVerification() {
  const auth = useAuth();
  const user = useCurrentUser();
  const [sent, setSent] = useState(false);
  const [code, setCode] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const run = async (fn: () => Promise<void>) => {
    setError(null);
    setLoading(true);
    try {
      await fn();
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setLoading(false);
    }
  };

  return (
    <Card>
      <Text style={styles.cardTitle}>Vérifiez votre numéro</Text>
      <Text style={textStyles.secondary}>Un numéro vérifié inspire confiance aux autres utilisateurs. Le code est envoyé sur WhatsApp : ce numéro doit avoir un compte WhatsApp.</Text>
      {error ? <Banner tone="danger" message={error} /> : null}
      {sent ? (
        <>
          <TextField label="Code reçu sur WhatsApp" keyboardType="number-pad" textContentType="oneTimeCode" maxLength={6} value={code} onChangeText={setCode} />
          <Button
            title="Valider"
            loading={loading}
            disabled={code.length < 4}
            onPress={() =>
              run(async () => {
                await api.verifyPhone(code);
                await auth.refreshUser();
              })
            }
          />
        </>
      ) : (
        <Button
          title="Recevoir le code sur WhatsApp"
          icon="logo-whatsapp"
          variant="secondary"
          loading={loading}
          onPress={() =>
            run(async () => {
              await api.requestOtp(user.phone, 'verify_phone');
              setSent(true);
            })
          }
        />
      )}
    </Card>
  );
}

const styles = StyleSheet.create({
  rating: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  between: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: Spacing.sm },
  cardTitle: { fontSize: FontSize.body, fontWeight: '700', color: Colors.text, flexShrink: 1 },
  menuRow: { flexDirection: 'row', alignItems: 'center', gap: Spacing.md, paddingVertical: Spacing.sm, minHeight: 44 },
  menuLabel: { flex: 1, fontSize: FontSize.body, color: Colors.text },
});
