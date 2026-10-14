import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { LanguageSwitch } from '@/components/language-switch';
import { Button } from '@/components/ui';
import { Colors, Fonts, FontSize, Spacing } from '@/constants/theme';
import { t, type TKey } from '@/i18n';

const POINTS = [
  { icon: 'cube-outline', text: 'Publiez votre cargaison en 2 minutes' },
  { icon: 'pricetags-outline', text: 'Recevez et comparez les tarifs des transporteurs' },
  { icon: 'shield-checkmark-outline', text: 'Transporteurs vérifiés et notés' },
] as const satisfies readonly { icon: string; text: TKey }[];

export default function Welcome() {
  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.language}>
        <LanguageSwitch />
      </View>
      <View style={styles.hero}>
        <View style={styles.logo}>
          <Ionicons name="bus" size={44} color={Colors.white} />
        </View>
        <Text style={styles.brand}>CargoConnect</Text>
        <Text style={styles.tagline}>{t('Le transport de marchandises au Maroc, simplement.')}</Text>
      </View>

      <View style={styles.points}>
        {POINTS.map((p) => (
          <View key={p.text} style={styles.point}>
            <Ionicons name={p.icon} size={22} color={Colors.primary} />
            <Text style={styles.pointText}>{t(p.text)}</Text>
          </View>
        ))}
      </View>

      <View style={styles.actions}>
        <Button title={t('Créer un compte')} onPress={() => router.push('/register')} />
        <Button title={t("J'ai déjà un compte")} variant="secondary" onPress={() => router.push('/login')} />
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.background, padding: Spacing.xl, justifyContent: 'space-between' },
  language: { alignItems: 'flex-end' },
  hero: { alignItems: 'center', marginTop: Spacing.lg, gap: Spacing.md },
  logo: {
    width: 88,
    height: 88,
    borderRadius: 24,
    backgroundColor: Colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  brand: { fontSize: 32, fontFamily: Fonts.bold, color: Colors.primary },
  tagline: { fontFamily: Fonts.regular, fontSize: FontSize.body, color: Colors.textSecondary, textAlign: 'center' },
  points: { gap: Spacing.lg },
  point: { flexDirection: 'row', alignItems: 'center', gap: Spacing.md },
  pointText: { fontFamily: Fonts.regular, flex: 1, fontSize: FontSize.body, color: Colors.text },
  actions: { gap: Spacing.md },
});
