import { Ionicons } from '@expo/vector-icons';
import { useQuery } from '@tanstack/react-query';
import * as ImagePicker from 'expo-image-picker';
import * as LocalAuthentication from 'expo-local-authentication';
import { type Href, router } from 'expo-router';
import { useState } from 'react';
import { Alert, Platform, Pressable, StyleSheet, Switch, Text, View } from 'react-native';

import { Avatar } from '@/components/avatar';
import { VerificationBadge } from '@/components/status-badge';
import { LanguageSwitch } from '@/components/language-switch';
import { Banner, Button, Card, Chevron, type IconName, Screen, TextField, textStyles } from '@/components/ui';
import { Colors, Fonts, FontSize, Spacing } from '@/constants/theme';
import { useAuth, useCurrentUser } from '@/features/auth/auth-context';
import { useBiometrics } from '@/features/auth/biometrics';
import { errorMessage } from '@/services/api';
import { api } from '@/services/endpoints';
import { tokenStorage } from '@/services/token-storage';
import { assetToFormData } from '@/services/upload';
import type { IdentityStatus, Role } from '@/types/api';
import { t } from '@/i18n';

export function ProfileScreen({ role }: { role: Role }) {
  const auth = useAuth();
  const user = useCurrentUser();
  const driver = useQuery({ queryKey: ['driver-profile'], queryFn: api.driverProfile, enabled: role === 'driver' });

  const confirmLogout = () =>
    Alert.alert(t('Déconnexion'), t('Voulez-vous vous déconnecter ?'), [
      { text: t('Annuler'), style: 'cancel' },
      { text: t('Se déconnecter'), style: 'destructive', onPress: () => void auth.logout() },
    ]);

  const rating = role === 'driver' ? driver.data?.rating : user.rating_as_client;

  return (
    <Screen refreshing={driver.isRefetching} onRefresh={role === 'driver' ? () => driver.refetch() : undefined}>
      <Card>
        <View style={styles.identity}>
          <ProfilePhoto />
          <View style={{ flex: 1, gap: 2 }}>
            <Text style={textStyles.title}>{user.full_name}</Text>
            <Text style={textStyles.secondary}>{user.phone}</Text>
            {user.email ? <Text style={textStyles.secondary}>{user.email}</Text> : null}
            <View style={styles.rating}>
              <Ionicons name="star" size={16} color={Colors.accent} />
              <Text style={textStyles.secondary}>
                {rating?.average ? t('{average}/5 ({count} avis)', { average: rating.average, count: rating.count }) : t('Pas encore d’avis')}
              </Text>
            </View>
          </View>
        </View>
        <Button title={t('Modifier mon compte')} variant="secondary" icon="create-outline" onPress={() => router.push('/account')} />
      </Card>

      {user.is_staff ? (
        <Button title="Administration" icon="shield-checkmark-outline" onPress={() => router.push('/backoffice' as Href)} />
      ) : null}

      {!user.phone_verified ? <PhoneVerification /> : null}

      {role === 'driver' && driver.data ? (
        <Card>
          <View style={styles.between}>
            <Text style={styles.cardTitle}>{driver.data.company_name || t('Profil transporteur')}</Text>
            <VerificationBadge status={driver.data.verification_status} />
          </View>
          {driver.data.verification_status === 'pending' ? (
            <Text style={textStyles.secondary}>
              {t('Ajoutez au moins un véhicule et vos justificatifs (CIN, permis, carte grise, assurance). Notre équipe vérifie votre profil avant vos premières propositions.')}
            </Text>
          ) : null}
          {driver.data.verification_status === 'rejected' && driver.data.rejection_reason ? (
            <Banner tone="danger" message={t('Motif : {reason}', { reason: driver.data.rejection_reason })} />
          ) : null}
          <MenuRow icon="bus-outline" label={t('Mes véhicules ({count})', { count: driver.data.vehicles.filter((v) => v.is_active).length })} onPress={() => router.push('/vehicles')} />
          <MenuRow icon="document-text-outline" label={t('Mes justificatifs ({done}/{total})', { done: driver.data.checklist.filter((i) => i.state === 'verified').length, total: driver.data.checklist.length })} onPress={() => router.push('/documents')} />
        </Card>
      ) : null}

      <Card>
        {role === 'client' ? (
          <MenuRow icon="id-card-outline" label={identityLabel(user.identity_status)} onPress={() => router.push('/identity')} />
        ) : null}
        <MenuRow icon="notifications-outline" label={t('Notifications')} onPress={() => router.push('/notifications')} />
        <LanguageRow />
      </Card>

      <SecuritySection />

      <Button title={t('Se déconnecter')} variant="danger" icon="log-out-outline" onPress={confirmLogout} />
      <Text style={[textStyles.caption, { textAlign: 'center' }]}>{t('CargoConnect — version MVP')}</Text>
    </Screen>
  );
}

function identityLabel(status: IdentityStatus | null): string {
  switch (status) {
    case 'verified':
      return t('Mon identité · vérifiée');
    case 'pending':
      return t('Mon identité · en vérification');
    case 'rejected':
      return t('Mon identité · refusée');
    default:
      return t('Mon identité · à compléter');
  }
}

function MenuRow({ icon, label, onPress }: { icon: IconName; label: string; onPress: () => void }) {
  return (
    <Pressable accessibilityRole="button" onPress={onPress} style={styles.menuRow}>
      <Ionicons name={icon} size={20} color={Colors.primary} />
      <Text style={styles.menuLabel}>{label}</Text>
      <Chevron size={18} color={Colors.textMuted} />
    </Pressable>
  );
}

/** Photo de profil : un appui propose de prendre une photo, d'en choisir une ou de la retirer. */
function ProfilePhoto() {
  const auth = useAuth();
  const user = useCurrentUser();
  const [busy, setBusy] = useState(false);

  const upload = async (source: 'camera' | 'library') => {
    if (source === 'camera' && !(await ImagePicker.requestCameraPermissionsAsync()).granted) {
      Alert.alert(t("L'accès à l'appareil photo a été refusé."));
      return;
    }
    const options: ImagePicker.ImagePickerOptions = {
      mediaTypes: ['images'],
      allowsEditing: true,
      aspect: [1, 1],
      quality: 0.7,
      cameraType: ImagePicker.CameraType.front,
    };
    const result = source === 'camera' ? await ImagePicker.launchCameraAsync(options) : await ImagePicker.launchImageLibraryAsync(options);
    if (result.canceled) return;
    setBusy(true);
    try {
      await api.uploadAvatar(await assetToFormData('avatar', result.assets[0]));
      await auth.refreshUser();
    } catch (e) {
      Alert.alert(t('Photo non enregistrée'), errorMessage(e));
    } finally {
      setBusy(false);
    }
  };

  const remove = async () => {
    setBusy(true);
    try {
      await api.updateMe({ avatar: null });
      await auth.refreshUser();
    } catch (e) {
      Alert.alert(t('Photo non enregistrée'), errorMessage(e));
    } finally {
      setBusy(false);
    }
  };

  const choose = () =>
    Alert.alert(t('Photo de profil'), undefined, [
      { text: t('Prendre une photo'), onPress: () => void upload('camera') },
      { text: t('Choisir dans la galerie'), onPress: () => void upload('library') },
      ...(user.avatar ? [{ text: t('Retirer la photo'), style: 'destructive' as const, onPress: () => void remove() }] : []),
      { text: t('Annuler'), style: 'cancel' as const },
    ]);

  return (
    <Pressable onPress={choose} disabled={busy} accessibilityRole="button" accessibilityLabel={t('Modifier la photo de profil')}>
      <Avatar uri={user.avatar} name={user.full_name} size={72} />
      <View style={styles.cameraBadge}>
        <Ionicons name={busy ? 'hourglass-outline' : 'camera'} size={14} color={Colors.white} />
      </View>
    </Pressable>
  );
}

/** Sécurité : déverrouillage par empreinte / Face ID et accès au changement de mot de passe. */
function SecuritySection() {
  const user = useCurrentUser();
  const biometrics = useBiometrics();
  const [enabled, setEnabled] = useState(tokenStorage.isBiometricEnabled);
  const [busy, setBusy] = useState(false);
  const remembered = tokenStorage.isRemembered();

  const toggle = async (on: boolean) => {
    if (!biometrics) return;
    setBusy(true);
    try {
      if (on) {
        const prompt = t('Activer le déverrouillage par {method}', { method: biometrics.label });
        // iOS ne demande pas Face ID à l'enregistrement de la clé : on vérifie d'abord que c'est bien vous.
        if (Platform.OS === 'ios') {
          const check = await LocalAuthentication.authenticateAsync({ promptMessage: prompt, cancelLabel: t('Annuler') });
          if (!check.success) return;
        }
        await tokenStorage.enableBiometric(prompt, user.phone);
      } else {
        await tokenStorage.disableBiometric();
      }
      setEnabled(on);
    } catch {
      // Annulation de l'empreinte sur Android, ou capteur indisponible : rien n'a changé.
      if (on) Alert.alert(t('Activation impossible'), t('La vérification n’a pas abouti. Réessayez.'));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Card>
      <Text style={styles.cardTitle}>{t('Sécurité')}</Text>
      {Platform.OS !== 'web' && biometrics ? (
        <>
          <View style={styles.menuRow}>
            <Ionicons name={biometrics.icon} size={20} color={Colors.primary} />
            <Text style={styles.menuLabel}>{t('Déverrouiller avec {method}', { method: biometrics.label })}</Text>
            <Switch
              value={enabled}
              onValueChange={(v) => void toggle(v)}
              disabled={busy || !biometrics.available || !remembered}
              trackColor={{ true: Colors.cta, false: Colors.border }}
              thumbColor={Colors.white}
            />
          </View>
          <Text style={textStyles.caption}>
            {!biometrics.available
              ? t('Aucune empreinte ni Face ID n’est enregistré sur ce téléphone (réglages du téléphone).')
              : !remembered
                ? t('Reconnectez-vous en cochant « Se souvenir de moi » pour utiliser cette option.')
                : t('À chaque ouverture, l’application demandera votre {method}. Votre empreinte reste dans le téléphone : CargoConnect ne la reçoit jamais. Après « Se déconnecter », elle permet de revenir sans mot de passe ; pour tout effacer, désactivez-la d’abord.', { method: biometrics.label })}
          </Text>
        </>
      ) : null}
      <MenuRow icon="key-outline" label={t('Changer le mot de passe')} onPress={() => router.push('/account')} />
    </Card>
  );
}

function LanguageRow() {
  return (
    <View style={styles.menuRow}>
      <Ionicons name="language-outline" size={20} color={Colors.primary} />
      <Text style={styles.menuLabel}>{t('Langue')}</Text>
      <LanguageSwitch />
    </View>
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
      <Text style={styles.cardTitle}>{t('Vérifiez votre numéro')}</Text>
      <Text style={textStyles.secondary}>{t('Un numéro vérifié inspire confiance aux autres utilisateurs. Le code est envoyé sur WhatsApp : ce numéro doit avoir un compte WhatsApp.')}</Text>
      {error ? <Banner tone="danger" message={error} /> : null}
      {sent ? (
        <>
          <TextField label={t('Code reçu sur WhatsApp')} keyboardType="number-pad" textContentType="oneTimeCode" maxLength={6} value={code} onChangeText={setCode} />
          <Button
            title={t('Valider')}
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
          title={t('Recevoir le code sur WhatsApp')}
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
  identity: { flexDirection: 'row', alignItems: 'center', gap: Spacing.md },
  cameraBadge: {
    position: 'absolute',
    bottom: 0,
    right: 0,
    width: 26,
    height: 26,
    borderRadius: 13,
    backgroundColor: Colors.cta,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 2,
    borderColor: Colors.surface,
  },
  between: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: Spacing.sm },
  cardTitle: { fontSize: FontSize.body, fontFamily: Fonts.bold, color: Colors.text, flexShrink: 1 },
  menuRow: { flexDirection: 'row', alignItems: 'center', gap: Spacing.md, paddingVertical: Spacing.sm, minHeight: 44 },
  menuLabel: { fontFamily: Fonts.regular, flex: 1, fontSize: FontSize.body, color: Colors.text },
});
