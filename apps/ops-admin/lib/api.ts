import axios, { AxiosError } from 'axios';

const ORCHESTRATOR_URL =
  process.env.NEXT_PUBLIC_ORCHESTRATOR_URL || 'http://localhost:4020';

export const api = axios.create({
  baseURL: `${ORCHESTRATOR_URL}/ops`,
  // Phase 5 #36 — auth via cookie httpOnly. Le navigateur envoie le cookie
  // automatiquement avec les requetes cross-origin grace a withCredentials.
  withCredentials: true,
});

api.interceptors.response.use(
  (r) => r,
  (err: AxiosError) => {
    if (err.response?.status === 401 && typeof window !== 'undefined') {
      if (window.location.pathname !== '/login') {
        window.location.href = '/login';
      }
    }
    return Promise.reject(err);
  },
);

/**
 * Heuristique cote client : on tente un /auth/me. Si 200 -> authentifie.
 * (Le cookie etant httpOnly, le JS ne peut pas le lire directement.)
 */
export async function isAuthenticated(): Promise<boolean> {
  try {
    await api.get('/auth/me');
    return true;
  } catch {
    return false;
  }
}

/** Logout : supprime le cookie cote serveur. */
export async function logout(): Promise<void> {
  try {
    await api.post('/auth/logout');
  } catch {
    // best-effort
  }
}
