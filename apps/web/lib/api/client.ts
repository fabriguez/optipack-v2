import axios, { AxiosError, AxiosRequestConfig } from 'axios';
import { getSession, signOut } from 'next-auth/react';
import { toast } from 'sonner';
import { authLog } from './authDebug';
import {
  isQueueableMethod,
  offlineQueue,
  OfflineQueuedError,
  shouldQueueOnError,
} from './offlineQueue';

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
//
// Seuil eleve a 5 (vs 3) et fenetre a 60s (vs 30s) : les incidents serveur
// transitoires (redeploiement, blip nginx) provoquent typiquement 2-3 401
// en rafale ; on veut survivre a ca SANS deconnecter le user. Les vrais
// tokens revoques continueront a echouer en boucle et finiront par sortir.
let postRefreshFailures = 0;
let lastFailureAt = 0;
const FAILURE_THRESHOLD = 5;
const FAILURE_WINDOW_MS = 60_000;

function bumpFailures(): number {
  const now = Date.now();
  if (now - lastFailureAt > FAILURE_WINDOW_MS) {
    postRefreshFailures = 0;
  }
  lastFailureAt = now;
  postRefreshFailures += 1;
  return postRefreshFailures;
}

async function performRefresh(): Promise<string | null> {
  authLog('refresh.start');
  // Strategie : on appelle update({forceRefresh: true}) via le bridge, et on
  // utilise DIRECTEMENT la session retournee par update() au lieu de refaire
  // un getSession() apres coup. Le getSession() post-update peut renvoyer
  // une valeur cachee (race entre la mise a jour cookie et la lecture), ce
  // qui produit le symptome "le tokenSuffix ne change pas apres refresh"
  // observe en prod sur iOS.
  let updatedSession: any = null;
  if (typeof window !== 'undefined' && window.__forceSessionRefresh) {
    try {
      updatedSession = await window.__forceSessionRefresh();
      authLog('refresh.forced-via-bridge');
    } catch (e) {
      authLog('refresh.force-bridge-failed', { err: String(e) });
    }
  } else {
    authLog('refresh.bridge-unavailable');
  }

  // Si update() a renvoye une session, on l'utilise telle quelle. Sinon
  // fallback sur getSession() (route hors dashboard, bridge indisponible).
  const session = updatedSession ?? (await getSession());
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
  authLog('refresh.ok', {
    tokenSuffix: newToken.slice(-12),
    via: updatedSession ? 'update-return' : 'getSession-fallback',
  });
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

// Mapping technique -> message utilisateur. Affiche en toast AVANT de
// rediriger pour que la deconnexion ne soit pas surprenante.
const REDIRECT_MESSAGES: Record<string, string> = {
  'refresh-failed': 'Votre session a expire. Reconnectez-vous.',
  'refresh-exception': 'Erreur reseau pendant le rafraichissement de session.',
  'repeated-401-after-refresh':
    'Le serveur a refuse plusieurs requetes consecutives. Reconnectez-vous.',
};

function redirectToLogin(reason: string) {
  if (!shouldRedirect()) return;
  authLog('redirect.to-login', { reason });
  redirecting = true;
  // Toast 800ms avant le redirect : le user voit pourquoi il bouge vers le
  // login (sinon c'est juste un saut silencieux). Le ?reason= reste pose
  // pour visibilite sur la page login.
  const msg = REDIRECT_MESSAGES[reason] || 'Session terminee. Reconnectez-vous.';
  toast.error(msg, { duration: 4000 });
  setTimeout(() => {
    signOut({ redirect: false }).finally(() => {
      window.location.href = '/login?reason=' + encodeURIComponent(reason);
    });
  }, 800);
}

apiClient.interceptors.response.use(
  (response) => {
    // Reset le compteur d'echecs consecutifs sur toute reponse OK.
    if (postRefreshFailures > 0) postRefreshFailures = 0;
    return response;
  },
  async (error: AxiosError) => {
    const status = error.response?.status;
    const original = error.config as (AxiosRequestConfig & { _retry?: boolean; _queued?: boolean }) | undefined;

    // -----------------------------------------------------------------
    // Mode hors-ligne : on intercepte les mutations qui echouent sans
    // reponse (vrai offline / dns / timeout) et on les met en queue pour
    // rejouer plus tard. Les GET ne sont pas concernes (pas de donnees
    // a "produire" hors-ligne -- React Query gere le cache local).
    // FormData (uploads) non queueable : trop gros pour localStorage,
    // on laisse l'erreur remonter pour signaler le probleme a l'utilisateur.
    // -----------------------------------------------------------------
    if (
      original &&
      !original._queued &&
      typeof window !== 'undefined' &&
      shouldQueueOnError(error) &&
      isQueueableMethod(original.method)
    ) {
      const isFormData =
        typeof FormData !== 'undefined' && original.data instanceof FormData;
      if (!isFormData) {
        original._queued = true;
        const entry = offlineQueue.enqueue({
          method: original.method!.toUpperCase() as never,
          url: original.url ?? '',
          data: original.data,
          params: original.params,
        });
        authLog('offline.queued', {
          method: entry.method,
          url: entry.url,
          pending: offlineQueue.count(),
        });
        return Promise.reject(new OfflineQueuedError(entry));
      }
    }

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
        // rejette quand meme. On compte les echecs avec une fenetre glissante
        // de 30s : seuls des echecs RAPPROCHES s'agregent (vrai probleme).
        // Sinon on reset -- evite que 2 incidents espaces d'une heure
        // s'accumulent et declenchent un signOut surprise.
        const count = bumpFailures();
        authLog('401.same-token-after-refresh', {
          count,
          oldSuffix: oldToken?.slice(-12),
          newSuffix: newToken.slice(-12),
        });
        if (count >= FAILURE_THRESHOLD) {
          redirectToLogin('repeated-401-after-refresh');
        }
        return Promise.reject(error);
      }
      // Reset du compteur des qu'on a un VRAI nouveau token (sinon il s'accumule
      // entre des echecs de refresh espaces, ce qui declenche un signOut
      // surprise sur le 2e cycle).
      postRefreshFailures = 0;

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
