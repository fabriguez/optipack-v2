import axios, { AxiosError, AxiosRequestConfig } from 'axios';
import { getSession, signOut } from 'next-auth/react';
import { authLog } from './authDebug';

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:4000/api/v1';

export const apiClient = axios.create({
  baseURL: API_URL,
  headers: {
    'Content-Type': 'application/json',
  },
});

// Request interceptor: attache le JWT depuis la session NextAuth
apiClient.interceptors.request.use(async (config) => {
  if (typeof window !== 'undefined') {
    const session = await getSession();
    const token = (session as any)?.accessToken;
    if (token) {
      config.headers.Authorization = `Bearer ${token}`;
    }
  }
  return config;
});

// ============================================================
// Single-flight refresh : evite les races quand N requetes paralleles
// recoivent 401 en meme temps. Un seul refresh part, les autres attendent
// le meme resultat. Sans ca, le 2e refresh utilise un refresh-token deja
// rote (par le 1er) -> 401 backend -> signOut -> deconnexion surprise.
// ============================================================
let refreshInFlight: Promise<string | null> | null = null;
// Compteur de 401 consecutifs apres refresh reussi : si > seuil, on signOut
// (cas reel ou le token est revoque cote serveur). Sinon on tolere des
// requetes deja en vol qui arrivent apres une rotation.
let postRefreshFailures = 0;
const FAILURE_THRESHOLD = 3;

async function performRefresh(): Promise<string | null> {
  authLog('refresh.start');
  // Strategie en 2 temps :
  //
  // 1) Si window.__forceSessionRefresh est dispo (le SessionRefreshBridge est
  //    monte dans le dashboard layout), on declenche un VRAI refresh via
  //    useSession().update({ forceRefresh: true }). Ca pose
  //    accessTokenExpiresAt=0 dans le jwt callback (auth.ts), ce qui force
  //    l'appel a /auth/refresh meme si le token semble encore valide
  //    localement. C'est le cas critique quand l'API rejette le token avant
  //    son exp local (revocation serveur, clock skew, redemarrage API).
  //    Le CSRF est gere nativement par NextAuth ici (pas de raw fetch).
  //
  // 2) Sinon (ex: route hors dashboard), fallback sur getSession() qui ne
  //    refresh que si exp local depasse.
  if (typeof window !== 'undefined' && window.__forceSessionRefresh) {
    try {
      await window.__forceSessionRefresh();
      authLog('refresh.forced-via-bridge');
    } catch (e) {
      authLog('refresh.force-bridge-failed', { err: String(e) });
    }
  } else {
    authLog('refresh.bridge-unavailable');
  }

  const session = await getSession();
  const newToken = (session as any)?.accessToken as string | undefined;
  const sessionError = (session as any)?.error as string | undefined;

  if (sessionError) {
    authLog('refresh.session-error', { sessionError });
    return null;
  }
  if (!newToken) {
    authLog('refresh.no-token');
    return null;
  }
  authLog('refresh.ok', { tokenSuffix: newToken.slice(-12) });
  return newToken;
}

function refreshOnce(): Promise<string | null> {
  if (!refreshInFlight) {
    refreshInFlight = performRefresh().finally(() => {
      // Reset apres petit delai pour absorber les requetes 401 qui arrivent
      // juste apres (elles utiliseront le nouveau token, pas un refresh).
      setTimeout(() => {
        refreshInFlight = null;
      }, 200);
    });
  }
  return refreshInFlight;
}

// ============================================================
// Garde-fou redirect : evite N redirections paralleles.
// ============================================================
let redirecting = false;

function shouldRedirect(): boolean {
  if (typeof window === 'undefined') return false;
  if (redirecting) return false;
  const path = window.location.pathname;
  if (path.startsWith('/login')) return false;
  if (path.startsWith('/portal')) return false;
  return true;
}

function redirectToLogin(reason: string) {
  if (!shouldRedirect()) return;
  authLog('redirect.to-login', { reason });
  redirecting = true;
  signOut({ redirect: false }).finally(() => {
    window.location.href = '/login?reason=' + encodeURIComponent(reason);
  });
}

apiClient.interceptors.response.use(
  (response) => {
    // Reset le compteur d'echecs consecutifs sur toute reponse OK.
    if (postRefreshFailures > 0) postRefreshFailures = 0;
    return response;
  },
  async (error: AxiosError) => {
    const status = error.response?.status;
    const original = error.config as (AxiosRequestConfig & { _retry?: boolean }) | undefined;

    if (status !== 401 || !original || original._retry || typeof window === 'undefined') {
      return Promise.reject(error);
    }

    original._retry = true;
    const url = `${original.method?.toUpperCase()} ${original.url}`;
    authLog('401.intercepted', { url });

    try {
      const newToken = await refreshOnce();
      const oldToken = (original.headers?.Authorization as string | undefined)?.replace(
        /^Bearer\s+/i,
        '',
      );

      if (!newToken) {
        // Refresh KO -> on signOut (le refresh token est mort).
        redirectToLogin('refresh-failed');
        return Promise.reject(error);
      }

      if (newToken === oldToken) {
        // Le refresh n'a pas change le token. Cas pathologique : le serveur
        // rejette quand meme. On compte les echecs avant de signOut pour eviter
        // une deco trop agressive sur un blip reseau.
        postRefreshFailures += 1;
        authLog('401.same-token-after-refresh', { count: postRefreshFailures });
        if (postRefreshFailures >= FAILURE_THRESHOLD) {
          redirectToLogin('repeated-401-after-refresh');
        }
        return Promise.reject(error);
      }

      authLog('401.retry-with-new-token', { url });
      original.headers = {
        ...(original.headers || {}),
        Authorization: `Bearer ${newToken}`,
      };
      return apiClient.request(original);
    } catch (err) {
      authLog('401.refresh-exception', { err: String(err) });
      redirectToLogin('refresh-exception');
      return Promise.reject(error);
    }
  },
);
