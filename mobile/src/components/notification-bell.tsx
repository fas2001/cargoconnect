import { Ionicons } from '@expo/vector-icons';
import { useQuery } from '@tanstack/react-query';
import { router } from 'expo-router';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { Colors } from '@/constants/theme';
import { api } from '@/services/endpoints';
import { t } from '@/i18n';

export function NotificationBell() {
  const { data } = useQuery({ queryKey: ['notifications', 'unread'], queryFn: api.unreadCount, refetchInterval: 60_000 });
  const count = data?.count ?? 0;
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={count ? t('Notifications, {count} non lues', { count }) : t('Notifications')}
      onPress={() => router.push('/notifications')}
      hitSlop={10}
      style={styles.wrap}>
      <Ionicons name="notifications-outline" size={24} color={Colors.text} />
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
  dotText: { color: Colors.white, fontSize: 10, fontWeight: '700' },
});
