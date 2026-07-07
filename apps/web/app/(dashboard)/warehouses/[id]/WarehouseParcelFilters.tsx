'use client';

import { AppSelect } from '@/components/ui/AppSelect';
import { AppButton } from '@/components/ui/AppButton';
import { X } from 'lucide-react';
import type { ParcelFilterFacets } from '@/lib/api/parcels';

/** Sentinelle "toutes valeurs" : Radix Select interdit la value vide. */
const ALL = '__all__';

const STATUS_LABELS: Record<string, string> = {
  IN_STOCK: 'En stock',
  RECEIVED: 'Receptionne',
  LOADING: 'En chargement',
  IN_TRANSIT: 'En transit',
  ARRIVED: 'Arrive',
  DELIVERED: 'Livre',
  LOST: 'Perdu',
};

export interface ParcelFilterValues {
  lastContainerId?: string;
  clientId?: string;
  spaceId?: string;
  destination?: string;
  status?: string;
}

interface Props {
  facets?: ParcelFilterFacets;
  values: ParcelFilterValues;
  onChange: (key: keyof ParcelFilterValues, value?: string) => void;
  onReset: () => void;
}

/**
 * Filtres du listing des colis d'un magasin. Chaque select ne propose que les
 * valeurs REELLEMENT presentes dans ce magasin (facettes scopees cote serveur),
 * pas toute la base. Un select n'apparait que s'il y a au moins une valeur.
 */
export function WarehouseParcelFilters({ facets, values, onChange, onReset }: Props) {
  const hasAny = Object.values(values).some(Boolean);
  const containers = facets?.containers ?? [];
  const clients = facets?.clients ?? [];
  const zones = facets?.zones ?? [];
  const destinations = facets?.destinations ?? [];
  const statuses = facets?.statuses ?? [];

  const withAll = (
    items: { value: string; label: string }[],
    allLabel: string,
  ) => [{ value: ALL, label: allLabel }, ...items];

  const handle =
    (key: keyof ParcelFilterValues) => (v: string) =>
      onChange(key, v === ALL ? undefined : v);

  if (
    containers.length === 0 &&
    clients.length === 0 &&
    zones.length === 0 &&
    destinations.length === 0 &&
    statuses.length === 0
  ) {
    return null;
  }

  return (
    <div className="mb-4 flex flex-wrap items-end gap-2">
      {containers.length > 0 && (
        <div className="min-w-[150px]">
          <AppSelect
            label="Conteneur"
            value={values.lastContainerId || ALL}
            onValueChange={handle('lastContainerId')}
            options={withAll(
              containers.map((c) => ({ value: c.id, label: c.label })),
              'Tous les conteneurs',
            )}
          />
        </div>
      )}

      {clients.length > 0 && (
        <div className="min-w-[150px]">
          <AppSelect
            label="Client"
            value={values.clientId || ALL}
            onValueChange={handle('clientId')}
            options={withAll(
              clients.map((c) => ({ value: c.id, label: c.label })),
              'Tous les clients',
            )}
          />
        </div>
      )}

      {zones.length > 0 && (
        <div className="min-w-[140px]">
          <AppSelect
            label="Zone"
            value={values.spaceId || ALL}
            onValueChange={handle('spaceId')}
            options={withAll(
              zones.map((z) => ({ value: z.id, label: z.label })),
              'Toutes les zones',
            )}
          />
        </div>
      )}

      {destinations.length > 0 && (
        <div className="min-w-[150px]">
          <AppSelect
            label="Destination"
            value={values.destination || ALL}
            onValueChange={handle('destination')}
            options={withAll(
              destinations.map((d) => ({ value: d, label: d })),
              'Toutes les destinations',
            )}
          />
        </div>
      )}

      {statuses.length > 0 && (
        <div className="min-w-[140px]">
          <AppSelect
            label="Statut"
            value={values.status || ALL}
            onValueChange={handle('status')}
            options={withAll(
              statuses.map((s) => ({ value: s, label: STATUS_LABELS[s] ?? s })),
              'Tous les statuts',
            )}
          />
        </div>
      )}

      {hasAny && (
        <AppButton variant="ghost" size="sm" onClick={onReset}>
          <X className="h-3.5 w-3.5" />
          Reinitialiser
        </AppButton>
      )}
    </div>
  );
}
