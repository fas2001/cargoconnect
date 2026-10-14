import { Ionicons } from '@expo/vector-icons';
import { Redirect } from 'expo-router';
import { Tabs } from 'expo-router/js-tabs';

import { StyleSheet, View } from 'react-native';

import { Colors, Fonts, Shadow } from '@/constants/theme';
import { useAuth } from '@/features/auth/auth-context';
import type { Role } from '@/types/api';

import { NotificationBell } from './notification-bell';
import type { IconName } from './ui';

export type TabSpec = { name: string; title: string; icon: IconName; headerTitle?: string; headerShown?: boolean };

/** Barre d'onglets propre à chaque rôle ; redirige si la session ou le rôle actif ne correspond pas. */
export function RoleTabs({ role, tabs }: { role: Role; tabs: TabSpec[] }) {
  const auth = useAuth();
  if (auth.status !== 'signedIn') return <Redirect href="/" />;
  if (auth.activeRole !== role) return <Redirect href="/" />;

  return (
    <Tabs
      screenOptions={{
        tabBarActiveTintColor: Colors.primary,
        tabBarInactiveTintColor: Colors.textMuted,
        tabBarStyle: styles.tabBar,
        tabBarLabelStyle: styles.tabLabel,
        headerStyle: { backgroundColor: Colors.background },
        headerShadowVisible: false,
        headerTitleStyle: styles.headerTitle,
        headerRight: () => <NotificationBell />,
        sceneStyle: { backgroundColor: Colors.background },
      }}>
      {tabs.map((tab) => (
        <Tabs.Screen
          key={tab.name}
          name={tab.name}
          options={{
            title: tab.title,
            headerTitle: tab.headerTitle ?? tab.title,
            headerShown: tab.headerShown ?? true,
            tabBarIcon: ({ color, focused }) => (
              <View style={[styles.pill, focused && styles.pillActive]}>
                <Ionicons name={tab.icon} color={color} size={22} />
              </View>
            ),
          }}
        />
      ))}
    </Tabs>
  );
}

const styles = StyleSheet.create({
  // Pas de hauteur fixe : la barre ajoute elle-même l'espace de la barre système du téléphone.
  tabBar: { backgroundColor: Colors.surface, borderTopWidth: 0, ...Shadow },
  tabLabel: { fontFamily: Fonts.semibold, fontSize: 11 },
  pill: { width: 52, height: 30, borderRadius: 15, alignItems: 'center', justifyContent: 'center' },
  pillActive: { backgroundColor: Colors.primarySoft },
  headerTitle: { fontFamily: Fonts.bold, fontSize: 18, color: Colors.text },
});
