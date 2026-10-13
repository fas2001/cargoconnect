import { RoleTabs } from '@/components/role-tabs';

export default function DriverLayout() {
  return (
    <RoleTabs
      role="driver"
      tabs={[
        { name: 'cargos-market', title: 'Cargaisons', icon: 'search-outline', headerTitle: 'Cargaisons disponibles' },
        { name: 'my-offers', title: 'Mes offres', icon: 'pricetags-outline' },
        { name: 'missions', title: 'Mes missions', icon: 'navigate-outline' },
        { name: 'driver-profile', title: 'Profil', icon: 'person-circle-outline', headerTitle: 'Mon profil' },
      ]}
    />
  );
}
