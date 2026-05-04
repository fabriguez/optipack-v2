import axios, { AxiosError, AxiosRequestConfig } from 'axios';
import { getSession, signOut } from 'next-auth/react';

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

// Petit verrou : evite d'enchainer N redirections quand N requetes paralleles tapent 401.
let redirecting = false;

function shouldRedirect(): boolean {
  if (typeof window === 'undefined') return false;
  if (redirecting) return false;
  const path = window.location.pathname;
  if (path.startsWith('/login')) return false;
  if (path.startsWith('/portal')) return false;
  return true;
}

function redirectToLogin() {
  if (!shouldRedirect()) return;
  redirecting = true;
  // signOut nettoie la session NextAuth (sinon boucle si le JWT est mort)
  signOut({ redirect: false }).finally(() => {
    window.location.href = '/login';
  });
}

// Response interceptor :
// 401 -> on tente UNE fois de re-recuperer la session (NextAuth rafraichit le token via le
// callback jwt qui appelle /auth/refresh si expire), puis retry. Si toujours 401 -> /login.
apiClient.interceptors.response.use(
  (response) => response,
  async (error: AxiosError) => {
    const status = error.response?.status;
    const original = error.config as (AxiosRequestConfig & { _retry?: boolean }) | undefined;

    if (status === 401 && original && !original._retry && typeof window !== 'undefined') {
      original._retry = true;
      try {
        const session = await getSession();
        const newToken = (session as any)?.accessToken;
        const sessionError = (session as any)?.error;

        if (newToken && !sessionError) {
          original.headers = {
            ...(original.headers || {}),
            Authorization: `Bearer ${newToken}`,
          };
          return apiClient.request(original);
        }
      } catch {
        // ignore - on tombe sur la redirection ci-dessous
      }
      redirectToLogin();
    }

    return Promise.reject(error);
  },
);
