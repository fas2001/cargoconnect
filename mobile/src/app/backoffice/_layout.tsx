import { Redirect, Stack } from 'expo-router';

import { NotificationBell } from '@/components/notification-bell';
import { Colors, Fonts } from '@/constants/theme';
import { useAuth } from '@/features/auth/auth-context';

/** Espace « Administration » : réservé aux comptes de l'équipe (le serveur le vérifie aussi). */
export default function BackofficeLayout() {
  const auth = useAuth();
  if (auth.status !== 'signedIn' || !auth.user.is_staff) return <Redirect href="/" />;

  return (
    <Stack
      screenOptions={{
        headerTintColor: Colors.primary,
        headerTitleStyle: { color: Colors.text, fontFamily: Fonts.bold, fontSize: 18 },
        headerStyle: { backgroundColor: Colors.background },
        headerShadowVisible: false,
        headerBackButtonDisplayMode: 'minimal',
        contentStyle: { backgroundColor: Colors.background },
        headerRight: () => <NotificationBell />,
      }}>
      <Stack.Screen name="index" options={{ title: 'Administration' }} />
      <Stack.Screen name="drivers" options={{ title: 'Transporteurs' }} />
      <Stack.Screen name="driver/[id]" options={{ title: 'Transporteur' }} />
      <Stack.Screen name="identities" options={{ title: 'Identités clients' }} />
      <Stack.Screen name="identity/[id]" options={{ title: 'Identité client' }} />
      <Stack.Screen name="users" options={{ title: 'Comptes' }} />
      <Stack.Screen name="cargos" options={{ title: 'Annonces' }} />
      <Stack.Screen name="shipments" options={{ title: 'Transports' }} />
      <Stack.Screen name="shipment/[id]" options={{ title: 'Dossier de transport' }} />
      <Stack.Screen name="reports" options={{ title: 'Signalements' }} />
    </Stack>
  );
}
