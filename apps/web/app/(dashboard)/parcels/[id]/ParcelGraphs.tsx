'use client';

import Link from 'next/link';
import { Container as ContainerIcon, ArrowRight, MapPin, Plane, Ship, Truck } from 'lucide-react';
import { AppCard, AppCardHeader } from '@/components/ui/AppCard';
import { AppBadge } from '@/components/ui/AppBadge';

interface HistoryEntry {
  id: string;
  action: string;
  createdAt: string;
  containerId?: string | null;
  container?: {
    id: string;
    designation: string;
    type: 'AIR' | 'SEA' | 'LAND';
    isForwarding: boolean;
    departureAgency: { id: string; name: string; city: string; country: string };
    arrivalAgency: { id: string; name: string; city: string; country: string };
  } | null;
}

interface ParcelLike {
  origin?: string | null;
  destination?: string | null;
  destinationAgency?: { name?: string | null; city?: string | null } | null;
  warehouse?: { agency?: { name?: string | null; city?: string | null } | null } | null;
}

const TYPE_ICON = { AIR: Plane, SEA: Ship, LAND: Truck } as const;
const TYPE_LABEL = { AIR: 'Aerien', SEA: 'Maritime', LAND: 'Terrestre' } as const;
const TYPE_TONE = { AIR: 'info', SEA: 'success', LAND: 'warning' } as const;

/**
 * Suite ordonnee (asc temporelle) des conteneurs par lesquels le colis est
 * passe : dedupliques sur containerId, premiere occurrence horaire conservee.
 */
function buildContainerChain(history: HistoryEntry[]): NonNullable<HistoryEntry['container']>[] {
  const asc = [...history].sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime());
  const seen = new Set<string>();
  const chain: NonNullable<HistoryEntry['container']>[] = [];
  for (const e of asc) {
    if (!e.container || !e.container.id) continue;
    if (seen.has(e.container.id)) continue;
    seen.add(e.container.id);
    chain.push(e.container);
  }
  return chain;
}

export function ParcelContainersGraph({ history, parcel: _p }: { history: HistoryEntry[]; parcel: ParcelLike | null | undefined }) {
  const chain = buildContainerChain(history);
  if (chain.length === 0) return null;

  return (
    <AppCard>
      <AppCardHeader title="Conteneurs traverses" description={`${chain.length} conteneur(s)`} />
      <div className="overflow-x-auto">
        <div className="flex min-w-fit items-stretch gap-2 py-2">
          {chain.map((c, i) => {
            const Icon = TYPE_ICON[c.type];
            return (
              <div key={c.id} className="flex items-stretch gap-2">
                <Link
                  href={`/containers/${c.id}`}
                  className="flex w-48 flex-col rounded-xl border border-primary-100 bg-white p-3 transition hover:border-primary-300 hover:bg-primary-50/40"
                >
                  <div className="flex items-center gap-2">
                    <Icon className="h-4 w-4 text-primary-600" />
                    <span className="truncate font-mono text-xs font-semibold text-primary-700">{c.designation}</span>
                  </div>
                  <div className="mt-1 flex items-center gap-1.5">
                    <AppBadge variant={TYPE_TONE[c.type]}>{TYPE_LABEL[c.type]}</AppBadge>
                    {c.isForwarding && <AppBadge variant="info">Acheminement</AppBadge>}
                  </div>
                  <p className="mt-1.5 truncate text-[11px] text-gray-500">
                    {c.departureAgency.city} -&gt; {c.arrivalAgency.city}
                  </p>
                </Link>
                {i < chain.length - 1 && (
                  <div className="flex items-center text-gray-400">
                    <ArrowRight className="h-5 w-5" />
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>
    </AppCard>
  );
}

/**
 * Chaine de villes deduite des conteneurs : depart c1 -> arrivee c1 == depart
 * c2 -> ... -> destination finale du colis. On deduplique les ruptures.
 */
function buildCityChain(history: HistoryEntry[], parcel: ParcelLike | null | undefined): { city: string; country?: string; agency?: string }[] {
  const chain = buildContainerChain(history);
  const cities: { city: string; country?: string; agency?: string }[] = [];

  const push = (city: string | null | undefined, country: string | null | undefined, agency: string | null | undefined) => {
    if (!city) return;
    const last = cities[cities.length - 1];
    if (last && last.city === city) return;
    cities.push({ city, country: country ?? undefined, agency: agency ?? undefined });
  };

  // Origine declaree (texte libre cote colis)
  if (parcel?.origin) push(parcel.origin, null, null);

  for (const c of chain) {
    push(c.departureAgency.city, c.departureAgency.country, c.departureAgency.name);
    push(c.arrivalAgency.city, c.arrivalAgency.country, c.arrivalAgency.name);
  }

  // Destination finale (agence destination ou ville destination)
  const destCity = parcel?.destinationAgency?.city ?? parcel?.destination;
  push(destCity, null, parcel?.destinationAgency?.name);

  return cities;
}

export function ParcelCitiesGraph({ history, parcel }: { history: HistoryEntry[]; parcel: ParcelLike | null | undefined }) {
  const cities = buildCityChain(history, parcel);
  if (cities.length === 0) return null;

  return (
    <AppCard>
      <AppCardHeader title="Itineraire (villes)" description={`${cities.length} etape(s)`} />
      <div className="overflow-x-auto">
        <div className="flex min-w-fit items-center gap-2 py-3">
          {cities.map((c, i) => (
            <div key={`${c.city}-${i}`} className="flex items-center gap-2">
              <div className="flex w-36 flex-col items-center rounded-xl border border-gray-100 bg-white p-2 text-center">
                <div className="flex h-8 w-8 items-center justify-center rounded-full bg-primary-100 text-primary-700">
                  <MapPin className="h-4 w-4" />
                </div>
                <p className="mt-1 truncate text-xs font-semibold text-gray-900">{c.city}</p>
                {c.country && <p className="truncate text-[10px] text-gray-500">{c.country}</p>}
                {c.agency && <p className="truncate text-[10px] text-primary-700">{c.agency}</p>}
              </div>
              {i < cities.length - 1 && (
                <div className="flex flex-col items-center text-gray-400">
                  <ArrowRight className="h-5 w-5" />
                </div>
              )}
            </div>
          ))}
        </div>
      </div>
    </AppCard>
  );
}
