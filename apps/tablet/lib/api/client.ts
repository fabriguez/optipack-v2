import axios, { AxiosError, AxiosRequestConfig } from 'axios';
import { storage, STORAGE_KEYS } from '@/lib/storage/storage';
import {
  isQueueableMethod,
  offlineQueue,
  OfflineQueuedError,
  shouldQueueOnError,
} from './offlineQueue';

const env = (globalThis as { process?: { env?: Record<string, string | undefined> } }).process?.env;
const API_URL = env?.EXPO_PUBLIC_API_URL ?? 'https://api.transitsoftservices.com/api/v1';

export const apiClient = axios.create({
  baseURL: API_URL,
  headers: { 'Content-Type': 'application/json' },
  timeout: 15000,
});

let currentTenant: string | null = env?.EXPO_PUBLIC_TENANT_SLUG ?? null;
export function setTenantSlug(slug: string | null): void {
  currentTenant = slug;
}

let onUnauthenticated: (() => void) | null = null;
export function setUnauthenticatedHandler(fn: () => void): void {
  onUnauthenticated = fn;
}

let onTokenRefreshed: ((tokens: { accessToken: string; refreshToken: string }) => void) | null = null;
export function setTokenRefreshHandler(
  fn: (tokens: { accessToken: string; refreshToken: string }) => void,
): void {
  onTokenRefreshed = fn;
}

apiClient.interceptors.request.use(async (config) => {
  const token = await storage.get<string>(STORAGE_KEYS.accessToken);
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  if (currentTenant && !config.headers['X-Tenant']) {
    config.headers['X-Tenant'] = currentTenant;
  }
  return config;
});

let refreshInFlight: Promise<string | null> | null = null;

async function performRefresh(): Promise<string | null> {
  const refreshToken = await storage.get<string>(STORAGE_KEYS.refreshToken);
  if (!refreshToken) return null;
  try {
    const { data } = await axios.post(
      `${API_URL}/auth/refresh`,
      { refreshToken },
      { headers: { 'Content-Type': 'application/json' }, timeout: 10000 },
    );
    const accessToken: string | undefined = data?.data?.accessToken;
    const newRefresh: string | undefined = data?.data?.refreshToken;
    if (!accessToken) return null;
    await storage.set(STORAGE_KEYS.accessToken, accessToken);
    if (newRefresh) await storage.set(STORAGE_KEYS.refreshToken, newRefresh);
    onTokenRefreshed?.({ accessToken, refreshToken: newRefresh ?? refreshToken });
    return accessToken;
  } catch {
    return null;
  }
}

function refreshOnce(): Promise<string | null> {
  if (!refreshInFlight) {
    refreshInFlight = performRefresh().finally(() => {
      setTimeout(() => {
        refreshInFlight = null;
      }, 200);
    });
  }
  return refreshInFlight;
}

apiClient.interceptors.response.use(
  (r) => r,
  async (error: AxiosError) => {
    const status = error.response?.status;
    const original = error.config as
      | (AxiosRequestConfig & { _retry?: boolean; _queued?: boolean })
      | undefined;

    // Offline queue for mutations
    if (
      original &&
      !original._queued &&
      shouldQueueOnError(error) &&
      isQueueableMethod(original.method)
    ) {
      const isFormData =
        typeof FormData !== 'undefined' && original.data instanceof FormData;
      if (!isFormData) {
        original._queued = true;
        const entry = await offlineQueue.enqueue({
          method: original.method!.toUpperCase() as never,
          url: original.url ?? '',
          data: original.data,
          params: original.params as Record<string, unknown> | undefined,
        });
        return Promise.reject(new OfflineQueuedError(entry));
      }
    }

    if (status !== 401 || !original || original._retry) {
      return Promise.reject(error);
    }

    original._retry = true;
    const newToken = await refreshOnce();
    if (!newToken) {
      await storage.remove(STORAGE_KEYS.accessToken);
      await storage.remove(STORAGE_KEYS.refreshToken);
      onUnauthenticated?.();
      return Promise.reject(error);
    }
    original.headers = {
      ...(original.headers || {}),
      Authorization: `Bearer ${newToken}`,
    };
    return apiClient.request(original);
  },
);
