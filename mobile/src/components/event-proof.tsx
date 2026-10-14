import { Ionicons } from '@expo/vector-icons';
import { Image } from 'expo-image';
import { Linking, Pressable, StyleSheet, Text, View } from 'react-native';

import { Colors, Fonts, FontSize, Spacing } from '@/constants/theme';
import { t } from '@/i18n';
import type { ShipmentEvent } from '@/types/api';

import { SignatureView } from './signature-pad';
import { textStyles } from './ui';

/** Preuves d'une étape de transport : photos, lien vers la position, réceptionnaire et signature. */
export function EventProof({ event }: { event: ShipmentEvent }) {
  if (!event.photos.length && !event.latitude && !event.signature) return null;
  const mapUrl = `https://www.google.com/maps/search/?api=1&query=${event.latitude},${event.longitude}`;
  return (
    <View style={styles.proof}>
      {event.photos.length ? (
        <View style={styles.photos}>
          {event.photos.map((photo) => (
            <Pressable key={photo.id} onPress={() => Linking.openURL(photo.image)} accessibilityRole="imagebutton" accessibilityLabel={t('Voir la photo')}>
              <Image source={photo.image} style={styles.photo} contentFit="cover" />
            </Pressable>
          ))}
        </View>
      ) : null}
      {event.latitude && event.longitude ? (
        <Pressable onPress={() => Linking.openURL(mapUrl)} accessibilityRole="link" style={styles.mapLink}>
          <Ionicons name="location-outline" size={16} color={Colors.primary} />
          <Text style={styles.mapText}>
            {event.location_accuracy_m !== null
              ? t('Voir la position (±{meters} m)', { meters: Math.round(event.location_accuracy_m) })
              : t('Voir la position')}
          </Text>
        </Pressable>
      ) : null}
      {event.receiver_name ? <Text style={textStyles.secondary}>{t('Réceptionné par {name}', { name: event.receiver_name })}</Text> : null}
      {event.signature ? <SignatureView path={event.signature} /> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  proof: { gap: Spacing.xs, marginTop: Spacing.xs },
  photos: { flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.xs },
  photo: { width: 64, height: 64, borderRadius: 8, backgroundColor: Colors.border },
  mapLink: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  mapText: { fontSize: FontSize.small, color: Colors.primary, fontFamily: Fonts.semibold },
});
