import { Ionicons } from '@expo/vector-icons';
import type { ComponentProps, ReactNode } from 'react';
import {
  ActivityIndicator,
  I18nManager,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
  type StyleProp,
  type TextInputProps,
  type ViewStyle,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { Colors, FontSize, Radius, Spacing } from '@/constants/theme';
import { t } from '@/i18n';

import { TruckLoader } from './truck-loader';

export type IconName = ComponentProps<typeof Ionicons>['name'];

/**
 * Animation des fenêtres modales. Désactivée sur le web : react-native-web attend la fin de
 * l'animation CSS pour masquer la fenêtre, ce qui peut la laisser bloquée ouverte.
 */
export function modalAnimation(native: 'fade' | 'slide'): 'fade' | 'slide' | 'none' {
  return Platform.OS === 'web' ? 'none' : native;
}

type ScreenProps = {
  children: ReactNode;
  scroll?: boolean;
  refreshing?: boolean;
  onRefresh?: () => void;
  edges?: ('top' | 'bottom')[];
  footer?: ReactNode;
};

/** Conteneur d'écran : zone sûre, clavier, défilement et « tirer pour rafraîchir ». */
export function Screen({ children, scroll = true, refreshing, onRefresh, edges = [], footer }: ScreenProps) {
  const content = scroll ? (
    <ScrollView
      contentContainerStyle={styles.scrollContent}
      keyboardShouldPersistTaps="handled"
      refreshControl={onRefresh ? <RefreshControl refreshing={!!refreshing} onRefresh={onRefresh} /> : undefined}>
      {children}
    </ScrollView>
  ) : (
    <View style={[styles.scrollContent, styles.flex]}>{children}</View>
  );
  return (
    <SafeAreaView style={styles.screen} edges={edges}>
      <KeyboardAvoidingView style={styles.flex} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        {content}
        {footer ? <View style={styles.footer}>{footer}</View> : null}
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

type ButtonProps = {
  title: string;
  onPress: () => void;
  variant?: 'primary' | 'secondary' | 'danger' | 'ghost';
  loading?: boolean;
  disabled?: boolean;
  icon?: IconName;
  style?: StyleProp<ViewStyle>;
};

export function Button({ title, onPress, variant = 'primary', loading, disabled, icon, style }: ButtonProps) {
  const palette = BUTTON_PALETTE[variant];
  const inactive = disabled || loading;
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ disabled: inactive, busy: loading }}
      onPress={onPress}
      disabled={inactive}
      style={({ pressed }) => [
        styles.button,
        { backgroundColor: palette.bg, borderColor: palette.border },
        pressed && { opacity: 0.85 },
        inactive && { opacity: 0.5 },
        style,
      ]}>
      {loading ? (
        <ActivityIndicator color={palette.fg} />
      ) : (
        <>
          {icon ? <Ionicons name={icon} size={18} color={palette.fg} /> : null}
          <Text style={[styles.buttonText, { color: palette.fg }]}>{title}</Text>
        </>
      )}
    </Pressable>
  );
}

const BUTTON_PALETTE = {
  primary: { bg: Colors.primary, fg: Colors.white, border: Colors.primary },
  secondary: { bg: Colors.surface, fg: Colors.primary, border: Colors.primary },
  danger: { bg: Colors.surface, fg: Colors.danger, border: Colors.danger },
  ghost: { bg: 'transparent', fg: Colors.primary, border: 'transparent' },
};

type FieldProps = TextInputProps & { label: string; error?: string; hint?: string };

export function TextField({ label, error, hint, style, ...props }: FieldProps) {
  return (
    <View style={styles.field}>
      <Text style={styles.label}>{label}</Text>
      <TextInput
        placeholderTextColor={Colors.textMuted}
        style={[styles.input, props.multiline && styles.multiline, error ? styles.inputError : null, style]}
        {...props}
      />
      {error ? <Text style={styles.error}>{error}</Text> : hint ? <Text style={styles.hint}>{hint}</Text> : null}
    </View>
  );
}

/** Champ « bouton » qui ouvre un sélecteur (ville, type de camion, date...). */
export function SelectButton({
  label,
  value,
  placeholder,
  onPress,
  error,
  icon = 'chevron-down',
}: {
  label: string;
  value?: string;
  placeholder: string;
  onPress: () => void;
  error?: string;
  icon?: IconName;
}) {
  return (
    <View style={styles.field}>
      <Text style={styles.label}>{label}</Text>
      <Pressable
        accessibilityRole="button"
        onPress={onPress}
        style={[styles.input, styles.selectRow, error ? styles.inputError : null]}>
        <Text style={value ? styles.selectValue : styles.selectPlaceholder} numberOfLines={1}>
          {value || placeholder}
        </Text>
        <Ionicons name={icon} size={18} color={Colors.textSecondary} />
      </Pressable>
      {error ? <Text style={styles.error}>{error}</Text> : null}
    </View>
  );
}

/** Flèche « suivant » ou « précédent » qui suit le sens de lecture (inversée en arabe). */
export function Chevron({ direction = 'forward', size, color }: { direction?: 'forward' | 'back'; size: number; color: string }) {
  const pointsForward = (direction === 'forward') !== I18nManager.isRTL;
  return <Ionicons name={pointsForward ? 'chevron-forward' : 'chevron-back'} size={size} color={color} />;
}

export function Card({ children, onPress, style }: { children: ReactNode; onPress?: () => void; style?: StyleProp<ViewStyle> }) {
  if (!onPress) return <View style={[styles.card, style]}>{children}</View>;
  return (
    <Pressable onPress={onPress} style={({ pressed }) => [styles.card, pressed && { opacity: 0.9 }, style]}>
      {children}
    </Pressable>
  );
}

const BADGE_TONES = {
  neutral: { bg: Colors.background, fg: Colors.textSecondary },
  info: { bg: Colors.primarySoft, fg: Colors.primary },
  success: { bg: Colors.successSoft, fg: Colors.success },
  warning: { bg: Colors.warningSoft, fg: Colors.warning },
  danger: { bg: Colors.dangerSoft, fg: Colors.danger },
};
export type BadgeTone = keyof typeof BADGE_TONES;

export function Badge({ label, tone = 'neutral' }: { label: string; tone?: BadgeTone }) {
  const c = BADGE_TONES[tone];
  return (
    <View style={[styles.badge, { backgroundColor: c.bg }]}>
      <Text style={[styles.badgeText, { color: c.fg }]}>{label}</Text>
    </View>
  );
}

export function Chip({ label, selected, onPress }: { label: string; selected?: boolean; onPress: () => void }) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ selected }}
      onPress={onPress}
      style={[styles.chip, selected && styles.chipSelected]}>
      <Text style={[styles.chipText, selected && styles.chipTextSelected]}>{label}</Text>
    </Pressable>
  );
}

export function SectionTitle({ children, action }: { children: ReactNode; action?: ReactNode }) {
  return (
    <View style={styles.sectionRow}>
      <Text style={styles.sectionTitle}>{children}</Text>
      {action}
    </View>
  );
}

export function InfoRow({ icon, label, value }: { icon: IconName; label: string; value: ReactNode }) {
  return (
    <View style={styles.infoRow}>
      <Ionicons name={icon} size={18} color={Colors.textSecondary} />
      <Text style={styles.infoLabel}>{label}</Text>
      <Text style={styles.infoValue}>{value}</Text>
    </View>
  );
}

export function Loading() {
  return (
    <View style={styles.centered}>
      <TruckLoader />
    </View>
  );
}

export function EmptyState({ icon = 'cube-outline', title, message, action }: { icon?: IconName; title: string; message?: string; action?: ReactNode }) {
  return (
    <View style={styles.empty}>
      <Ionicons name={icon} size={44} color={Colors.textMuted} />
      <Text style={styles.emptyTitle}>{title}</Text>
      {message ? <Text style={styles.emptyMessage}>{message}</Text> : null}
      {action}
    </View>
  );
}

export function ErrorState({ message, onRetry }: { message: string; onRetry?: () => void }) {
  return (
    <EmptyState
      icon="cloud-offline-outline"
      title={t('Impossible de charger')}
      message={message}
      action={onRetry ? <Button title={t('Réessayer')} variant="secondary" onPress={onRetry} /> : undefined}
    />
  );
}

export function Banner({ tone = 'info', message, icon = 'information-circle-outline' }: { tone?: BadgeTone; message: string; icon?: IconName }) {
  const c = BADGE_TONES[tone];
  return (
    <View style={[styles.banner, { backgroundColor: c.bg }]}>
      <Ionicons name={icon} size={20} color={c.fg} />
      <Text style={[styles.bannerText, { color: c.fg }]}>{message}</Text>
    </View>
  );
}

export const textStyles = StyleSheet.create({
  heading: { fontSize: FontSize.heading, fontWeight: '700', color: Colors.text },
  title: { fontSize: FontSize.title, fontWeight: '700', color: Colors.text },
  body: { fontSize: FontSize.body, color: Colors.text, lineHeight: 22 },
  secondary: { fontSize: FontSize.small, color: Colors.textSecondary, lineHeight: 20 },
  caption: { fontSize: FontSize.caption, color: Colors.textMuted },
});

const styles = StyleSheet.create({
  flex: { flex: 1 },
  screen: { flex: 1, backgroundColor: Colors.background },
  scrollContent: { padding: Spacing.lg, gap: Spacing.md, flexGrow: 1 },
  footer: {
    padding: Spacing.lg,
    gap: Spacing.sm,
    backgroundColor: Colors.surface,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: Colors.border,
  },
  button: {
    minHeight: 50,
    borderRadius: Radius.md,
    borderWidth: 1.5,
    paddingHorizontal: Spacing.lg,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: Spacing.sm,
  },
  buttonText: { fontSize: FontSize.body, fontWeight: '600' },
  field: { gap: Spacing.xs },
  label: { fontSize: FontSize.small, fontWeight: '600', color: Colors.text },
  input: {
    minHeight: 50,
    borderWidth: 1,
    borderColor: Colors.border,
    borderRadius: Radius.md,
    backgroundColor: Colors.surface,
    paddingHorizontal: Spacing.md,
    fontSize: FontSize.body,
    color: Colors.text,
  },
  multiline: { minHeight: 96, paddingTop: Spacing.md, textAlignVertical: 'top' },
  inputError: { borderColor: Colors.danger },
  error: { fontSize: FontSize.caption, color: Colors.danger },
  hint: { fontSize: FontSize.caption, color: Colors.textMuted },
  selectRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: Spacing.sm },
  selectValue: { flex: 1, fontSize: FontSize.body, color: Colors.text },
  selectPlaceholder: { flex: 1, fontSize: FontSize.body, color: Colors.textMuted },
  card: {
    backgroundColor: Colors.surface,
    borderRadius: Radius.lg,
    padding: Spacing.lg,
    gap: Spacing.sm,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: Colors.border,
  },
  badge: { alignSelf: 'flex-start', borderRadius: Radius.pill, paddingHorizontal: Spacing.sm, paddingVertical: 3 },
  badgeText: { fontSize: FontSize.caption, fontWeight: '600' },
  chip: {
    borderRadius: Radius.pill,
    borderWidth: 1,
    borderColor: Colors.border,
    backgroundColor: Colors.surface,
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.sm,
  },
  chipSelected: { backgroundColor: Colors.primary, borderColor: Colors.primary },
  chipText: { fontSize: FontSize.small, color: Colors.text },
  chipTextSelected: { color: Colors.white, fontWeight: '600' },
  sectionRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: Spacing.sm },
  sectionTitle: { fontSize: FontSize.body, fontWeight: '700', color: Colors.text },
  infoRow: { flexDirection: 'row', alignItems: 'center', gap: Spacing.sm },
  infoLabel: { fontSize: FontSize.small, color: Colors.textSecondary, width: 110 },
  infoValue: { flex: 1, fontSize: FontSize.small, color: Colors.text, fontWeight: '500' },
  centered: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: Spacing.xl },
  empty: { alignItems: 'center', justifyContent: 'center', padding: Spacing.xl, gap: Spacing.sm, flexGrow: 1 },
  emptyTitle: { fontSize: FontSize.body, fontWeight: '700', color: Colors.text, textAlign: 'center' },
  emptyMessage: { fontSize: FontSize.small, color: Colors.textSecondary, textAlign: 'center', marginBottom: Spacing.sm },
  banner: { flexDirection: 'row', gap: Spacing.sm, padding: Spacing.md, borderRadius: Radius.md, alignItems: 'flex-start' },
  bannerText: { flex: 1, fontSize: FontSize.small, lineHeight: 20 },
});
