import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { apiClient, setUnauthenticatedHandler } from '@/lib/api/client';
import { portalApi } from '@/lib/api/portal';
import { storage, STORAGE_KEYS } from '@/lib/storage/storage';

export interface ClientUser {
  id: string;
  email: string;
  fullName: string;
  phone?: string;
}

interface AuthState {
  user: ClientUser | null;
  accessToken: string | null;
  loading: boolean;
}

interface AuthContextValue extends AuthState {
  login: (email: string, password: string) => Promise<void>;
  register: (data: { fullName: string; email: string; phone: string; password: string }) => Promise<void>;
  logout: () => Promise<void>;
  refreshMe: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<AuthState>({
    user: null,
    accessToken: null,
    loading: true,
  });

  const logout = useCallback(async () => {
    await Promise.all([
      storage.remove(STORAGE_KEYS.accessToken),
      storage.remove(STORAGE_KEYS.refreshToken),
      storage.remove(STORAGE_KEYS.user),
    ]);
    setState({ user: null, accessToken: null, loading: false });
  }, []);

  const persistSession = useCallback(async (payload: any) => {
    if (!payload?.accessToken) throw new Error('Invalid auth response');
    await storage.set(STORAGE_KEYS.accessToken, payload.accessToken);
    if (payload.refreshToken) await storage.set(STORAGE_KEYS.refreshToken, payload.refreshToken);
    if (payload.user) await storage.set(STORAGE_KEYS.user, payload.user);
    setState({ user: payload.user ?? null, accessToken: payload.accessToken, loading: false });
  }, []);

  const login = useCallback(
    async (email: string, password: string) => {
      const data = await portalApi.login(email, password);
      await persistSession(data?.data);
    },
    [persistSession],
  );

  const register = useCallback(
    async (input: { fullName: string; email: string; phone: string; password: string }) => {
      const data = await portalApi.register(input);
      await persistSession(data?.data);
    },
    [persistSession],
  );

  const refreshMe = useCallback(async () => {
    try {
      const data = await portalApi.me();
      const user = data?.data as ClientUser;
      if (user) {
        await storage.set(STORAGE_KEYS.user, user);
        setState((s) => ({ ...s, user }));
      }
    } catch {}
  }, []);

  useEffect(() => {
    setUnauthenticatedHandler(() => {
      setState({ user: null, accessToken: null, loading: false });
    });
  }, []);

  useEffect(() => {
    (async () => {
      const [token, user] = await Promise.all([
        storage.get<string>(STORAGE_KEYS.accessToken),
        storage.get<ClientUser>(STORAGE_KEYS.user),
      ]);
      setState({ user: user ?? null, accessToken: token ?? null, loading: false });
      if (token) refreshMe();
    })();
  }, [refreshMe]);

  const value = useMemo<AuthContextValue>(
    () => ({ ...state, login, register, logout, refreshMe }),
    [state, login, register, logout, refreshMe],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used inside AuthProvider');
  return ctx;
}

// Helper untyped — explicit imports for unused
void apiClient;
