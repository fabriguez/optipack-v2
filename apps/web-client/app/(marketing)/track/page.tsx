'use client';

import { Suspense, useState, useEffect } from 'react';
import { useSearchParams, useRouter } from 'next/navigation';
import { Search, Package, MapPin, Clock, CheckCircle2, AlertCircle, Loader2, Building2 } from 'lucide-react';
import axios from 'axios';

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:4000/api/v1';

const STATUS_LABELS: Record<string, string> = {
  IN_STOCK: 'En stock',
  LOADING: 'En chargement',
  IN_TRANSIT: 'En transit',
  ARRIVED: 'Arrive',
  RECEIVED: 'Receptionne',
  DELIVERED: 'Livre',
  LOST: 'Perdu',
};

const STATUS_COLORS: Record<string, string> = {
  IN_STOCK: 'bg-blue-100 text-blue-800',
  LOADING: 'bg-amber-100 text-amber-800',
  IN_TRANSIT: 'bg-purple-100 text-purple-800',
  ARRIVED: 'bg-emerald-100 text-emerald-800',
  RECEIVED: 'bg-emerald-100 text-emerald-800',
  DELIVERED: 'bg-green-100 text-green-800',
  LOST: 'bg-red-100 text-red-800',
};

type Parcel = {
  trackingNumber: string;
  designation: string;
  status: string;
  isPresent: boolean;
  origin?: string | null;
  destination: string;
  destinationAddress?: string | null;
  createdAt: string;
  arrivalDate?: string | null;
  pickupDate?: string | null;
  warehouseEnteredAt?: string | null;
  category: string;
  warehouse?: { name: string; agency?: { name: string; city: string } | null } | null;
  destinationAgency?: { name: string; city: string } | null;
  transitRoute?: {
    name: string;
    type: string;
    addedValue?: number | null;
    addedValueType?: 'AMOUNT' | 'PERCENT' | null;
  } | null;
};

// Valeur ajoutee d'une route : montant fixe (+2 000 FCFA) ou pourcentage (+10%).
function formatAddedValue(
  value: number | null | undefined,
  type: 'AMOUNT' | 'PERCENT' | null | undefined,
): string | null {
  if (value == null || !type) return null;
  if (type === 'PERCENT') return `+${value}%`;
  return `+${Math.round(value).toLocaleString('fr-FR')} FCFA`;
}

export default function TrackPage() {
  // Next 16 + Turbopack : useSearchParams() doit etre dans une boundary
  // Suspense, sinon le build prerender pour /track echoue.
  return (
    <Suspense fallback={<TrackFallback />}>
      <TrackPageInner />
    </Suspense>
  );
}

function TrackFallback() {
  return (
    <div className="flex min-h-[60vh] items-center justify-center">
      <Loader2 className="h-6 w-6 animate-spin" style={{ color: 'var(--skin-primary)' }} />
    </div>
  );
}

function TrackPageInner() {
  const params = useSearchParams();
  const router = useRouter();
  const initial = params.get('q') || '';
  const [tracking, setTracking] = useState(initial);
  const [submitted, setSubmitted] = useState(initial);
  const [parcel, setParcel] = useState<Parcel | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!submitted) return;
    setLoading(true);
    setError(null);
    setParcel(null);
    axios
      .get(`${API_URL}/public/tracking/${encodeURIComponent(submitted.trim())}`)
      .then((r) => setParcel(r.data?.data ?? null))
      .catch((e) => {
        if (e.response?.status === 404) {
          setError(`Aucun colis trouve pour "${submitted}".`);
        } else {
          setError(e.response?.data?.message || 'Erreur lors de la recherche.');
        }
      })
      .finally(() => setLoading(false));
  }, [submitted]);

  const onSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const v = tracking.trim();
    if (!v) return;
    setSubmitted(v);
    router.replace(`/track?q=${encodeURIComponent(v)}`);
  };

  return (
    <div className="mx-auto max-w-3xl px-4 sm:px-6 lg:px-8 py-16">
      <header className="mb-8 text-center">
        <p
          className="text-xs font-bold uppercase tracking-[0.2em]"
          style={{ color: 'var(--skin-primary)' }}
        >
          Suivi colis
        </p>
        <h1
          className="mt-3 text-4xl font-bold tracking-tight skin-font-heading"
          style={{ color: 'var(--skin-foreground)' }}
        >
          Suivez votre colis en temps reel
        </h1>
        <p className="mt-3 text-sm" style={{ color: 'var(--skin-muted)' }}>
          Entrez votre numero de tracking (ex : TST-AB12CD) pour voir l&apos;etat
          de votre envoi.
        </p>
      </header>

      <form onSubmit={onSubmit} className="flex flex-col gap-2 sm:flex-row">
        <div className="relative flex-1">
          <Search
            className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2"
            style={{ color: 'var(--skin-muted)' }}
          />
          <input
            type="text"
            value={tracking}
            onChange={(e) => setTracking(e.target.value)}
            placeholder="TST-AB12CD"
            className="skin-input w-full pl-10 font-mono uppercase"
          />
        </div>
        <button
          type="submit"
          disabled={!tracking.trim() || loading}
          className="inline-flex items-center justify-center gap-2 py-3 px-6 text-sm font-semibold skin-btn-primary disabled:opacity-50"
        >
          {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Search className="h-4 w-4" />}
          Rechercher
        </button>
      </form>

      {error && (
        <div
          className="mt-6 flex items-start gap-3 rounded-xl border p-4"
          style={{ borderColor: '#fecaca', background: '#fef2f2', color: '#991b1b' }}
        >
          <AlertCircle className="h-5 w-5 shrink-0" />
          <p className="text-sm">{error}</p>
        </div>
      )}

      {parcel && <ParcelCard parcel={parcel} />}
    </div>
  );
}

function ParcelCard({ parcel }: { parcel: Parcel }) {
  const formatDate = (d?: string | null) =>
    d ? new Date(d).toLocaleDateString('fr-FR', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' }) : null;

  const statusLabel = STATUS_LABELS[parcel.status] || parcel.status;
  const statusColor = STATUS_COLORS[parcel.status] || 'bg-gray-100 text-gray-800';

  // Timeline simplifiee : cree -> en transit -> arrive -> livre.
  const milestones = [
    { key: 'created', label: 'Colis enregistre', date: parcel.createdAt, done: true },
    { key: 'transit', label: 'En transit', date: null, done: ['IN_TRANSIT', 'ARRIVED', 'RECEIVED', 'DELIVERED'].includes(parcel.status) },
    { key: 'arrived', label: 'Arrive a destination', date: parcel.arrivalDate ?? null, done: ['ARRIVED', 'RECEIVED', 'DELIVERED'].includes(parcel.status) },
    { key: 'delivered', label: 'Remis au destinataire', date: parcel.pickupDate ?? null, done: parcel.status === 'DELIVERED' },
  ];

  // Agence de depart : l'agence du magasin d'origine, sinon la ville d'origine.
  const departureAgency = parcel.warehouse?.agency
    ? `${parcel.warehouse.agency.name}${parcel.warehouse.agency.city ? ` (${parcel.warehouse.agency.city})` : ''}`
    : parcel.origin || null;

  const routeAddedValue = formatAddedValue(parcel.transitRoute?.addedValue, parcel.transitRoute?.addedValueType);

  return (
    <article className="mt-8 overflow-hidden rounded-2xl border shadow-sm" style={{ borderColor: 'var(--skin-border)', background: 'var(--skin-card)' }}>
      <header className="border-b px-6 py-4" style={{ borderColor: 'var(--skin-border)' }}>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <div
              className="flex h-10 w-10 items-center justify-center rounded-xl"
              style={{ background: 'var(--skin-primary)', opacity: 0.15 }}
            >
              <Package className="h-5 w-5" style={{ color: 'var(--skin-primary)' }} />
            </div>
            <div>
              <p className="font-mono text-sm font-bold tracking-tight" style={{ color: 'var(--skin-foreground)' }}>
                {parcel.trackingNumber}
              </p>
              <p className="text-xs" style={{ color: 'var(--skin-muted)' }}>
                {parcel.designation}
              </p>
            </div>
          </div>
          <span className={`inline-flex items-center gap-1 rounded-full px-3 py-1 text-xs font-semibold ${statusColor}`}>
            {statusLabel}
          </span>
        </div>
      </header>

      <div className="grid gap-4 px-6 py-5 sm:grid-cols-2">
        {departureAgency && (
          <InfoItem
            icon={<MapPin className="h-4 w-4" />}
            label="Agence de depart"
            value={departureAgency}
          />
        )}
        <InfoItem
          icon={<MapPin className="h-4 w-4" />}
          label="Agence d'arrivee"
          value={
            parcel.destinationAgency
              ? `${parcel.destinationAgency.name}${parcel.destinationAgency.city ? ` (${parcel.destinationAgency.city})` : ''}`
              : parcel.destination || '-'
          }
        />
        {parcel.warehouse && (
          <InfoItem
            icon={<Building2 className="h-4 w-4" />}
            label="Magasin actuel"
            value={`${parcel.warehouse.name}${parcel.warehouse.agency?.name ? ` - ${parcel.warehouse.agency.name}` : ''}`}
          />
        )}
        {parcel.transitRoute && (
          <InfoItem
            icon={<MapPin className="h-4 w-4" />}
            label="Route de transit"
            value={`${parcel.transitRoute.name} (${parcel.transitRoute.type})`}
          />
        )}
        {routeAddedValue && (
          <InfoItem
            icon={<MapPin className="h-4 w-4" />}
            label="Valeur ajoutee"
            value={routeAddedValue}
          />
        )}
        <InfoItem
          icon={<Clock className="h-4 w-4" />}
          label="Date d'enregistrement"
          value={formatDate(parcel.createdAt) || '-'}
        />
      </div>

      <div className="border-t px-6 py-5" style={{ borderColor: 'var(--skin-border)' }}>
        <h2 className="mb-4 text-xs font-bold uppercase tracking-wider" style={{ color: 'var(--skin-muted)' }}>
          Avancement
        </h2>
        <ol className="space-y-3">
          {milestones.map((m) => (
            <li key={m.key} className="flex items-start gap-3">
              <div
                className={`mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full ${m.done ? 'text-white' : ''}`}
                style={{
                  background: m.done ? 'var(--skin-primary)' : 'var(--skin-border)',
                  color: m.done ? 'white' : 'var(--skin-muted)',
                }}
              >
                <CheckCircle2 className="h-3.5 w-3.5" />
              </div>
              <div className="flex-1">
                <p className="text-sm font-medium" style={{ color: m.done ? 'var(--skin-foreground)' : 'var(--skin-muted)' }}>
                  {m.label}
                </p>
                {m.date && (
                  <p className="text-xs" style={{ color: 'var(--skin-muted)' }}>
                    {formatDate(m.date)}
                  </p>
                )}
              </div>
            </li>
          ))}
        </ol>
      </div>
    </article>
  );
}

function InfoItem({ icon, label, value }: { icon: React.ReactNode; label: string; value: string }) {
  return (
    <div className="flex items-start gap-2">
      <span style={{ color: 'var(--skin-muted)' }}>{icon}</span>
      <div>
        <p className="text-[11px] uppercase tracking-wider" style={{ color: 'var(--skin-muted)' }}>
          {label}
        </p>
        <p className="text-sm font-medium" style={{ color: 'var(--skin-foreground)' }}>
          {value}
        </p>
      </div>
    </div>
  );
}
