import { Redirect, Stack } from 'expo-router';

import { Colors } from '@/constants/theme';
import { useAuth } from '@/features/auth/auth-context';
import { t } from '@/i18n';

export default function AuthLayout() {
  const { status } = useAuth();
  if (status === 'signedIn') return <Redirect href="/" />;

  return (
    <Stack
      screenOptions={{
        headerTintColor: Colors.primary,
        headerTitleStyle: { color: Colors.text },
        headerShadowVisible: false,
        headerStyle: { backgroundColor: Colors.background },
        contentStyle: { backgroundColor: Colors.background },
        headerBackButtonDisplayMode: 'minimal',
      }}>
      <Stack.Screen name="welcome" options={{ headerShown: false }} />
      <Stack.Screen name="login" options={{ title: t('Connexion') }} />
      <Stack.Screen name="register" options={{ title: t('Créer un compte') }} />
      <Stack.Screen name="forgot-password" options={{ title: t('Mot de passe oublié') }} />
    </Stack>
  );
}
