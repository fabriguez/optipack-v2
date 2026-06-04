'use client';

import { use, useEffect, useState } from 'react';
import Link from 'next/link';
import { MapPin, Phone, Mail, Clock, Loader2, AlertCircle, Building2, ArrowLeft, ExternalLink } from 'lucide-react';
import axios from 'axios';

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:4000/api/v1';

const DAY_LABELS = ['Dimanche', 'Lundi', 'Mardi', 'Mercredi', 'Jeudi', 'Vendredi', 'Samedi'];
// Ordre d'affichage : lundi -> dimanche.
const DAY_ORDER = [1, 2, 3, 4, 5, 6, 0];

type OpeningHour = { dayOfWeek: number; openTime: string; closeTime: string };

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
  openingHours: OpeningHour[];
};

export default function AgencyDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const [agency, setAgency] = useState<Agency | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setLoading(true);
    setError(null);
    axios
      .get(`${API_URL}/public/agencies/${encodeURIComponent(id)}`)
      .then((r) => setAgency(r.data?.data ?? null))
      .catch((e) => {
        if (e.response?.status === 404) setError('Cette agence est introuvable.');
        else setError(e.response?.data?.message || 'Erreur lors du chargement.');
      })
      .finally(() => setLoading(false));
  }, [id]);

  if (loading) {
    return (
      <div className="flex min-h-[60vh] items-center justify-center">
        <Loader2 className="h-6 w-6 animate-spin" style={{ color: 'var(--skin-primary)' }} />
      </div>
    );
  }

  if (error || !agency) {
    return (
      <div className="mx-auto max-w-2xl px-4 py-20 text-center">
        <div
          className="mx-auto mb-6 flex max-w-md items-start gap-3 rounded-xl border p-4 text-left"
          style={{ borderColor: '#fecaca', background: '#fef2f2', color: '#991b1b' }}
        >
          <AlertCircle className="h-5 w-5 shrink-0" />
          <p className="text-sm">{error || 'Agence introuvable.'}</p>
        </div>
        <Link href="/agencies" className="inline-flex items-center gap-1.5 text-sm font-semibold" style={{ color: 'var(--skin-primary)' }}>
          <ArrowLeft className="h-4 w-4" />
          Retour aux agences
        </Link>
      </div>
    );
  }

  // Regroupe les creneaux par jour (plusieurs plages possibles : ex 8h-12h, 14h-18h).
  const hoursByDay = new Map<number, OpeningHour[]>();
  for (const h of agency.openingHours) {
    const list = hoursByDay.get(h.dayOfWeek) ?? [];
    list.push(h);
    hoursByDay.set(h.dayOfWeek, list);
  }

  return (
    <div className="mx-auto max-w-4xl px-4 sm:px-6 lg:px-8 py-12">
      <Link
        href="/agencies"
        className="mb-6 inline-flex items-center gap-1.5 text-sm font-medium transition-opacity hover:opacity-70"
        style={{ color: 'var(--skin-muted)' }}
      >
        <ArrowLeft className="h-4 w-4" />
        Toutes les agences
      </Link>

      <div
        className="relative aspect-[21/9] w-full overflow-hidden rounded-2xl border"
        style={{
          borderColor: 'var(--skin-border)',
          background: 'color-mix(in oklab, var(--skin-primary) 12%, transparent)',
        }}
      >
        {agency.imageUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={agency.imageUrl} alt={agency.name} className="h-full w-full object-cover" />
        ) : (
          <div className="flex h-full w-full items-center justify-center">
            <Building2 className="h-14 w-14" style={{ color: 'var(--skin-primary)', opacity: 0.4 }} />
          </div>
        )}
      </div>

      <header className="mt-6">
        <p className="text-xs font-bold uppercase tracking-[0.2em]" style={{ color: 'var(--skin-primary)' }}>
          Agence {agency.code}
        </p>
        <h1 className="mt-2 text-3xl font-bold tracking-tight skin-font-heading" style={{ color: 'var(--skin-foreground)' }}>
          {agency.name}
        </h1>
      </header>

      <div className="mt-8 grid gap-6 md:grid-cols-2">
        <section
          className="rounded-2xl border p-6"
          style={{ borderColor: 'var(--skin-border)', background: 'var(--skin-card)' }}
        >
          <h2 className="mb-4 text-xs font-bold uppercase tracking-wider" style={{ color: 'var(--skin-muted)' }}>
            Coordonnees
          </h2>
          <div className="space-y-4">
            <InfoRow icon={<MapPin className="h-4 w-4" />} label="Adresse" value={`${agency.address}, ${agency.city} (${agency.country})`} />
            <InfoRow icon={<Phone className="h-4 w-4" />} label="Telephone" value={agency.phone} href={`tel:${agency.phone}`} />
            {agency.email && (
              <InfoRow icon={<Mail className="h-4 w-4" />} label="Email" value={agency.email} href={`mailto:${agency.email}`} />
            )}
          </div>

          {agency.googleMapsLink && (
            <a
              href={agency.googleMapsLink}
              target="_blank"
              rel="noopener noreferrer"
              className="mt-6 inline-flex items-center gap-1.5 px-4 py-2 text-sm font-semibold skin-btn-primary"
            >
              Voir sur Google Maps
              <ExternalLink className="h-3.5 w-3.5" />
            </a>
          )}
        </section>

        <section
          className="rounded-2xl border p-6"
          style={{ borderColor: 'var(--skin-border)', background: 'var(--skin-card)' }}
        >
          <h2 className="mb-4 flex items-center gap-2 text-xs font-bold uppercase tracking-wider" style={{ color: 'var(--skin-muted)' }}>
            <Clock className="h-4 w-4" />
            Horaires d&apos;ouverture
          </h2>
          {agency.openingHours.length === 0 ? (
            <p className="text-sm" style={{ color: 'var(--skin-muted)' }}>
              Horaires non communiques.
            </p>
          ) : (
            <ul className="space-y-2">
              {DAY_ORDER.map((day) => {
                const slots = hoursByDay.get(day);
                return (
                  <li key={day} className="flex items-center justify-between text-sm">
                    <span className="font-medium" style={{ color: 'var(--skin-foreground)' }}>
                      {DAY_LABELS[day]}
                    </span>
                    <span style={{ color: slots ? 'var(--skin-foreground)' : 'var(--skin-muted)' }}>
                      {slots ? slots.map((s) => `${s.openTime} - ${s.closeTime}`).join(', ') : 'Ferme'}
                    </span>
                  </li>
                );
              })}
            </ul>
          )}
        </section>
      </div>
    </div>
  );
}

function InfoRow({ icon, label, value, href }: { icon: React.ReactNode; label: string; value: string; href?: string }) {
  const content = (
    <p className="text-sm font-medium" style={{ color: 'var(--skin-foreground)' }}>
      {value}
    </p>
  );
  return (
    <div className="flex items-start gap-3">
      <span className="mt-0.5" style={{ color: 'var(--skin-primary)' }}>{icon}</span>
      <div>
        <p className="text-[11px] uppercase tracking-wider" style={{ color: 'var(--skin-muted)' }}>
          {label}
        </p>
        {href ? (
          <a href={href} className="transition-opacity hover:opacity-70">
            {content}
          </a>
        ) : (
          content
        )}
      </div>
    </div>
  );
}
