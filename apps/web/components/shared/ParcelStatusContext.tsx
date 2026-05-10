'use client';

import Link from 'next/link';
import { Warehouse as WarehouseIcon, Container as ContainerIcon, MapPin, User, Calendar } from 'lucide-react';
import { formatDate, formatDateTime } from '@transitsoftservices/shared';

interface ParcelLike {
  status: string;
  warehouse?: { id: string; name: string; agency?: { id?: string; name?: string } | null } | null;
  container?: { id: string; designation: string } | null;
  lastContainer?: { id: string; designation: string } | null;
  transitRoute?: { id: string; name: string; type?: string | null; departureCity?: string | null; arrivalCity?: string | null } | null;
  destination?: string | null;
  destinationAgency?: { id?: string; name?: string; city?: string | null } | null;
  origin?: string | null;
  client?: { id?: string; fullName?: string | null; phone?: string | null } | null;
  recipient?: { id?: string; fullName?: string | null; phone?: string | null } | null;
  arrivalDate?: string | null;
  pickupDate?: string | null;
  warehouseEnteredAt?: string | null;
  /** Date estimee d'arrivee (depuis le conteneur, transmise par le caller). */
  estimatedArrivalDate?: string | null;
  /** Date/heure de remise (depuis l'historique handover). */
  deliveredAt?: string | null;
}

/**
 * Affiche un texte contextuel selon le statut du colis :
 *   - IN_STOCK / RECEIVED : "en stock a <magasin>"
 *   - LOADING            : "en chargement dans le conteneur <X>"
 *   - IN_TRANSIT         : "en transit de <X> vers <Y> (arrivee prevue : ...)"
 *   - ARRIVED            : "arrive a <Y> le <date>"
 *   - DELIVERED          : "livre a <destinataire> le <date>"
 *
 * Liens : magasin, conteneur, agences -> leur page detail.
 */
export function ParcelStatusContext({ parcel }: { parcel: ParcelLike }) {
  const status = parcel.status;
  const wh = parcel.warehouse;
  const ct = parcel.container ?? parcel.lastContainer;
  const route = parcel.transitRoute;

  // Helpers liens.
  const Wh = () =>
    wh ? (
      <Link href={`/warehouses/${wh.id}`} className="font-semibold text-primary-700 hover:underline">
        <WarehouseIcon className="inline h-3.5 w-3.5 mr-0.5" />
        {wh.name}
        {wh.agency?.name && <span className="text-gray-500"> ({wh.agency.name})</span>}
      </Link>
    ) : (
      <span className="text-gray-500">-</span>
    );
  const Ct = () =>
    ct ? (
      <Link href={`/containers/${ct.id}`} className="font-semibold text-primary-700 hover:underline">
        <ContainerIcon className="inline h-3.5 w-3.5 mr-0.5" />
        {ct.designation}
      </Link>
    ) : (
      <span className="text-gray-500">-</span>
    );
  const FromCity = () => {
    const v = route?.departureCity ?? parcel.origin ?? wh?.agency?.name ?? null;
    return v ? <span className="font-semibold text-gray-900">{v}</span> : <span className="text-gray-500">-</span>;
  };
  const ToCity = () => {
    const v = route?.arrivalCity ?? parcel.destinationAgency?.city ?? parcel.destination ?? null;
    return v ? <span className="font-semibold text-gray-900">{v}</span> : <span className="text-gray-500">-</span>;
  };
  const DestAgency = () =>
    parcel.destinationAgency?.id ? (
      <Link href={`/agencies/${parcel.destinationAgency.id}`} className="font-semibold text-primary-700 hover:underline">
        <MapPin className="inline h-3.5 w-3.5 mr-0.5" />
        {parcel.destinationAgency.name ?? parcel.destinationAgency.city}
      </Link>
    ) : parcel.destination ? (
      <span className="font-semibold text-gray-900">{parcel.destination}</span>
    ) : (
      <span className="text-gray-500">-</span>
    );

  // Aiguillage selon statut.
  switch (status) {
    case 'IN_STOCK':
    case 'RECEIVED': {
      const since = parcel.warehouseEnteredAt
        ? <span className="ml-1 text-gray-500">depuis le {formatDate(parcel.warehouseEnteredAt)}</span>
        : null;
      return (
        <div className="text-sm text-gray-600">
          <span className="text-gray-500 mr-1">{status === 'RECEIVED' ? 'Receptionne' : 'En stock'} a</span>
          <Wh />
          {since}
        </div>
      );
    }

    case 'LOADING':
      return (
        <div className="text-sm text-gray-600">
          <span className="text-gray-500 mr-1">En chargement dans le conteneur</span>
          <Ct />
        </div>
      );

    case 'IN_TRANSIT':
      return (
        <div className="text-sm text-gray-600 flex flex-wrap items-center gap-1">
          <span className="text-gray-500">En transit de</span>
          <FromCity />
          <span className="text-gray-500">vers</span>
          <ToCity />
          {ct && (
            <>
              <span className="text-gray-400">·</span>
              <Ct />
            </>
          )}
          {parcel.estimatedArrivalDate && (
            <span className="ml-1 inline-flex items-center gap-0.5 rounded bg-amber-50 px-1.5 py-0.5 text-[11px] text-amber-700">
              <Calendar className="h-3 w-3" />
              arrivee prevue : {formatDate(parcel.estimatedArrivalDate)}
            </span>
          )}
        </div>
      );

    case 'ARRIVED':
      return (
        <div className="text-sm text-gray-600 flex flex-wrap items-center gap-1">
          <span className="text-gray-500">Arrivee a</span>
          <DestAgency />
          {parcel.arrivalDate && (
            <span className="ml-1 text-gray-500">le {formatDateTime(parcel.arrivalDate)}</span>
          )}
        </div>
      );

    case 'DELIVERED':
      return (
        <div className="text-sm text-gray-600 flex flex-wrap items-center gap-1">
          <span className="text-gray-500">Livre a</span>
          <span className="font-semibold text-gray-900">
            <User className="inline h-3.5 w-3.5 mr-0.5" />
            {parcel.recipient?.fullName ?? parcel.client?.fullName ?? '(destinataire)'}
          </span>
          {parcel.recipient?.phone && (
            <span className="text-gray-500">({parcel.recipient.phone})</span>
          )}
          {(parcel.deliveredAt || parcel.pickupDate) && (
            <span className="ml-1 text-gray-500">
              le {formatDateTime(parcel.deliveredAt ?? parcel.pickupDate!)}
            </span>
          )}
        </div>
      );

    case 'LOST':
      return <div className="text-sm text-red-700">Colis perdu / non retrouve</div>;

    default:
      return <div className="text-sm text-gray-500">{status}</div>;
  }
}
