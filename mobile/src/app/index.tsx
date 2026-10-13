import { Redirect } from 'expo-router';

import { useAuth } from '@/features/auth/auth-context';

/** Aiguillage initial selon la session et le rôle actif. */
export default function Index() {
  const auth = useAuth();
  if (auth.status === 'loading') return null;
  if (auth.status === 'signedOut') return <Redirect href="/welcome" />;
  if (!auth.activeRole) return <Redirect href="/role" />;
  return <Redirect href={auth.activeRole === 'driver' ? '/cargos-market' : '/home'} />;
}
