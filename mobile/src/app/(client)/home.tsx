import { useQuery } from '@tanstack/react-query';
import { router } from 'expo-router';
import { StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { CargoCard } from '@/components/cargo-card';
import { NotificationBell } from '@/components/notification-bell';
import { ShipmentCard } from '@/components/shipment-card';
import { Button, EmptyState, ErrorState, Loading, Screen, SectionTitle, textStyles } from '@/components/ui';
import { Colors, Fonts, Spacing } from '@/constants/theme';
import { useCurrentUser } from '@/features/auth/auth-context';
import { errorMessage } from '@/services/api';
import { api } from '@/services/endpoints';
import { t } from '@/i18n';

/** En-tête sombre arrondi du style « Route » : marque, cloche, salutation et action principale. */
function HomeHero({ firstName }: { firstName: string }) {
  const insets = useSafeAreaInsets();
  return (
    <View style={[styles.hero, { paddingTop: insets.top + Spacing.sm }]}>
      <View style={styles.heroBar}>
        <Text style={styles.brand}>CargoConnect</Text>
        <NotificationBell onDark />
      </View>
      <View style={{ gap: 2 }}>
        <Text style={styles.hello}>{t('Bonjour {name} 👋', { name: firstName })}</Text>
        <Text style={styles.subtitle}>{t("Où partent vos marchandises aujourd'hui ?")}</Text>
      </View>
      <Button title={t('Publier une cargaison')} icon="add-circle-outline" onPress={() => router.push('/publish')} />
    </View>
  );
}

export default function ClientHome() {
  const user = useCurrentUser();
  const shipments = useQuery({ queryKey: ['shipments', 'client', 'active'], queryFn: () => api.shipments('client', 'active') });
  const open = useQuery({ queryKey: ['cargos', 'mine', 'open'], queryFn: () => api.myCargos(['published', 'draft']) });

  const refreshing = shipments.isRefetching || open.isRefetching;
  const refresh = () => {
    void shipments.refetch();
    void open.refetch();
  };

  if (shipments.isLoading || open.isLoading) return <Loading />;
  if (shipments.error || open.error)
    return <ErrorState message={errorMessage(shipments.error ?? open.error)} onRetry={refresh} />;

  const activeShipments = shipments.data?.results ?? [];
  const openCargos = open.data?.results ?? [];

  return (
    <Screen refreshing={refreshing} onRefresh={refresh} hero={<HomeHero firstName={user.full_name.split(' ')[0]} />}>
      <SectionTitle>{t('Transports en cours')}</SectionTitle>
      {activeShipments.length ? (
        activeShipments.map((s) => <ShipmentCard key={s.id} shipment={s} />)
      ) : (
        <Text style={textStyles.secondary}>{t('Aucun transport en cours.')}</Text>
      )}

      <SectionTitle>{t('Annonces ouvertes')}</SectionTitle>
      {openCargos.length ? (
        openCargos.map((c) => (
          <CargoCard key={c.id} cargo={c} showStatus onPress={() => router.push({ pathname: '/cargo/[id]', params: { id: c.id } })} />
        ))
      ) : (
        <EmptyState
          icon="cube-outline"
          title={t('Aucune annonce ouverte')}
          message={t('Publiez votre première cargaison pour recevoir des propositions de transporteurs.')}
        />
      )}
    </Screen>
  );
}

const styles = StyleSheet.create({
  hero: {
    backgroundColor: Colors.header,
    paddingHorizontal: Spacing.lg,
    paddingBottom: Spacing.xl,
    gap: Spacing.lg,
    borderBottomLeftRadius: 28,
    borderBottomRightRadius: 28,
  },
  heroBar: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  brand: { fontFamily: Fonts.bold, fontSize: 18, color: Colors.white },
  hello: { fontFamily: Fonts.bold, fontSize: 24, color: Colors.white },
  subtitle: { fontFamily: Fonts.regular, fontSize: 14, color: 'rgba(255,255,255,0.75)' },
});
