'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { MapPin, Phone, Mail, Search, Loader2, AlertCircle, Building2, ArrowRight } from 'lucide-react';
import axios from 'axios';

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:4000/api/v1';

type Agency = {
  id: string;
  name: string;
  code: string;
  address: string;
  city: string;
  country: string;
  phone: string;
  email?: string | null;
  imageUrl?: string | null;
  googleMapsLink?: string | null;
};

export default function AgenciesPage() {
  const [agencies, setAgencies] = useState<Agency[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [query, setQuery] = useState('');

  useEffect(() => {
    setLoading(true);
    setError(null);
    axios
      .get(`${API_URL}/public/agencies`)
      .then((r) => setAgencies(r.data?.data ?? []))
      .catch((e) => setError(e.response?.data?.message || 'Erreur lors du chargement des agences.'))
      .finally(() => setLoading(false));
  }, []);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return agencies;
    return agencies.filter((a) =>
      [a.name, a.city, a.country, a.address].some((v) => v?.toLowerCase().includes(q)),
    );
  }, [agencies, query]);

  return (
    <div className="mx-auto max-w-6xl px-4 sm:px-6 lg:px-8 py-16">
      <header className="mb-8 text-center">
        <p className="text-xs font-bold uppercase tracking-[0.2em]" style={{ color: 'var(--skin-primary)' }}>
          Nos agences
        </p>
        <h1 className="mt-3 text-4xl font-bold tracking-tight skin-font-heading" style={{ color: 'var(--skin-foreground)' }}>
          Trouvez l&apos;agence la plus proche
        </h1>
        <p className="mt-3 text-sm" style={{ color: 'var(--skin-muted)' }}>
          Retrouvez nos points de presence, leurs coordonnees et leurs horaires.
        </p>
      </header>

      <div className="mx-auto mb-10 max-w-md">
        <div className="relative">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2" style={{ color: 'var(--skin-muted)' }} />
          <input
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Rechercher par ville ou nom..."
            className="skin-input w-full pl-10"
          />
        </div>
      </div>

      {loading && (
        <div className="flex min-h-[40vh] items-center justify-center">
          <Loader2 className="h-6 w-6 animate-spin" style={{ color: 'var(--skin-primary)' }} />
        </div>
      )}

      {error && (
        <div
          className="mx-auto flex max-w-md items-start gap-3 rounded-xl border p-4"
          style={{ borderColor: '#fecaca', background: '#fef2f2', color: '#991b1b' }}
        >
          <AlertCircle className="h-5 w-5 shrink-0" />
          <p className="text-sm">{error}</p>
        </div>
      )}

      {!loading && !error && filtered.length === 0 && (
        <p className="text-center text-sm" style={{ color: 'var(--skin-muted)' }}>
          Aucune agence ne correspond a votre recherche.
        </p>
      )}

      {!loading && !error && filtered.length > 0 && (
        <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
          {filtered.map((a) => (
            <AgencyCard key={a.id} agency={a} />
          ))}
        </div>
      )}
    </div>
  );
}

function AgencyCard({ agency }: { agency: Agency }) {
  return (
    <Link
      href={`/agencies/${agency.id}`}
      className="group flex flex-col overflow-hidden rounded-2xl border shadow-sm transition-shadow hover:shadow-md"
      style={{ borderColor: 'var(--skin-border)', background: 'var(--skin-card)' }}
    >
      <div
        className="relative aspect-[16/9] w-full overflow-hidden"
        style={{ background: 'color-mix(in oklab, var(--skin-primary) 12%, transparent)' }}
      >
        {agency.imageUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={agency.imageUrl} alt={agency.name} className="h-full w-full object-cover" />
        ) : (
          <div className="flex h-full w-full items-center justify-center">
            <Building2 className="h-10 w-10" style={{ color: 'var(--skin-primary)', opacity: 0.4 }} />
          </div>
        )}
      </div>

      <div className="flex flex-1 flex-col p-5">
        <h2 className="text-lg font-bold tracking-tight skin-font-heading" style={{ color: 'var(--skin-foreground)' }}>
          {agency.name}
        </h2>

        <div className="mt-3 space-y-2 text-sm" style={{ color: 'var(--skin-muted)' }}>
          <p className="flex items-start gap-2">
            <MapPin className="mt-0.5 h-4 w-4 shrink-0" />
            <span>
              {agency.address}, {agency.city} ({agency.country})
            </span>
          </p>
          <p className="flex items-center gap-2">
            <Phone className="h-4 w-4 shrink-0" />
            <span>{agency.phone}</span>
          </p>
          {agency.email && (
            <p className="flex items-center gap-2">
              <Mail className="h-4 w-4 shrink-0" />
              <span className="truncate">{agency.email}</span>
            </p>
          )}
        </div>

        <span
          className="mt-4 inline-flex items-center gap-1 text-sm font-semibold transition-opacity group-hover:opacity-80"
          style={{ color: 'var(--skin-primary)' }}
        >
          Voir le detail
          <ArrowRight className="h-3.5 w-3.5" />
        </span>
      </div>
    </Link>
  );
}
