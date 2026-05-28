import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { apiClient, setTokenRefreshHandler, setUnauthenticatedHandler } from '@/lib/api/client';
import { storage, STORAGE_KEYS } from '@/lib/storage/storage';

export interface AuthUser {
  id: string;
  email: string;
  firstName?: string;
  lastName?: string;
  name?: string;
  role: string;
  agencyIds: string[];
  organizationId?: string;
}

interface AuthState {
  user: AuthUser | null;
  accessToken: string | null;
  permissions: string[];
  loading: boolean;
}

interface AuthContextValue extends AuthState {
  login: (email: string, password: string) => Promise<void>;
  logout: () => Promise<void>;
  refreshMe: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | null>(null);

function decodePermissionsFromJwt(token: string | null | undefined): string[] {
  if (!token) return [];
  try {
    const payload = token.split('.')[1];
    if (!payload) return [];
    const b64 = payload.replace(/-/g, '+').replace(/_/g, '/');
    const pad = b64.length % 4 === 2 ? '==' : b64.length % 4 === 3 ? '=' : '';
    const decoder: ((s: string) => string) | undefined =
      (globalThis as { atob?: (s: string) => string }).atob;
    const json = decoder
      ? decoder(b64 + pad)
      : (globalThis as { Buffer?: { from(s: string, enc: string): { toString(e: string): string } } })
          .Buffer!.from(b64 + pad, 'base64')
          .toString('utf8');
    const obj = JSON.parse(json) as { permissions?: string[] };
    return obj.permissions ?? [];
  } catch {
    return [];
  }
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<AuthState>({
    user: null,
    accessToken: null,
    permissions: [],
    loading: true,
  });

  const applyToken = useCallback((accessToken: string | null) => {
    setState((s) => ({
      ...s,
      accessToken,
      permissions: decodePermissionsFromJwt(accessToken),
    }));
  }, []);

  const logout = useCallback(async () => {
    await Promise.all([
      storage.remove(STORAGE_KEYS.accessToken),
      storage.remove(STORAGE_KEYS.refreshToken),
      storage.remove(STORAGE_KEYS.user),
    ]);
    setState({ user: null, accessToken: null, permissions: [], loading: false });
  }, []);

  const refreshMe = useCallback(async () => {
    try {
      const { data } = await apiClient.get('/auth/me');
      const user = data?.data as AuthUser;
      if (user) {
        await storage.set(STORAGE_KEYS.user, user);
        setState((s) => ({ ...s, user }));
      }
    } catch {
      // ignore - interceptor handles 401
    }
  }, []);

  const login = useCallback(
    async (email: string, password: string) => {
      const { data } = await apiClient.post('/auth/login', { email, password });
      const payload = data?.data;
      if (!payload?.accessToken) throw new Error('Invalid login response');
      await storage.set(STORAGE_KEYS.accessToken, payload.accessToken);
      if (payload.refreshToken) await storage.set(STORAGE_KEYS.refreshToken, payload.refreshToken);
      if (payload.user) await storage.set(STORAGE_KEYS.user, payload.user);
      setState({
        user: payload.user ?? null,
        accessToken: payload.accessToken,
        permissions: decodePermissionsFromJwt(payload.accessToken),
        loading: false,
      });
    },
    [],
  );

  useEffect(() => {
    setUnauthenticatedHandler(() => {
      setState({ user: null, accessToken: null, permissions: [], loading: false });
    });
    setTokenRefreshHandler(({ accessToken }) => {
      applyToken(accessToken);
    });
  }, [applyToken]);

  useEffect(() => {
    (async () => {
      const [token, user] = await Promise.all([
        storage.get<string>(STORAGE_KEYS.accessToken),
        storage.get<AuthUser>(STORAGE_KEYS.user),
      ]);
      setState({
        user: user ?? null,
        accessToken: token ?? null,
        permissions: decodePermissionsFromJwt(token),
        loading: false,
      });
      if (token) {
        // Background refresh of /me; failures don't block boot.
        refreshMe();
      }
    })();
  }, [refreshMe]);

  const value = useMemo<AuthContextValue>(
    () => ({ ...state, login, logout, refreshMe }),
    [state, login, logout, refreshMe],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used inside AuthProvider');
  return ctx;
}
