import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { Button } from '@/components/ui';
import { Colors, FontSize, Spacing } from '@/constants/theme';

const POINTS = [
  { icon: 'cube-outline', text: 'Publiez votre cargaison en 2 minutes' },
  { icon: 'pricetags-outline', text: 'Recevez et comparez les tarifs des transporteurs' },
  { icon: 'shield-checkmark-outline', text: 'Transporteurs vérifiés et notés' },
] as const;

export default function Welcome() {
  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.hero}>
        <View style={styles.logo}>
          <Ionicons name="bus" size={44} color={Colors.white} />
        </View>
        <Text style={styles.brand}>CargoConnect</Text>
        <Text style={styles.tagline}>Le transport de marchandises au Maroc, simplement.</Text>
      </View>

      <View style={styles.points}>
        {POINTS.map((p) => (
          <View key={p.text} style={styles.point}>
            <Ionicons name={p.icon} size={22} color={Colors.primary} />
            <Text style={styles.pointText}>{p.text}</Text>
          </View>
        ))}
      </View>

      <View style={styles.actions}>
        <Button title="Créer un compte" onPress={() => router.push('/register')} />
        <Button title="J'ai déjà un compte" variant="secondary" onPress={() => router.push('/login')} />
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.background, padding: Spacing.xl, justifyContent: 'space-between' },
  hero: { alignItems: 'center', marginTop: Spacing.xxl, gap: Spacing.md },
  logo: {
    width: 88,
    height: 88,
    borderRadius: 24,
    backgroundColor: Colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  brand: { fontSize: 32, fontWeight: '800', color: Colors.primary },
  tagline: { fontSize: FontSize.body, color: Colors.textSecondary, textAlign: 'center' },
  points: { gap: Spacing.lg },
  point: { flexDirection: 'row', alignItems: 'center', gap: Spacing.md },
  pointText: { flex: 1, fontSize: FontSize.body, color: Colors.text },
  actions: { gap: Spacing.md },
});
