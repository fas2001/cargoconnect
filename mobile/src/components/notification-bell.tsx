import { Ionicons } from '@expo/vector-icons';
import { useQuery } from '@tanstack/react-query';
import { router } from 'expo-router';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { Colors, Fonts } from '@/constants/theme';
import { api } from '@/services/endpoints';
import { t } from '@/i18n';

/** Cloche de notifications ; `onDark` pour un fond sombre (en-tête de l'accueil). */
export function NotificationBell({ onDark = false }: { onDark?: boolean }) {
  const { data } = useQuery({ queryKey: ['notifications', 'unread'], queryFn: api.unreadCount, refetchInterval: 60_000 });
  const count = data?.count ?? 0;
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={count ? t('Notifications, {count} non lues', { count }) : t('Notifications')}
      onPress={() => router.push('/notifications')}
      hitSlop={10}
      style={[styles.wrap, onDark && styles.onDark]}>
      <Ionicons name="notifications-outline" size={onDark ? 20 : 24} color={onDark ? Colors.white : Colors.text} />
      {count > 0 ? (
        <View style={styles.dot}>
          <Text style={styles.dotText}>{count > 9 ? '9+' : count}</Text>
        </View>
      ) : null}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  wrap: { marginHorizontal: 12 },
  onDark: {
    marginHorizontal: 0,
    width: 38,
    height: 38,
    borderRadius: 19,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(255,255,255,0.12)',
  },
  dot: {
    position: 'absolute',
    top: -4,
    right: -8,
    minWidth: 18,
    height: 18,
    borderRadius: 9,
    paddingHorizontal: 4,
    backgroundColor: Colors.danger,
    alignItems: 'center',
    justifyContent: 'center',
  },
  dotText: { color: Colors.white, fontSize: 10, fontFamily: Fonts.bold },
});
