import { Image } from 'expo-image';
import { StyleSheet, Text, View } from 'react-native';

import { Colors, Fonts } from '@/constants/theme';

/** Initiales (2 lettres au plus) quand la personne n'a pas de photo. */
function initials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  return ((parts[0]?.[0] ?? '') + (parts.length > 1 ? parts[parts.length - 1][0] : '')).toUpperCase();
}

/** Photo de profil ronde, ou initiales sur fond orangé clair. */
export function Avatar({ uri, name, size = 48 }: { uri?: string | null; name: string; size?: number }) {
  const box = { width: size, height: size, borderRadius: size / 2 };
  if (uri) return <Image source={uri} style={[styles.base, box]} contentFit="cover" accessibilityIgnoresInvertColors />;
  return (
    <View style={[styles.base, styles.fallback, box]}>
      <Text style={[styles.initials, { fontSize: size * 0.38 }]}>{initials(name)}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  base: { backgroundColor: Colors.border },
  fallback: { backgroundColor: Colors.primarySoft, alignItems: 'center', justifyContent: 'center' },
  initials: { fontFamily: Fonts.bold, color: Colors.cta },
});
