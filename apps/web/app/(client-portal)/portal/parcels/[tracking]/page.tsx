'use client';

import { useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import {
  ArrowLeft,
  Package,
  MapPin,
  Truck,
  Warehouse as WarehouseIcon,
  User as UserIcon,
  FileText,
  ExternalLink,
  AlertCircle,
} from 'lucide-react';
import { AppCard, AppCardHeader } from '@/components/ui/AppCard';
import { AppBadge } from '@/components/ui/AppBadge';
import { AppButton } from '@/components/ui/AppButton';
import { AppSkeleton } from '@/components/ui/AppSkeleton';
import { PageTransition } from '@/components/shared/PageTransition';
import { clientPortalApi } from '@/lib/api/client-portal';

interface ParcelHistoryItem {
  id: string;
  action: string;
  statusBefore: string | null;
  statusAfter: string | null;
  locationBefore: string | null;
  locationAfter: string | null;
  actorName: string | null;
  actorType: string | null;
  comment: string | null;
  createdAt: string;
  warehouse: { name: string } | null;
}

interface ParcelDetail {
  id: string;
  trackingNumber: string;
  trackingFournisseur: string | null;
  designation: string;
  weight: string | number | null;
  volume: string | number | null;
  status: string;
  destination: string;
  origin: string | null;
  destinationAddress: string | null;
  price: string | number;
  category: string;
  isFragile: boolean;
  isHazardous: boolean;
  arrivalDate: string | null;
  pickupDate: string | null;
  createdAt: string;
  recipient: { fullName: string; phone: string } | null;
  warehouse: {
    id: string;
    name: string;
    agency: {
      id: string;
      name: string;
      city: string | null;
      country: string | null;
      googleMapsLink: string | null;
    } | null;
  } | null;
  destinationAgency: {
    id: string;
    name: string;
    city: string | null;
    country: string | null;
    googleMapsLink: string | null;
  } | null;
  container: {
    id: string;
    designation: string;
    status: string;
    transitRoute: {
      id: string;
      name: string;
      departureCity: string;
      arrivalCity: string;
      type: string;
    } | null;
  } | null;
  transitRoute: {
    id: string;
    name: string;
    departureCity: string;
    arrivalCity: string;
    type: string;
  } | null;
  invoice: {
    id: string;
    reference: string;
    totalAmount: string | number;
    paidAmount: string | number;
    balance: string | number;
    status: string;
  } | null;
  payments: Array<{
    id: string;
    reference: string;
    amount: string | number;
    paymentMethod: string;
    createdAt: string;
  }>;
  images: Array<{
    id: string;
    url: string;
    caption: string | null;
    isPrimary: boolean;
  }>;
  histories: ParcelHistoryItem[];
}

const STATUS_MAP: Record<
  string,
  { label: string; variant: 'default' | 'success' | 'warning' | 'error' | 'info' }
> = {
  RECEIVED: { label: 'Recu', variant: 'info' },
  IN_STOCK: { label: 'En stock', variant: 'default' },
  LOADING: { label: 'Chargement', variant: 'warning' },
  IN_TRANSIT: { label: 'En transit', variant: 'warning' },
  ARRIVED: { label: 'Arrive', variant: 'info' },
  DELIVERED: { label: 'Livre', variant: 'success' },
  LOST: { label: 'Perdu', variant: 'error' },
};

const TIMELINE_STEPS = [
  { key: 'IN_STOCK', label: 'En stock' },
  { key: 'LOADING', label: 'Chargement' },
  { key: 'IN_TRANSIT', label: 'En transit' },
  { key: 'ARRIVED', label: 'Arrive a destination' },
  { key: 'DELIVERED', label: 'Livre' },
];

function formatXAF(value: number | string | null | undefined) {
  return new Intl.NumberFormat('fr-FR', {
    style: 'currency',
    currency: 'XAF',
    maximumFractionDigits: 0,
  }).format(Number(value ?? 0));
}

function formatDateTime(d: string | null) {
  if (!d) return '-';
  return new Date(d).toLocaleString('fr-FR', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

export default function ParcelDetailPage() {
  const router = useRouter();
  const params = useParams<{ tracking: string }>();
  const tracking = params?.tracking;

  const [parcel, setParcel] = useState<ParcelDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!tracking) return;
    setLoading(true);
    clientPortalApi
      .getParcelByTracking(tracking)
      .then((res) => setParcel(res.data))
      .catch(() => setError('Colis introuvable ou acces non autorise.'))
      .finally(() => setLoading(false));
  }, [tracking]);

  if (loading) {
    return (
      <div className="space-y-4">
        <AppSkeleton className="h-8 w-64" />
        <AppSkeleton className="h-32 rounded-2xl" />
        <AppSkeleton className="h-64 rounded-2xl" />
      </div>
    );
  }

  if (error || !parcel) {
    return (
      <AppCard>
        <div className="flex flex-col items-center gap-3 py-10 text-center">
          <AlertCircle className="h-10 w-10 text-red-500" />
          <p className="text-sm text-gray-600">
            {error ?? 'Colis introuvable.'}
          </p>
          <AppButton variant="secondary" onClick={() => router.back()}>
            Retour
          </AppButton>
        </div>
      </AppCard>
    );
  }

  const statusInfo = STATUS_MAP[parcel.status] ?? {
    label: parcel.status,
    variant: 'default' as const,
  };

  const currentStepIdx = TIMELINE_STEPS.findIndex(
    (s) => s.key === parcel.status,
  );
  const effectiveStepIdx = currentStepIdx === -1 ? 0 : currentStepIdx;

  const currentLocation =
    parcel.warehouse?.agency
      ? `${parcel.warehouse.name} - ${parcel.warehouse.agency.name}${
          parcel.warehouse.agency.city
            ? `, ${parcel.warehouse.agency.city}`
            : ''
        }`
      : parcel.warehouse?.name ?? 'Non renseigne';

  return (
    <PageTransition>
      <div className="space-y-6">
        {/* Header */}
        <div className="flex items-center justify-between gap-3">
          <Link
            href="/portal/parcels"
            className="inline-flex items-center gap-2 text-sm text-gray-600 hover:text-primary-700"
          >
            <ArrowLeft className="h-4 w-4" />
            Retour aux colis
          </Link>
          <AppBadge variant={statusInfo.variant}>{statusInfo.label}</AppBadge>
        </div>

        {/* Identite colis */}
        <AppCard>
          <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
            <div className="min-w-0">
              <p className="text-xs uppercase tracking-wider text-gray-400">
                Numero de suivi
              </p>
              <h1 className="font-mono text-2xl font-bold text-primary-700 sm:text-3xl">
                {parcel.trackingNumber}
              </h1>
              <p className="mt-1 text-sm text-gray-700">{parcel.designation}</p>
              {parcel.trackingFournisseur && (
                <p className="mt-1 text-xs text-gray-500">
                  Tracking fournisseur : {parcel.trackingFournisseur}
                </p>
              )}
              <div className="mt-2 flex flex-wrap gap-2 text-xs">
                <span className="rounded-full bg-gray-100 px-2 py-0.5 text-gray-700">
                  {parcel.category}
                </span>
                {parcel.isFragile && (
                  <span className="rounded-full bg-amber-100 px-2 py-0.5 text-amber-700">
                    Fragile
                  </span>
                )}
                {parcel.isHazardous && (
                  <span className="rounded-full bg-red-100 px-2 py-0.5 text-red-700">
                    Dangereux
                  </span>
                )}
              </div>
            </div>
            <div className="grid grid-cols-2 gap-4 text-sm sm:text-right">
              <div>
                <p className="text-xs uppercase tracking-wider text-gray-400">
                  Poids
                </p>
                <p className="font-medium text-gray-900">
                  {parcel.weight ? `${parcel.weight} kg` : '-'}
                </p>
              </div>
              <div>
                <p className="text-xs uppercase tracking-wider text-gray-400">
                  Volume
                </p>
                <p className="font-medium text-gray-900">
                  {parcel.volume ? `${parcel.volume} m3` : '-'}
                </p>
              </div>
              <div className="col-span-2">
                <p className="text-xs uppercase tracking-wider text-gray-400">
                  Prix
                </p>
                <p className="text-lg font-bold text-primary-700">
                  {formatXAF(parcel.price)}
                </p>
              </div>
            </div>
          </div>
        </AppCard>

        {/* Progression */}
        <AppCard>
          <AppCardHeader title="Progression" />
          <div className="relative">
            <ol className="grid grid-cols-5 gap-2 text-center">
              {TIMELINE_STEPS.map((step, idx) => {
                const done = idx <= effectiveStepIdx;
                const active = idx === effectiveStepIdx;
                return (
                  <li key={step.key} className="flex flex-col items-center">
                    <div
                      className={`flex h-9 w-9 items-center justify-center rounded-full text-xs font-bold transition-colors ${
                        done
                          ? 'bg-primary-600 text-white'
                          : 'bg-gray-100 text-gray-400'
                      } ${active ? 'ring-4 ring-primary-100' : ''}`}
                    >
                      {idx + 1}
                    </div>
                    <p
                      className={`mt-2 text-[11px] font-medium sm:text-xs ${
                        done ? 'text-primary-700' : 'text-gray-400'
                      }`}
                    >
                      {step.label}
                    </p>
                  </li>
                );
              })}
            </ol>
            <div className="absolute left-[10%] right-[10%] top-4.5 -z-10 h-1 rounded-full bg-gray-100">
              <div
                className="h-1 rounded-full bg-primary-500 transition-all"
                style={{
                  width: `${
                    effectiveStepIdx === 0
                      ? 0
                      : (effectiveStepIdx / (TIMELINE_STEPS.length - 1)) * 100
                  }%`,
                }}
              />
            </div>
          </div>
        </AppCard>

        {/* Localisation */}
        <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
          <AppCard>
            <AppCardHeader title="Localisation actuelle" />
            <div className="space-y-3 text-sm">
              <div className="flex items-start gap-3">
                <WarehouseIcon className="mt-0.5 h-5 w-5 shrink-0 text-primary-600" />
                <div className="min-w-0">
                  <p className="text-xs uppercase tracking-wider text-gray-400">
                    Magasin
                  </p>
                  <p className="font-medium text-gray-900">
                    {currentLocation}
                  </p>
                  {parcel.warehouse?.agency?.googleMapsLink && (
                    <a
                      href={parcel.warehouse.agency.googleMapsLink}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="mt-1 inline-flex items-center gap-1 text-xs font-medium text-primary-600 hover:text-primary-700"
                    >
                      Voir sur Google Maps
                      <ExternalLink className="h-3 w-3" />
                    </a>
                  )}
                </div>
              </div>
              {parcel.container && (
                <div className="flex items-start gap-3">
                  <Package className="mt-0.5 h-5 w-5 shrink-0 text-amber-600" />
                  <div className="min-w-0">
                    <p className="text-xs uppercase tracking-wider text-gray-400">
                      Conteneur
                    </p>
                    <p className="font-medium text-gray-900">
                      {parcel.container.designation} ({parcel.container.status})
                    </p>
                  </div>
                </div>
              )}
              {(parcel.container?.transitRoute || parcel.transitRoute) && (
                <div className="flex items-start gap-3">
                  <Truck className="mt-0.5 h-5 w-5 shrink-0 text-sky-600" />
                  <div className="min-w-0">
                    <p className="text-xs uppercase tracking-wider text-gray-400">
                      Route de transit
                    </p>
                    <p className="font-medium text-gray-900">
                      {(parcel.container?.transitRoute ?? parcel.transitRoute)
                        ?.departureCity}{' '}
                      &rarr;{' '}
                      {(parcel.container?.transitRoute ?? parcel.transitRoute)
                        ?.arrivalCity}
                    </p>
                    <p className="text-xs text-gray-500">
                      Mode :{' '}
                      {(parcel.container?.transitRoute ?? parcel.transitRoute)
                        ?.type}
                    </p>
                  </div>
                </div>
              )}
            </div>
          </AppCard>

          <AppCard>
            <AppCardHeader title="Destination" />
            <div className="space-y-3 text-sm">
              <div className="flex items-start gap-3">
                <MapPin className="mt-0.5 h-5 w-5 shrink-0 text-red-500" />
                <div className="min-w-0">
                  <p className="text-xs uppercase tracking-wider text-gray-400">
                    Ville
                  </p>
                  <p className="font-medium text-gray-900">
                    {parcel.destination}
                  </p>
                  {parcel.destinationAddress && (
                    <p className="text-xs text-gray-500">
                      {parcel.destinationAddress}
                    </p>
                  )}
                </div>
              </div>
              {parcel.destinationAgency && (
                <div className="flex items-start gap-3">
                  <WarehouseIcon className="mt-0.5 h-5 w-5 shrink-0 text-primary-600" />
                  <div className="min-w-0">
                    <p className="text-xs uppercase tracking-wider text-gray-400">
                      Agence de retrait
                    </p>
                    <p className="font-medium text-gray-900">
                      {parcel.destinationAgency.name}
                      {parcel.destinationAgency.city
                        ? `, ${parcel.destinationAgency.city}`
                        : ''}
                    </p>
                    {parcel.destinationAgency.googleMapsLink && (
                      <a
                        href={parcel.destinationAgency.googleMapsLink}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="mt-1 inline-flex items-center gap-1 text-xs font-medium text-primary-600 hover:text-primary-700"
                      >
                        Voir sur Google Maps
                        <ExternalLink className="h-3 w-3" />
                      </a>
                    )}
                  </div>
                </div>
              )}
              {parcel.recipient && (
                <div className="flex items-start gap-3">
                  <UserIcon className="mt-0.5 h-5 w-5 shrink-0 text-gray-500" />
                  <div className="min-w-0">
                    <p className="text-xs uppercase tracking-wider text-gray-400">
                      Destinataire
                    </p>
                    <p className="font-medium text-gray-900">
                      {parcel.recipient.fullName}
                    </p>
                    <p className="text-xs text-gray-500">
                      {parcel.recipient.phone}
                    </p>
                  </div>
                </div>
              )}
            </div>
          </AppCard>
        </div>

        {/* Facture + Paiements */}
        {parcel.invoice && (
          <AppCard>
            <AppCardHeader
              title="Facture associee"
              action={
                <Link
                  href="/portal/payments"
                  className="inline-flex items-center gap-1 text-xs font-medium text-primary-600 hover:text-primary-700"
                >
                  Payer / declarer
                  <FileText className="h-3 w-3" />
                </Link>
              }
            />
            <div className="grid grid-cols-2 gap-4 text-sm sm:grid-cols-4">
              <Info label="Reference" value={parcel.invoice.reference} mono />
              <Info
                label="Total"
                value={formatXAF(parcel.invoice.totalAmount)}
              />
              <Info
                label="Paye"
                value={formatXAF(parcel.invoice.paidAmount)}
              />
              <Info
                label="Restant"
                value={formatXAF(parcel.invoice.balance)}
                emphasize={Number(parcel.invoice.balance) > 0}
              />
            </div>
            {parcel.payments.length > 0 && (
              <div className="mt-4 space-y-2">
                <p className="text-xs font-medium uppercase tracking-wider text-gray-400">
                  Paiements lies a ce colis
                </p>
                {parcel.payments.map((p) => (
                  <div
                    key={p.id}
                    className="flex items-center justify-between rounded-xl bg-gray-50 px-3 py-2 text-sm"
                  >
                    <div>
                      <p className="font-mono text-xs text-gray-700">
                        {p.reference}
                      </p>
                      <p className="text-[11px] text-gray-500">
                        {p.paymentMethod} - {formatDateTime(p.createdAt)}
                      </p>
                    </div>
                    <p className="font-bold text-primary-700">
                      {formatXAF(p.amount)}
                    </p>
                  </div>
                ))}
              </div>
            )}
          </AppCard>
        )}

        {/* Historique */}
        <AppCard>
          <AppCardHeader title="Historique du colis" />
          {parcel.histories.length === 0 ? (
            <p className="py-6 text-center text-sm text-gray-400">
              Aucun evenement enregistre.
            </p>
          ) : (
            <ol className="relative ml-3 border-l-2 border-gray-100">
              {parcel.histories.map((h) => (
                <li key={h.id} className="mb-6 ml-4">
                  <span className="absolute -left-2 flex h-4 w-4 items-center justify-center rounded-full bg-primary-500 ring-4 ring-white" />
                  <p className="text-sm font-semibold text-gray-900">
                    {h.action}
                    {h.statusAfter && h.statusBefore && (
                      <span className="ml-2 text-xs font-normal text-gray-500">
                        {h.statusBefore} &rarr; {h.statusAfter}
                      </span>
                    )}
                  </p>
                  <p className="text-xs text-gray-500">
                    {formatDateTime(h.createdAt)}
                    {h.actorName ? ` - ${h.actorName}` : ''}
                    {h.actorType ? ` (${h.actorType})` : ''}
                  </p>
                  {(h.warehouse?.name || h.locationAfter) && (
                    <p className="mt-0.5 text-xs text-gray-600">
                      Lieu : {h.warehouse?.name ?? h.locationAfter}
                    </p>
                  )}
                  {h.comment && (
                    <p className="mt-1 rounded-lg bg-gray-50 p-2 text-xs text-gray-700">
                      {h.comment}
                    </p>
                  )}
                </li>
              ))}
            </ol>
          )}
        </AppCard>
      </div>
    </PageTransition>
  );
}

function Info({
  label,
  value,
  mono,
  emphasize,
}: {
  label: string;
  value: string;
  mono?: boolean;
  emphasize?: boolean;
}) {
  return (
    <div>
      <p className="text-xs uppercase tracking-wider text-gray-400">{label}</p>
      <p
        className={`mt-0.5 font-medium ${mono ? 'font-mono text-sm' : ''} ${
          emphasize ? 'text-red-600' : 'text-gray-900'
        }`}
      >
        {value}
      </p>
    </div>
  );
}
