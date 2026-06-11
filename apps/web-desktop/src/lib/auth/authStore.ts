import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import { authLog } from '@/lib/api/authDebug';
import { secureStorage } from './secureStorage';

// ============================================================
// Store d'authentification (remplace next-auth cote desktop SPA).
//
// Garde un comportement FIDELE au web :
//  - login/refresh frappent directement /auth/* via raw fetch (PAS apiClient,
//    pour eviter la recursion avec l'interceptor 401 -> refresh) ;
//  - meme decodage du claim `exp` du JWT pour connaitre la VRAIE expiration ;
//  - meme retry doux (2 tentatives) au refresh, meme distinction
//    definitif (401/403 -> RefreshFailed) vs transitoire (soft-fail) ;
//  - les permissions ABAC ne sont PAS stockees : elles vivent dans le claim
//    `permissions` du JWT, decodees a la demande par usePermission().
//
// SECURITE : les tokens sont persistes dans le TROUSSEAU OS (Keychain macOS /
// Credential Manager Windows / Secret Service Linux) via secureStorage, et
// NON dans le localStorage (qui serait lisible par tout JS de la webview).
// ============================================================

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:4000/api/v1';

export interface AuthUser {
  id: string;
  email: string;
  name: string;
  role: string;
  agencyIds?: string[];
}

export type AuthStatus = 'loading' | 'authenticated' | 'unauthenticated';

interface AuthState {
  accessToken: string | null;
  refreshToken: string | null;
  accessTokenExpiresAt: number | null;
  user: AuthUser | null;
  error?: string;
  status: AuthStatus;
  /** Login email/mdp. Throw un CODE d'erreur (mirroir authorize() web). */
  login: (email: string, password: string) => Promise<AuthUser>;
  /** Rotation du token. Retourne le nouveau token, l'ancien (soft-fail) ou null. */
  refresh: () => Promise<string | null>;
  /** Deconnexion : best-effort cote API + purge locale. */
  logout: () => Promise<void>;
  /** Purge locale immediate (utilise par l'interceptor sur refresh KO). */
  clear: () => void;
}

/** Decode le claim `exp` (epoch s) d'un JWT sans verifier la signature. */
function jwtExpMs(token: string): number | null {
  try {
    const payload = token.split('.')[1];
    if (!payload) return null;
    const json = atob(payload.replace(/-/g, '+').replace(/_/g, '/'));
    const obj = JSON.parse(json) as { exp?: number };
    return obj?.exp ? obj.exp * 1000 : null;
  } catch {
    return null;
  }
}

export const useAuthStore = create<AuthState>()(
  persist(
    (set, get) => ({
      accessToken: null,
      refreshToken: null,
      accessTokenExpiresAt: null,
      user: null,
      error: undefined,
      status: 'loading',

      login: async (email, password) => {
        // Etape 1 : reseau. On differencie "API injoignable" d'un "mauvais
        // mot de passe" pour afficher le bon message cote UI.
        let res: Response;
        try {
          res = await fetch(`${API_URL}/auth/login`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ email, password }),
          });
        } catch (err) {
          authLog('login.network-error', { err: String(err) });
          throw new Error('NETWORK_ERROR');
        }

        let data: any = null;
        try {
          data = await res.json();
        } catch {
          /* reponse non-JSON : traitee comme erreur ci-dessous */
        }

        // Etape 2 : statut HTTP. 401/422 = creds invalides, 5xx = API en
        // erreur, autre = inconnu.
        if (!res.ok || !data?.success) {
          if (res.status === 401 || res.status === 422) throw new Error('INVALID_CREDENTIALS');
          if (res.status >= 500) throw new Error('SERVER_ERROR');
          throw new Error('UNKNOWN_ERROR');
        }
        if (data.data.requires2FA) throw new Error('2FA_REQUIRED');

        const accessToken = data.data.accessToken as string;
        const refreshToken = data.data.refreshToken as string;
        const realExp = jwtExpMs(accessToken);
        const u = data.data.user;
        const user: AuthUser = {
          id: u.id,
          email: u.email,
          name: `${u.firstName} ${u.lastName}`,
          role: u.role,
          agencyIds: u.agencyIds,
        };

        set({
          accessToken,
          refreshToken,
          accessTokenExpiresAt: realExp ?? Date.now() + 12 * 60 * 60 * 1000,
          user,
          error: undefined,
          status: 'authenticated',
        });
        authLog('login.ok', { ttlSec: realExp ? Math.floor((realExp - Date.now()) / 1000) : null });
        return user;
      },

      refresh: async () => {
        const refreshToken = get().refreshToken;
        if (!refreshToken) {
          authLog('refresh.no-refresh-token');
          return null;
        }
        authLog('refresh.start');

        // Retry doux : 2 tentatives avec backoff (~600ms). Un seul blip reseau
        // ne doit pas condamner la session.
        let lastErr: unknown = null;
        for (let attempt = 0; attempt < 2; attempt++) {
          try {
            const res = await fetch(`${API_URL}/auth/refresh`, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ refreshToken }),
            });
            const data = await res.json().catch(() => ({} as any));
            if (res.ok && data?.success && data?.data?.accessToken) {
              const newToken = data.data.accessToken as string;
              const realExp = jwtExpMs(newToken);
              set({
                accessToken: newToken,
                refreshToken: data.data.refreshToken ?? refreshToken,
                accessTokenExpiresAt: realExp ?? Date.now() + 12 * 60 * 60 * 1000,
                error: undefined,
                status: 'authenticated',
              });
              authLog('refresh.ok', { tokenSuffix: newToken.slice(-12), attempt: attempt + 1 });
              return newToken;
            }
            // Definitif (401/403) : refresh token revoque -> RefreshFailed.
            if (res.status === 401 || res.status === 403) {
              authLog('refresh.definitive', { status: res.status });
              set({ error: 'RefreshFailed' });
              return null;
            }
            lastErr = `HTTP ${res.status}`;
          } catch (err) {
            lastErr = err;
          }
          if (attempt === 0) await new Promise((r) => setTimeout(r, 600));
        }

        // SOFT-FAIL : serveur indisponible. On NE condamne PAS la session : on
        // garde l'accessToken courant (potentiellement expire) en place. Le
        // prochain cycle retentera. On retourne le token courant inchange pour
        // que l'interceptor compte un echec "meme token" plutot que de
        // deconnecter.
        authLog('refresh.soft-fail', { err: String(lastErr) });
        return get().accessToken;
      },

      logout: async () => {
        const token = get().accessToken;
        try {
          if (token) {
            await fetch(`${API_URL}/auth/logout`, {
              method: 'POST',
              headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
            });
          }
        } catch {
          /* best-effort : on purge quoi qu'il arrive */
        }
        get().clear();
      },

      clear: () => {
        set({
          accessToken: null,
          refreshToken: null,
          accessTokenExpiresAt: null,
          user: null,
          error: undefined,
          status: 'unauthenticated',
        });
        authLog('auth.cleared');
      },
    }),
    {
      name: 'optipack.auth',
      storage: createJSONStorage(() => secureStorage),
      partialize: (s) => ({
        accessToken: s.accessToken,
        refreshToken: s.refreshToken,
        accessTokenExpiresAt: s.accessTokenExpiresAt,
        user: s.user,
      }),
      // A la rehydratation : derive le statut depuis la presence d'un token.
      // IMPORTANT : muter `state` ici n'est PAS applique au store par zustand
      // (le merge a deja eu lieu, et `status` est exclu de partialize) -> on
      // DOIT passer par setState, sinon le statut reste 'loading' et l'app
      // calle indefiniment sur le skeleton (RequireAuth).
      onRehydrateStorage: () => (state, error) => {
        useAuthStore.setState({
          status: !error && state?.accessToken ? 'authenticated' : 'unauthenticated',
        });
      },
    },
  ),
);
