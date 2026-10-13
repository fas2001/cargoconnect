import { RoleTabs } from '@/components/role-tabs';
import { t } from '@/i18n';

export default function DriverLayout() {
  return (
    <RoleTabs
      role="driver"
      tabs={[
        { name: 'cargos-market', title: t('Cargaisons'), icon: 'search-outline', headerTitle: t('Cargaisons disponibles') },
        { name: 'my-offers', title: t('Mes offres'), icon: 'pricetags-outline' },
        { name: 'missions', title: t('Mes missions'), icon: 'navigate-outline' },
        { name: 'driver-profile', title: t('Profil'), icon: 'person-circle-outline', headerTitle: t('Mon profil') },
      ]}
    />
  );
}
