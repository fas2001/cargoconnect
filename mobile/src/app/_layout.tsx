import {
  IBMPlexSansArabic_400Regular,
  IBMPlexSansArabic_500Medium,
  IBMPlexSansArabic_600SemiBold,
  IBMPlexSansArabic_700Bold,
  useFonts,
} from '@expo-google-fonts/ibm-plex-sans-arabic';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { Stack } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import { StatusBar } from 'expo-status-bar';
import { useEffect, useState } from 'react';

import { Colors, Fonts } from '@/constants/theme';
import { AuthProvider, useAuth } from '@/features/auth/auth-context';
import { ApiError } from '@/services/api';
import { initLanguage, t, useLanguage } from '@/i18n';

SplashScreen.preventAutoHideAsync();

function createQueryClient() {
  return new QueryClient({
    defaultOptions: {
      queries: {
        staleTime: 30_000,
        // Réseau mobile instable : on réessaie, sauf pour les erreurs « métier » (4xx).
        retry: (count, error) => !(error instanceof ApiError && error.status >= 400 && error.status < 500) && count < 2,
      },
    },
  });
}

function RootNavigator() {
  const { status } = useAuth();

  useEffect(() => {
    if (status !== 'loading') SplashScreen.hideAsync();
  }, [status]);

  if (status === 'loading') return null;

  return (
    <Stack
      screenOptions={{
        headerTintColor: Colors.primary,
        headerTitleStyle: { color: Colors.text, fontFamily: Fonts.bold, fontSize: 18 },
        headerStyle: { backgroundColor: Colors.background },
        headerShadowVisible: false,
        headerBackButtonDisplayMode: 'minimal',
        contentStyle: { backgroundColor: Colors.background },
      }}>
      <Stack.Screen name="index" options={{ headerShown: false }} />
      <Stack.Screen name="(auth)" options={{ headerShown: false }} />
      <Stack.Screen name="(client)" options={{ headerShown: false }} />
      <Stack.Screen name="(driver)" options={{ headerShown: false }} />
      <Stack.Screen name="cargo/[id]" options={{ title: t('Annonce') }} />
      <Stack.Screen name="shipment/[id]" options={{ title: t('Transport') }} />
      <Stack.Screen name="vehicles" options={{ title: t('Mes véhicules') }} />
      <Stack.Screen name="documents" options={{ title: t('Mes justificatifs') }} />
      <Stack.Screen name="identity" options={{ title: t('Mon identité') }} />
      <Stack.Screen name="account" options={{ title: t('Mon compte') }} />
      <Stack.Screen name="notifications" options={{ title: t('Notifications') }} />
    </Stack>
  );
}

export default function RootLayout() {
  const [queryClient] = useState(createQueryClient);
  const [languageReady, setLanguageReady] = useState(false);
  const language = useLanguage();
  const [fontsLoaded, fontError] = useFonts({
    IBMPlexSansArabic_400Regular,
    IBMPlexSansArabic_500Medium,
    IBMPlexSansArabic_600SemiBold,
    IBMPlexSansArabic_700Bold,
  });

  // La langue doit être connue avant le premier affichage (textes et sens de lecture).
  useEffect(() => {
    void initLanguage().finally(() => setLanguageReady(true));
  }, []);

  // Police non chargée (rare) : l'app s'affiche quand même, avec la police du téléphone.
  if (!languageReady || (!fontsLoaded && !fontError)) return null;

  return (
    <QueryClientProvider client={queryClient}>
      <AuthProvider>
        <StatusBar style="dark" />
        <RootNavigator key={language} />
      </AuthProvider>
    </QueryClientProvider>
  );
}
