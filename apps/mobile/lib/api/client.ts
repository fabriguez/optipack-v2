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

// Tenant courant (sera injecte dans toutes les requetes via X-Tenant).
// Source : build-time (EXPO_PUBLIC_TENANT_SLUG) ou runtime (storage).
let currentTenant: string | null = env?.EXPO_PUBLIC_TENANT_SLUG ?? null;
export function setTenantSlug(slug: string | null): void {
  currentTenant = slug;
}

let onUnauthenticated: (() => void) | null = null;
export function setUnauthenticatedHandler(fn: () => void): void {
  onUnauthenticated = fn;
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

apiClient.interceptors.response.use(
  (r) => r,
  async (error: AxiosError) => {
    const status = error.response?.status;
    const original = error.config as
      | (AxiosRequestConfig & { _queued?: boolean })
      | undefined;

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
        });
        return Promise.reject(new OfflineQueuedError(entry));
      }
    }

    if (status === 401) {
      await storage.remove(STORAGE_KEYS.accessToken);
      await storage.remove(STORAGE_KEYS.refreshToken);
      onUnauthenticated?.();
    }
    return Promise.reject(error);
  },
);
