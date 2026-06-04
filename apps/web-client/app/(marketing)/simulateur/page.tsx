'use client';

import { useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import {
  Plane,
  Ship,
  Truck,
  Calculator,
  Loader2,
  AlertCircle,
  Sparkles,
  ArrowRight,
} from 'lucide-react';
import Link from 'next/link';
import {
  portalApi,
  isAuthenticated,
  type PublicTransitRoute,
  type PriceSimulation,
} from '@/lib/api/client';

const TYPE_META: Record<
  'AIR' | 'SEA' | 'LAND',
  { label: string; icon: typeof Plane }
> = {
  AIR: { label: 'Aerien', icon: Plane },
  SEA: { label: 'Maritime', icon: Ship },
  LAND: { label: 'Terrestre', icon: Truck },
};

function formatFcfa(n: number): string {
  return `${Math.round(n).toLocaleString('fr-FR')} FCFA`;
}

export default function SimulateurPage() {
  const { data: routes, isLoading: routesLoading } = useQuery({
    queryKey: ['public', 'transit-routes'],
    queryFn: () => portalApi.getPublicTransitRoutes(),
  });

  const [routeId, setRouteId] = useState('');
  const [weight, setWeight] = useState('');
  const [volume, setVolume] = useState('');
  const [result, setResult] = useState<PriceSimulation | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const selected = useMemo<PublicTransitRoute | undefined>(
    () => routes?.find((r) => r.id === routeId),
    [routes, routeId],
  );

  const needsWeight = selected?.type === 'AIR' || selected?.type === 'LAND';
  const needsVolume = selected?.type === 'SEA' || selected?.type === 'LAND';

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selected) return;
    setError(null);
    setResult(null);
    setLoading(true);
    try {
      const payload: { transitRouteId: string; weight?: number; volume?: number } = {
        transitRouteId: selected.id,
      };
      if (needsWeight) payload.weight = Number(weight);
      if (needsVolume) payload.volume = Number(volume);
      const data = await portalApi.simulatePrice(payload);
      setResult(data);
    } catch (err) {
      const e = err as { response?: { data?: { message?: string } } };
      setError(e.response?.data?.message || 'Impossible de calculer le prix. Reessayez.');
    } finally {
      setLoading(false);
    }
  };

  // Reset des saisies quand on change de route (les unites changent).
  const onSelectRoute = (id: string) => {
    setRouteId(id);
    setWeight('');
    setVolume('');
    setResult(null);
    setError(null);
  };

  return (
    <div className="mx-auto max-w-3xl px-4 sm:px-6 lg:px-8 py-16">
      <header className="mb-8 text-center">
        <p
          className="text-xs font-bold uppercase tracking-[0.2em]"
          style={{ color: 'var(--skin-primary)' }}
        >
          Simulateur de prix
        </p>
        <h1
          className="mt-3 text-4xl font-bold tracking-tight skin-font-heading"
          style={{ color: 'var(--skin-foreground)' }}
        >
          Estimez le cout de votre envoi
        </h1>
        <p className="mt-3 text-sm" style={{ color: 'var(--skin-muted)' }}>
          Choisissez une route, renseignez la masse ou le volume, obtenez un prix
          instantanement.
        </p>
      </header>

      <form
        onSubmit={onSubmit}
        className="rounded-2xl border p-6 shadow-sm"
        style={{ borderColor: 'var(--skin-border)', background: 'var(--skin-card)' }}
      >
        {/* Selecteur de route */}
        <label
          className="mb-2 block text-xs font-bold uppercase tracking-wider"
          style={{ color: 'var(--skin-muted)' }}
        >
          Route de transit
        </label>
        {routesLoading ? (
          <div className="flex items-center gap-2 py-3 text-sm" style={{ color: 'var(--skin-muted)' }}>
            <Loader2 className="h-4 w-4 animate-spin" /> Chargement des routes...
          </div>
        ) : (
          <select
            value={routeId}
            onChange={(e) => onSelectRoute(e.target.value)}
            className="skin-input w-full"
            required
          >
            <option value="" disabled>
              Selectionnez une route
            </option>
            {routes?.map((r) => (
              <option key={r.id} value={r.id}>
                {r.name}
              </option>
            ))}
          </select>
        )}

        {/* Saisie masse / volume selon le type */}
        {selected && (
          <div className="mt-5 grid gap-4 sm:grid-cols-2">
            {needsWeight && (
              <div>
                <label
                  className="mb-2 block text-xs font-bold uppercase tracking-wider"
                  style={{ color: 'var(--skin-muted)' }}
                >
                  Masse (kg)
                </label>
                <input
                  type="number"
                  min="0"
                  step="0.01"
                  value={weight}
                  onChange={(e) => setWeight(e.target.value)}
                  placeholder="Ex : 25"
                  className="skin-input w-full"
                  required
                />
              </div>
            )}
            {needsVolume && (
              <div>
                <label
                  className="mb-2 block text-xs font-bold uppercase tracking-wider"
                  style={{ color: 'var(--skin-muted)' }}
                >
                  Volume (m3)
                </label>
                <input
                  type="number"
                  min="0"
                  step="0.001"
                  value={volume}
                  onChange={(e) => setVolume(e.target.value)}
                  placeholder="Ex : 1.5"
                  className="skin-input w-full"
                  required
                />
              </div>
            )}
          </div>
        )}

        <button
          type="submit"
          disabled={!selected || loading}
          className="mt-6 inline-flex w-full items-center justify-center gap-2 py-3 px-6 text-sm font-semibold skin-btn-primary disabled:opacity-50 sm:w-auto"
        >
          {loading ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <Calculator className="h-4 w-4" />
          )}
          Calculer le prix
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

      {result && <ResultCard result={result} />}

      {!isAuthenticated() && (
        <div
          className="mt-6 flex flex-wrap items-center justify-between gap-3 rounded-xl border p-4"
          style={{ borderColor: 'var(--skin-border)', background: 'var(--skin-card)' }}
        >
          <p className="text-sm" style={{ color: 'var(--skin-muted)' }}>
            Vous etes partenaire ? Connectez-vous pour voir vos tarifs negocies.
          </p>
          <Link
            href="/login"
            className="inline-flex items-center gap-1 text-sm font-semibold"
            style={{ color: 'var(--skin-primary)' }}
          >
            Se connecter <ArrowRight className="h-4 w-4" />
          </Link>
        </div>
      )}
    </div>
  );
}

function ResultCard({ result }: { result: PriceSimulation }) {
  const TypeIcon = TYPE_META[result.route.type].icon;
  const b = result.breakdown;

  return (
    <article
      className="mt-8 overflow-hidden rounded-2xl border shadow-sm"
      style={{ borderColor: 'var(--skin-border)', background: 'var(--skin-card)' }}
    >
      <header
        className="flex items-center justify-between gap-3 border-b px-6 py-4"
        style={{ borderColor: 'var(--skin-border)' }}
      >
        <div className="flex items-center gap-3">
          <div
            className="flex h-10 w-10 items-center justify-center rounded-xl"
            style={{ background: 'var(--skin-primary)', opacity: 0.15 }}
          >
            <TypeIcon className="h-5 w-5" style={{ color: 'var(--skin-primary)' }} />
          </div>
          <div>
            <p className="text-sm font-bold" style={{ color: 'var(--skin-foreground)' }}>
              {result.route.departureCity} → {result.route.arrivalCity}
            </p>
            <p className="text-xs" style={{ color: 'var(--skin-muted)' }}>
              {TYPE_META[result.route.type].label} · {result.route.estimatedDurationDays} j estimes
            </p>
          </div>
        </div>
        {result.partnerApplied && (
          <span
            className="inline-flex items-center gap-1 rounded-full px-3 py-1 text-xs font-semibold"
            style={{ background: 'var(--skin-primary)', color: 'white' }}
          >
            <Sparkles className="h-3.5 w-3.5" /> Tarif partenaire
          </span>
        )}
      </header>

      <div className="px-6 py-6 text-center">
        <p className="text-xs uppercase tracking-wider" style={{ color: 'var(--skin-muted)' }}>
          Prix estime
        </p>
        <p
          className="mt-1 text-4xl font-bold tracking-tight"
          style={{ color: 'var(--skin-primary)' }}
        >
          {formatFcfa(result.price)}
        </p>
        {result.partnerApplied && result.savings > 0 && (
          <p className="mt-2 text-sm font-medium" style={{ color: 'var(--skin-foreground)' }}>
            <span style={{ textDecoration: 'line-through', color: 'var(--skin-muted)' }}>
              {formatFcfa(result.standardPrice)}
            </span>{' '}
            — vous economisez {formatFcfa(result.savings)}
          </p>
        )}
      </div>

      <div className="border-t px-6 py-5" style={{ borderColor: 'var(--skin-border)' }}>
        <h2
          className="mb-4 text-xs font-bold uppercase tracking-wider"
          style={{ color: 'var(--skin-muted)' }}
        >
          Detail du calcul
        </h2>
        <dl className="space-y-2 text-sm">
          {result.weight != null && (
            <Row label="Masse" value={`${result.weight} kg × ${formatFcfa(b.ratePerKg)}/kg`} />
          )}
          {result.volume != null && (
            <Row label="Volume" value={`${result.volume} m3 × ${formatFcfa(b.ratePerVolume)}/m3`} />
          )}
          {b.mode === 'max' && (
            <Row
              label="Mode"
              value={`Le plus eleve des deux (${formatFcfa(b.priceByWeight)} vs ${formatFcfa(b.priceByVolume)})`}
            />
          )}
          <Row
            label="Tarif applique"
            value={b.rateSource === 'partner' ? 'Partenaire' : 'Standard'}
          />
        </dl>
        <p className="mt-4 text-[11px]" style={{ color: 'var(--skin-muted)' }}>
          Estimation a titre indicatif, hors frais annexes eventuels (magasinage,
          assurance). Le prix definitif est confirme a l&apos;enregistrement du colis.
        </p>
      </div>
    </article>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between gap-4">
      <dt style={{ color: 'var(--skin-muted)' }}>{label}</dt>
      <dd className="font-medium text-right" style={{ color: 'var(--skin-foreground)' }}>
        {value}
      </dd>
    </div>
  );
}
