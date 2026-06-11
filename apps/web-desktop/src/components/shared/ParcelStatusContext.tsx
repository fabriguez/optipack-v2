'use client';

import { Link } from 'react-router-dom';
import { Warehouse as WarehouseIcon, Container as ContainerIcon, MapPin, User, Calendar } from 'lucide-react';
import { formatDate, formatDateTime } from '@transitsoftservices/shared';

interface AgencyRef {
  id: string;
  name: string;
  city?: string | null;
}

interface ContainerRef {
  id: string;
  designation: string;
  departureAgency?: AgencyRef | null;
  arrivalAgency?: AgencyRef | null;
}

interface ParcelLike {
  status: string;
  warehouse?: { id: string; name: string; agency?: { id?: string; name?: string } | null } | null;
  container?: ContainerRef | null;
  lastContainer?: ContainerRef | null;
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
      <Link to={`/warehouses/${wh.id}`} className="font-semibold text-primary-700 hover:underline">
        <WarehouseIcon className="inline h-3.5 w-3.5 mr-0.5" />
        {wh.name}
        {wh.agency?.name && <span className="text-gray-500"> ({wh.agency.name})</span>}
      </Link>
    ) : (
      <span className="text-gray-500">-</span>
    );
  const Ct = () =>
    ct ? (
      <Link to={`/containers/${ct.id}`} className="font-semibold text-primary-700 hover:underline">
        <ContainerIcon className="inline h-3.5 w-3.5 mr-0.5" />
        {ct.designation}
      </Link>
    ) : (
      <span className="text-gray-500">-</span>
    );
  // Agence cliquable : si on a l'id, lien vers /agencies/:id ; sinon fallback
  // texte. Utilisee pour les bornes depart/arrivee du conteneur en IN_TRANSIT
  // et la destination en ARRIVED/RECEIVED.
  const AgencyLink = ({ agency, fallback }: { agency?: AgencyRef | null; fallback?: string | null }) => {
    if (agency?.id) {
      return (
        <Link to={`/agencies/${agency.id}`} className="font-semibold text-primary-700 hover:underline">
          <MapPin className="inline h-3.5 w-3.5 mr-0.5" />
          {agency.name}
          {agency.city && <span className="text-gray-500"> ({agency.city})</span>}
        </Link>
      );
    }
    return fallback ? (
      <span className="font-semibold text-gray-900">{fallback}</span>
    ) : (
      <span className="text-gray-500">-</span>
    );
  };
  // Aiguillage selon statut.
  switch (status) {
    case 'IN_STOCK': {
      const since = parcel.warehouseEnteredAt
        ? <span className="ml-1 text-gray-500">depuis le {formatDate(parcel.warehouseEnteredAt)}</span>
        : null;
      return (
        <div className="text-sm text-gray-600">
          <span className="text-gray-500 mr-1">En stock a</span>
          <Wh />
          {since}
        </div>
      );
    }

    case 'RECEIVED': {
      // RECEIVED = colis arrive a l'agence de destination du conteneur et
      // receptionne en magasin. L'utilisateur veut voir l'AGENCE de
      // destination du conteneur (pas seulement le magasin), comme pour
      // ARRIVED.
      const arrAgency = ct?.arrivalAgency ?? null;
      return (
        <div className="text-sm text-gray-600 flex flex-wrap items-center gap-1">
          <span className="text-gray-500">Arrive a</span>
          <AgencyLink agency={arrAgency} fallback={parcel.destinationAgency?.name ?? parcel.destination ?? null} />
          {wh && (
            <>
              <span className="text-gray-400">·</span>
              <span className="text-gray-500">receptionne en</span>
              <Wh />
            </>
          )}
          {parcel.warehouseEnteredAt && (
            <span className="ml-1 text-gray-500">le {formatDate(parcel.warehouseEnteredAt)}</span>
          )}
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

    case 'IN_TRANSIT': {
      // En transit de <agence depart conteneur> vers <agence arrivee conteneur>,
      // les deux cliquables. Fallback sur les villes de la route de transit si
      // le conteneur n'a pas ses agences hydratees.
      const dep = ct?.departureAgency ?? null;
      const arr = ct?.arrivalAgency ?? null;
      return (
        <div className="text-sm text-gray-600 flex flex-wrap items-center gap-1">
          <span className="text-gray-500">En transit de</span>
          <AgencyLink agency={dep} fallback={route?.departureCity ?? parcel.origin ?? null} />
          <span className="text-gray-500">vers</span>
          <AgencyLink agency={arr} fallback={route?.arrivalCity ?? parcel.destinationAgency?.city ?? parcel.destination ?? null} />
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
    }

    case 'ARRIVED': {
      // Arrive a l'AGENCE de destination du conteneur (priorite sur la
      // destinationAgency du colis, qui peut differer dans certains cas
      // multi-tronçons).
      const arrAgency = ct?.arrivalAgency ?? null;
      return (
        <div className="text-sm text-gray-600 flex flex-wrap items-center gap-1">
          <span className="text-gray-500">Arrive a</span>
          <AgencyLink agency={arrAgency} fallback={parcel.destinationAgency?.name ?? parcel.destination ?? null} />
          {parcel.arrivalDate && (
            <span className="ml-1 text-gray-500">le {formatDateTime(parcel.arrivalDate)}</span>
          )}
        </div>
      );
    }

    case 'DELIVERED': {
      // Le nom du destinataire (ou du client si pas de destinataire distinct)
      // doit etre cliquable et pointer vers sa fiche client. Les destinataires
      // sont des Client dans le schema, donc meme route /clients/:id.
      const target = parcel.recipient ?? parcel.client ?? null;
      const targetName = target?.fullName ?? '(destinataire)';
      const targetId = target?.id ?? null;
      return (
        <div className="text-sm text-gray-600 flex flex-wrap items-center gap-1">
          <span className="text-gray-500">Livre a</span>
          {targetId ? (
            <Link
              to={`/clients/${targetId}`}
              className="font-semibold text-primary-700 hover:underline"
            >
              <User className="inline h-3.5 w-3.5 mr-0.5" />
              {targetName}
            </Link>
          ) : (
            <span className="font-semibold text-gray-900">
              <User className="inline h-3.5 w-3.5 mr-0.5" />
              {targetName}
            </span>
          )}
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
    }

    case 'LOST':
      return <div className="text-sm text-red-700">Colis perdu / non retrouve</div>;

    default:
      return <div className="text-sm text-gray-500">{status}</div>;
  }
}
