import { Platform } from 'react-native';

/**
 * Style « Route » : bleu nuit (marque, textes) et orange cabine de camion (actions).
 * L'orange des boutons est assez foncé pour que le texte blanc reste lisible.
 */
export const Colors = {
  primary: '#0E1B2C', // bleu nuit : marque, icônes, liens, éléments sélectionnés
  primaryDark: '#060E18',
  primarySoft: '#FFEBDB', // fond orangé clair : pastilles, icônes, zones d'action douces
  cta: '#E35F00', // orange des boutons d'action principaux
  ctaPressed: '#C45200',
  accent: '#FF7A1A', // orange vif : flèches de trajet, étoiles, points de notification
  header: '#0E1B2C', // en-têtes sombres (accueil)
  background: '#EEF2F7',
  surface: '#FFFFFF',
  border: '#E1E7EF',
  text: '#0E1B2C',
  textSecondary: '#55657A',
  textMuted: '#8A97A8',
  success: '#1E8E5A',
  successSoft: '#E3F4EC',
  warning: '#B35A00',
  warningSoft: '#FFF1E2',
  danger: '#C53030',
  dangerSoft: '#FDE8E8',
  white: '#FFFFFF',
} as const;

/** IBM Plex Sans Arabic : une seule famille pour le français et l'arabe, une police par graisse. */
export const Fonts = {
  regular: 'IBMPlexSansArabic_400Regular',
  medium: 'IBMPlexSansArabic_500Medium',
  semibold: 'IBMPlexSansArabic_600SemiBold',
  bold: 'IBMPlexSansArabic_700Bold',
} as const;

export const Spacing = {
  xs: 4,
  sm: 8,
  md: 12,
  lg: 16,
  xl: 24,
  xxl: 32,
} as const;

export const Radius = {
  sm: 8,
  md: 14,
  lg: 20,
  pill: 999,
} as const;

export const FontSize = {
  caption: 12,
  small: 14,
  body: 16,
  title: 20,
  heading: 26,
} as const;

/** Ombre douce des cartes (les cartes n'ont plus de bordure). */
export const Shadow = Platform.select({
  web: { boxShadow: '0 6px 18px rgba(14, 27, 44, 0.08)' },
  default: {
    shadowColor: '#0E1B2C',
    shadowOpacity: 0.08,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 6 },
    elevation: 3,
  },
}) as object;
