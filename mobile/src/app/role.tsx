import { Ionicons } from '@expo/vector-icons';
import { Redirect, router } from 'expo-router';
import { useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';

import { Banner, Button, Card, Screen, TextField, textStyles } from '@/components/ui';
import { Colors, FontSize, Spacing } from '@/constants/theme';
import { useAuth } from '@/features/auth/auth-context';
import { errorMessage } from '@/services/api';
import type { Role } from '@/types/api';

/** Choix de l'espace actif. Un même compte peut être client et chauffeur. */
export default function RoleScreen() {
  const auth = useAuth();
  const [companyName, setCompanyName] = useState('');
  const [showDriverForm, setShowDriverForm] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (auth.status !== 'signedIn') return <Redirect href="/" />;
  const isDriver = auth.user.roles.includes('driver');

  const choose = async (role: Role) => {
    await auth.setActiveRole(role);
    router.replace(role === 'driver' ? '/cargos-market' : '/home');
  };

  const becomeDriver = async () => {
    setError(null);
    setLoading(true);
    try {
      await auth.activateDriver({ company_name: companyName.trim() });
      router.replace('/driver-profile');
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setLoading(false);
    }
  };

  return (
    <Screen edges={['bottom']}>
      <Text style={textStyles.secondary}>
        Bonjour {auth.user.full_name.split(' ')[0]} ! Vous pourrez changer d&apos;espace à tout moment depuis votre profil.
      </Text>

      <RoleCard
        icon="cube-outline"
        title="J'ai des marchandises à transporter"
        subtitle="Publiez une annonce et recevez des propositions de transporteurs."
        onPress={() => choose('client')}
      />

      <RoleCard
        icon="bus-outline"
        title="Je suis transporteur / chauffeur"
        subtitle={
          isDriver
            ? 'Trouvez des cargaisons et gérez vos missions.'
            : 'Activez votre espace chauffeur pour proposer vos tarifs.'
        }
        onPress={() => (isDriver ? choose('driver') : setShowDriverForm(true))}
      />

      {showDriverForm && !isDriver ? (
        <Card>
          <Text style={styles.formTitle}>Activer l&apos;espace chauffeur</Text>
          {error ? <Banner tone="danger" message={error} /> : null}
          <TextField
            label="Nom de l'entreprise (facultatif)"
            placeholder="Ex. Transports Atlas"
            value={companyName}
            onChangeText={setCompanyName}
          />
          <Banner message="Ensuite, ajoutez votre véhicule et vos justificatifs : notre équipe vérifiera votre profil avant vos premières propositions." />
          <Button title="Activer l'espace chauffeur" onPress={becomeDriver} loading={loading} />
        </Card>
      ) : null}
    </Screen>
  );
}

function RoleCard({ icon, title, subtitle, onPress }: { icon: 'cube-outline' | 'bus-outline'; title: string; subtitle: string; onPress: () => void }) {
  return (
    <Card onPress={onPress}>
      <View style={styles.row}>
        <View style={styles.icon}>
          <Ionicons name={icon} size={28} color={Colors.primary} />
        </View>
        <View style={{ flex: 1, gap: 4 }}>
          <Text style={styles.title}>{title}</Text>
          <Text style={textStyles.secondary}>{subtitle}</Text>
        </View>
        <Ionicons name="chevron-forward" size={20} color={Colors.textMuted} />
      </View>
    </Card>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', gap: Spacing.md },
  icon: {
    width: 52,
    height: 52,
    borderRadius: 14,
    backgroundColor: Colors.primarySoft,
    alignItems: 'center',
    justifyContent: 'center',
  },
  title: { fontSize: FontSize.body, fontWeight: '700', color: Colors.text },
  formTitle: { fontSize: FontSize.body, fontWeight: '700', color: Colors.text },
});
