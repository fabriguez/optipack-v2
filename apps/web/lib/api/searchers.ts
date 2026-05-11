/**
 * Helpers pour AppSearchSelect : convertit les API list paginees en
 * resultats SearchOption[] limites a `limit`.
 */

import { apiClient } from './client';
import { clientsApi } from './clients';
import type { SearchOption } from '@/components/ui/AppSearchSelect';

const DEFAULT_LIMIT = 10;

interface ListResponse<T> {
  success: boolean;
  data: T[];
}

async function searchPaginated<T>(
  endpoint: string,
  query: string,
  limit: number,
  extraParams?: Record<string, unknown>,
): Promise<T[]> {
  const res = await apiClient.get<ListResponse<T>>(endpoint, {
    params: { search: query, limit, page: 1, ...extraParams },
  });
  return res.data.data ?? [];
}

// Type SearcherFn : signature standard d'un searcher avec un attribut
// `searchKey` stable utilise par AppSearchSelect pour mutualiser le cache
// React Query entre toutes les instances qui partagent le meme searcher.
export type SearcherFn = ((q: string, limit?: number, extra?: Record<string, unknown>) => Promise<SearchOption[]>) & {
  searchKey?: string;
};

function tag(fn: (q: string, limit?: number, extra?: Record<string, unknown>) => Promise<SearchOption[]>, key: string): SearcherFn {
  (fn as SearcherFn).searchKey = key;
  return fn as SearcherFn;
}

export const searchers = {
  clients: tag(async (q: string, limit = DEFAULT_LIMIT, extra?: Record<string, unknown>): Promise<SearchOption[]> => {
    const items = await searchPaginated<{ id: string; fullName: string; phone: string; clientType?: string }>(
      '/clients',
      q,
      limit,
      extra,
    );
    return items.map((c) => ({
      value: c.id,
      label: c.fullName,
      sublabel: `${c.phone}${c.clientType && c.clientType !== 'INDIVIDUAL' ? ` - ${c.clientType}` : ''}`,
    }));
  }, 'searchers.clients'),

  // Recipients ont fusionne avec clients : on cherche dans la meme table.
  recipients: tag(async (q: string, limit = DEFAULT_LIMIT): Promise<SearchOption[]> => {
    const items = await searchPaginated<{ id: string; fullName: string; phone: string; clientType?: string }>(
      '/clients',
      q,
      limit,
    );
    return items.map((c) => ({
      value: c.id,
      label: c.fullName,
      sublabel: `${c.phone}${c.clientType && c.clientType !== 'INDIVIDUAL' ? ` - ${c.clientType}` : ''}`,
    }));
  }, 'searchers.recipients'),

  warehouses: tag(async (q: string, limit = DEFAULT_LIMIT, extra?: Record<string, unknown>): Promise<SearchOption[]> => {
    const items = await searchPaginated<{ id: string; name: string; agency?: { name: string } }>(
      '/warehouses',
      q,
      limit,
      extra,
    );
    return items.map((w) => ({
      value: w.id,
      label: w.name,
      sublabel: w.agency?.name ?? null,
    }));
  }, 'searchers.warehouses'),

  agencies: tag(async (q: string, limit = DEFAULT_LIMIT): Promise<SearchOption[]> => {
    const items = await searchPaginated<{ id: string; name: string; city: string }>('/agencies', q, limit);
    return items.map((a) => ({ value: a.id, label: a.name, sublabel: a.city }));
  }, 'searchers.agencies'),

  employees: tag(async (q: string, limit = DEFAULT_LIMIT, extra?: Record<string, unknown>): Promise<SearchOption[]> => {
    // Recherche dans le scope de l'utilisateur (toutes ses agences). Si extra.agencyId
    // est fourni, on filtre cote API via l'endpoint scope par agence.
    const endpoint = extra?.agencyId
      ? `/employees/agency/${extra.agencyId}`
      : '/employees';
    const items = await searchPaginated<{
      id: string;
      fullName: string;
      position: string;
      agency?: { name: string };
    }>(endpoint, q, limit);
    return items.map((e) => ({
      value: e.id,
      label: e.fullName,
      sublabel: [e.position, e.agency?.name].filter(Boolean).join(' - '),
    }));
  }, 'searchers.employees'),

  transitRoutes: tag(async (q: string, limit = DEFAULT_LIMIT, extra?: Record<string, unknown>): Promise<SearchOption[]> => {
    const items = await searchPaginated<{
      id: string;
      name: string;
      type: string;
      pricePerKg: string | number;
      departureCity?: string;
      arrivalCity?: string;
    }>('/transit-routes', q, limit, extra);
    return items.map((r) => ({
      value: r.id,
      label: r.name,
      sublabel: `${r.type} - ${r.departureCity ?? ''} → ${r.arrivalCity ?? ''}`,
    }));
  }, 'searchers.transitRoutes'),

  containers: tag(async (q: string, limit = DEFAULT_LIMIT, extra?: Record<string, unknown>): Promise<SearchOption[]> => {
    const items = await searchPaginated<{
      id: string;
      designation: string;
      type: string;
      status: string;
      isForwarding?: boolean;
    }>('/containers', q, limit, extra);
    return items.map((c) => ({
      value: c.id,
      label: c.designation,
      sublabel: `${c.type}${c.isForwarding ? ' (acheminement)' : ''} - ${c.status}`,
    }));
  }, 'searchers.containers'),

  parcels: tag(async (q: string, limit = DEFAULT_LIMIT, extra?: Record<string, unknown>): Promise<SearchOption[]> => {
    const items = await searchPaginated<{
      id: string;
      trackingNumber: string;
      designation: string;
      status: string;
    }>('/parcels', q, limit, extra);
    return items.map((p) => ({
      value: p.id,
      label: `${p.trackingNumber} - ${p.designation}`,
      sublabel: p.status,
    }));
  }, 'searchers.parcels'),
};

/**
 * Helpers pour construire un `SearchOption` a partir d'une entite deja chargee
 * (ex. depuis une page detail). Sert a alimenter `selectedOption` quand on
 * pre-selectionne une valeur qui n'est pas encore dans les resultats du searcher.
 */
export const toSearchOption = {
  agency: (a: { id: string; name: string; city?: string | null }): SearchOption => ({
    value: a.id,
    label: a.name,
    sublabel: a.city ?? null,
  }),
  warehouse: (
    w: { id: string; name: string; agency?: { name?: string | null } | null },
  ): SearchOption => ({
    value: w.id,
    label: w.name,
    sublabel: w.agency?.name ?? null,
  }),
  client: (c: { id: string; fullName: string; phone?: string | null }): SearchOption => ({
    value: c.id,
    label: c.fullName,
    sublabel: c.phone ?? null,
  }),
};

/**
 * Createurs inline pour SearchSelect.onCreate : retourne SearchOption|null
 */
export const inlineCreators = {
  client: async (
    fullName: string,
    extra: { agencyId: string; phone?: string },
  ): Promise<SearchOption | null> => {
    if (!fullName.trim()) return null;
    // phone est requis cote backend, on demande au minimum un placeholder unique base sur le timestamp
    const phone = extra.phone || `temp-${Date.now()}`;
    const res = await clientsApi.create({
      fullName,
      phone,
      agencyId: extra.agencyId,
    } as never);
    const c = res.data;
    return { value: c.id, label: c.fullName, sublabel: c.phone };
  },

  // Cree un Client (utilise comme destinataire). Ce champ est appele "recipient"
  // pour l'historique mais fonctionnellement c'est un client.
  recipient: async (fullName: string, extra: { agencyId: string; phone?: string }): Promise<SearchOption | null> => {
    if (!fullName.trim()) return null;
    const phone = extra.phone || `temp-${Date.now()}`;
    const res = await clientsApi.create({ fullName, phone, agencyId: extra.agencyId } as never);
    const c = res.data;
    return { value: c.id, label: c.fullName, sublabel: c.phone };
  },

  warehouse: async (name: string, extra: { agencyId: string; location?: string }): Promise<SearchOption | null> => {
    if (!name.trim()) return null;
    const res = await apiClient.post('/warehouses', {
      name,
      agencyId: extra.agencyId,
      location: extra.location || name,
    });
    const w = res.data.data;
    return { value: w.id, label: w.name, sublabel: extra.agencyId };
  },
};
