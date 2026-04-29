import axios, { AxiosError } from 'axios';

const ORCHESTRATOR_URL =
  process.env.NEXT_PUBLIC_ORCHESTRATOR_URL || 'http://localhost:4020';

export const api = axios.create({
  baseURL: `${ORCHESTRATOR_URL}/ops`,
  withCredentials: false,
});

api.interceptors.request.use((cfg) => {
  if (typeof window !== 'undefined') {
    const tok = localStorage.getItem('ops_token');
    if (tok) cfg.headers.Authorization = `Bearer ${tok}`;
  }
  return cfg;
});

api.interceptors.response.use(
  (r) => r,
  (err: AxiosError) => {
    if (err.response?.status === 401 && typeof window !== 'undefined') {
      localStorage.removeItem('ops_token');
      if (window.location.pathname !== '/login') {
        window.location.href = '/login';
      }
    }
    return Promise.reject(err);
  },
);

export function getToken(): string | null {
  if (typeof window === 'undefined') return null;
  return localStorage.getItem('ops_token');
}

export function setToken(t: string) {
  localStorage.setItem('ops_token', t);
}

export function clearToken() {
  localStorage.removeItem('ops_token');
}
