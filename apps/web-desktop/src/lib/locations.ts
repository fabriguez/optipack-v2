/**
 * Source locale pour le selecteur pays / region / ville.
 * Remplace les fetchs vers venkatmcajj.github.io qui sont lents et
 * sujets aux ERR_CONNECTION_RESET (rate-limit GitHub Pages).
 *
 * Les fichiers vivent dans `/public/locations/` et sont servis par Next.js
 * avec cache navigateur agressif (immutable).
 */

export interface CountryRow {
  id: number;
  name: string;
  iso2: string;
  iso3: string;
  phone_code?: string;
  emoji?: string;
  region?: string;
  hasStates?: boolean;
}

export interface StateRow {
  id: number;
  name: string;
  state_code?: string;
  hasCities?: boolean;
}

export interface CityRow {
  id: number;
  name: string;
  latitude?: string;
  longitude?: string;
}

interface CountryStatesPayload {
  id: number;
  states: StateRow[];
}

interface CountryCitiesPayload {
  id: number;
  states: Array<{ id: number; cities: CityRow[] }>;
}

const BASE = '/locations';

let countriesCache: Promise<CountryRow[]> | null = null;
let statesCache: Promise<CountryStatesPayload[]> | null = null;
const cityCache = new Map<number, Promise<CountryCitiesPayload>>();

async function fetchJson<T>(url: string): Promise<T> {
  const res = await fetch(url, { cache: 'force-cache' });
  if (!res.ok) throw new Error(`Failed to load ${url}: ${res.status}`);
  return res.json();
}

export function GetCountries(): Promise<CountryRow[]> {
  if (!countriesCache) {
    countriesCache = fetchJson<CountryRow[]>(`${BASE}/countriesminified.json`).catch((err) => {
      countriesCache = null;
      throw err;
    });
  }
  return countriesCache;
}

export async function GetState(countryId: number): Promise<StateRow[]> {
  if (!statesCache) {
    statesCache = fetchJson<CountryStatesPayload[]>(`${BASE}/statesminified.json`).catch((err) => {
      statesCache = null;
      throw err;
    });
  }
  const all = await statesCache;
  const country = all.find((c) => c.id === countryId);
  return country?.states ?? [];
}

export async function GetCity(countryId: number, stateId?: number): Promise<CityRow[]> {
  if (!countryId) return [];
  let payload = cityCache.get(countryId);
  if (!payload) {
    payload = fetchJson<CountryCitiesPayload>(`${BASE}/cities/${countryId}.json`).catch((err) => {
      cityCache.delete(countryId);
      throw err;
    });
    cityCache.set(countryId, payload);
  }
  const data = await payload;
  if (!stateId) {
    // Toutes les villes du pays
    return (data.states || []).flatMap((s) => s.cities || []);
  }
  const state = data.states?.find((s) => s.id === stateId);
  return state?.cities ?? [];
}

export async function GetCountryByIso2(iso2: string): Promise<CountryRow | undefined> {
  const list = await GetCountries();
  return list.find((c) => c.iso2.toUpperCase() === iso2.toUpperCase());
}
