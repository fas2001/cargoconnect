import { RoleTabs } from '@/components/role-tabs';

export default function ClientLayout() {
  return (
    <RoleTabs
      role="client"
      tabs={[
        { name: 'home', title: 'Accueil', icon: 'home-outline', headerTitle: 'CargoConnect' },
        { name: 'publish', title: 'Publier', icon: 'add-circle-outline', headerTitle: 'Nouvelle annonce' },
        { name: 'my-cargos', title: 'Annonces', icon: 'list-outline', headerTitle: 'Mes annonces' },
        { name: 'client-profile', title: 'Profil', icon: 'person-circle-outline', headerTitle: 'Mon profil' },
      ]}
    />
  );
}
