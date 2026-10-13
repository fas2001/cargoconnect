import { useQuery } from '@tanstack/react-query';
import { router } from 'expo-router';
import { Text } from 'react-native';

import { CargoCard } from '@/components/cargo-card';
import { ShipmentCard } from '@/components/shipment-card';
import { Button, EmptyState, ErrorState, Loading, Screen, SectionTitle, textStyles } from '@/components/ui';
import { useCurrentUser } from '@/features/auth/auth-context';
import { errorMessage } from '@/services/api';
import { api } from '@/services/endpoints';
import { t } from '@/i18n';

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
    <Screen refreshing={refreshing} onRefresh={refresh}>
      <Text style={textStyles.title}>{t('Bonjour {name} 👋', { name: user.full_name.split(' ')[0] })}</Text>
      <Button title={t('Publier une cargaison')} icon="add-circle-outline" onPress={() => router.push('/publish')} />

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
