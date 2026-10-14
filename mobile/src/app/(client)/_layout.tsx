import { RoleTabs } from '@/components/role-tabs';
import { t } from '@/i18n';

export default function ClientLayout() {
  return (
    <RoleTabs
      role="client"
      tabs={[
        { name: 'home', title: t('Accueil'), icon: 'home-outline', headerShown: false },
        { name: 'publish', title: t('Publier'), icon: 'add-circle-outline', headerTitle: t('Nouvelle annonce') },
        { name: 'my-cargos', title: t('Annonces'), icon: 'list-outline', headerTitle: t('Mes annonces') },
        { name: 'client-profile', title: t('Profil'), icon: 'person-circle-outline', headerTitle: t('Mon profil') },
      ]}
    />
  );
}
