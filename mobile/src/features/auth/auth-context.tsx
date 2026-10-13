import { useQueryClient } from '@tanstack/react-query';
import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';

import { setSessionExpiredHandler } from '@/services/api';
import { api } from '@/services/endpoints';
import { tokenStorage } from '@/services/token-storage';
import type { AuthResponse, RegisterData, Role, User } from '@/types/api';

type AuthState =
  | { status: 'loading'; user: null; activeRole: null }
  | { status: 'signedOut'; user: null; activeRole: null }
  | { status: 'signedIn'; user: User; activeRole: Role };

type AuthContextValue = AuthState & {
  login: (phone: string, password: string) => Promise<void>;
  register: (data: RegisterData) => Promise<void>;
  logout: () => Promise<void>;
  refreshUser: () => Promise<User | null>;
};

const AuthContext = createContext<AuthContextValue | null>(null);

const SIGNED_OUT: AuthState = { status: 'signedOut', user: null, activeRole: null };

export function AuthProvider({ children }: { children: ReactNode }) {
  const queryClient = useQueryClient();
  const [state, setState] = useState<AuthState>({ status: 'loading', user: null, activeRole: null });

  // Un compte a un seul rôle, choisi à l'inscription : il détermine l'espace affiché.
  const signIn = useCallback((user: User) => {
    setState({ status: 'signedIn', user, activeRole: user.roles[0] });
  }, []);

  const signOutLocally = useCallback(async () => {
    await tokenStorage.clear();
    queryClient.clear();
    setState(SIGNED_OUT);
  }, [queryClient]);

  // Restauration de session au démarrage.
  useEffect(() => {
    setSessionExpiredHandler(() => {
      void signOutLocally();
    });
    (async () => {
      if (!(await tokenStorage.getAccess())) {
        setState(SIGNED_OUT);
        return;
      }
      try {
        signIn(await api.me());
      } catch {
        // Hors ligne ou session expirée : retour à l'écran de connexion.
        setState(SIGNED_OUT);
      }
    })();
  }, [signIn, signOutLocally]);

  const handleAuth = useCallback(
    async (response: AuthResponse) => {
      await tokenStorage.setTokens(response.access, response.refresh);
      signIn(response.user);
    },
    [signIn],
  );

  const value = useMemo<AuthContextValue>(
    () => ({
      ...state,
      login: async (phone, password) => handleAuth(await api.login({ phone, password })),
      register: async (data) => handleAuth(await api.register(data)),
      logout: async () => {
        const refresh = await tokenStorage.getRefresh();
        if (refresh) await api.logout(refresh).catch(() => undefined);
        await signOutLocally();
      },
      refreshUser: async () => {
        try {
          const user = await api.me();
          setState((prev) => (prev.status === 'signedIn' ? { ...prev, user, activeRole: user.roles[0] } : prev));
          return user;
        } catch {
          return null;
        }
      },
    }),
    [state, handleAuth, signOutLocally],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth doit être utilisé dans <AuthProvider>.');
  return ctx;
}

/** Pour les écrans des espaces connectés : l'utilisateur est garanti par le layout. */
export function useCurrentUser(): User {
  const auth = useAuth();
  if (auth.status !== 'signedIn') throw new Error('Utilisateur non connecté.');
  return auth.user;
}
