import { Ionicons } from '@expo/vector-icons';
import { Redirect } from 'expo-router';
import { Tabs } from 'expo-router/js-tabs';

import { Colors } from '@/constants/theme';
import { useAuth } from '@/features/auth/auth-context';
import type { Role } from '@/types/api';

import { NotificationBell } from './notification-bell';
import type { IconName } from './ui';

export type TabSpec = { name: string; title: string; icon: IconName; headerTitle?: string };

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
        headerTitleStyle: { color: Colors.text },
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
            tabBarIcon: ({ color, size }) => <Ionicons name={tab.icon} color={color} size={size} />,
          }}
        />
      ))}
    </Tabs>
  );
}
