import { Pressable, StyleSheet, Text, View } from 'react-native';

import { Colors, FontSize, Radius } from '@/constants/theme';
import { type Language, setLanguage, useLanguage } from '@/i18n';

const OPTIONS: { value: Language; label: string }[] = [
  { value: 'fr', label: 'Français' },
  { value: 'ar', label: 'العربية' },
];

/** Choix de la langue. Changer de langue redémarre l'app pour appliquer le sens de lecture. */
export function LanguageSwitch() {
  const language = useLanguage();
  return (
    <View style={styles.switch} accessibilityRole="radiogroup">
      {OPTIONS.map((option) => {
        const selected = option.value === language;
        return (
          <Pressable
            key={option.value}
            accessibilityRole="radio"
            accessibilityState={{ selected }}
            onPress={() => void setLanguage(option.value)}
            style={[styles.option, selected && styles.selected]}>
            <Text style={[styles.label, selected && styles.selectedLabel]}>{option.label}</Text>
          </Pressable>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  switch: {
    flexDirection: 'row',
    borderWidth: 1,
    borderColor: Colors.primary,
    borderRadius: Radius.pill,
    overflow: 'hidden',
  },
  option: { paddingHorizontal: 14, paddingVertical: 6, minHeight: 32, justifyContent: 'center' },
  selected: { backgroundColor: Colors.primary },
  label: { fontSize: FontSize.small, color: Colors.primary, fontWeight: '600' },
  selectedLabel: { color: Colors.white },
});
