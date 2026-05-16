'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { ArrowLeft, Mail, Palette, Smartphone, ShieldAlert } from 'lucide-react';
import { AppearanceTab } from '@/components/studio/AppearanceTab';
import { EmailTab } from '@/components/studio/EmailTab';
import { MobileAppTab } from '@/components/studio/MobileAppTab';
import { getToken } from '@/lib/api/client';

/**
 * Decode role from portal JWT. Le portail authentifie normalement des Clients
 * (qui n'ont pas de role admin) mais on peut hypothetiquement injecter un
 * token admin pour previewer. Si role !== ADMIN/SUPER_ADMIN -> acces refuse.
 */
function getRoleFromToken(): string | null {
  if (typeof window === 'undefined') return null;
  const token = getToken();
  if (!token) return null;
  try {
    const payload = token.split('.')[1];
    if (!payload) return null;
    const json = atob(payload.replace(/-/g, '+').replace(/_/g, '/'));
    const obj = JSON.parse(json) as { role?: string };
    return obj.role ?? null;
  } catch {
    return null;
  }
}

type Tab = 'appearance' | 'email' | 'mobile';

const TABS: { id: Tab; label: string; Icon: typeof Palette }[] = [
  { id: 'appearance', label: 'Apparence', Icon: Palette },
  { id: 'email', label: 'Email', Icon: Mail },
  { id: 'mobile', label: 'App mobile', Icon: Smartphone },
];

export default function StudioPage() {
  const [tab, setTab] = useState<Tab>('appearance');
  const [role, setRole] = useState<string | null | undefined>(undefined);

  // Lecture cote client uniquement (localStorage n'existe pas au SSR).
  useEffect(() => {
    setRole(getRoleFromToken());
  }, []);

  if (role === undefined) {
    // Skeleton silencieux pendant la lecture du token.
    return <div className="min-h-screen" style={{ background: 'var(--skin-background)' }} />;
  }

  if (role !== 'ADMIN' && role !== 'SUPER_ADMIN') {
    return (
      <div className="min-h-screen flex items-center justify-center px-4" style={{ background: 'var(--skin-background)' }}>
        <div className="max-w-md text-center p-10 skin-card">
          <ShieldAlert className="mx-auto mb-4 h-12 w-12" style={{ color: 'var(--skin-primary)' }} />
          <h1 className="text-lg font-semibold mb-2 skin-font-heading" style={{ color: 'var(--skin-foreground)' }}>
            Acces reserve
          </h1>
          <p className="text-sm mb-6" style={{ color: 'var(--skin-foreground-muted)' }}>
            Le Studio est reserve aux administrateurs du tenant. Connectez-vous
            au tableau de bord d&apos;administration pour personnaliser
            l&apos;apparence, l&apos;email et l&apos;application mobile.
          </p>
          <Link
            href="/"
            className="inline-flex items-center gap-2 px-4 py-2 skin-btn-primary skin-radius"
          >
            <ArrowLeft className="h-4 w-4" />
            Retour a l&apos;accueil
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen" style={{ background: 'var(--skin-background)' }}>
      <header
        className="sticky top-0 z-30 border-b backdrop-blur"
        style={{
          background: 'color-mix(in oklab, var(--skin-surface) 82%, transparent)',
          borderColor: 'var(--skin-border)',
        }}
      >
        <div className="mx-auto flex h-16 max-w-[1400px] items-center justify-between px-4 sm:px-6 lg:px-8">
          <div className="flex items-center gap-3">
            <Link
              href="/"
              className="inline-flex h-9 w-9 items-center justify-center skin-btn-ghost"
            >
              <ArrowLeft className="h-4 w-4" />
            </Link>
            <div>
              <p
                className="text-[11px] font-bold uppercase tracking-[0.2em]"
                style={{ color: 'var(--skin-primary)' }}
              >
                Studio
              </p>
              <h1
                className="text-lg font-semibold skin-font-heading"
                style={{ color: 'var(--skin-foreground)' }}
              >
                Personnalisation tenant
              </h1>
            </div>
          </div>

          <nav
            className="hidden items-center gap-1 p-1 sm:flex skin-radius"
            style={{ background: 'var(--skin-background)' }}
          >
            {TABS.map((t) => {
              const active = tab === t.id;
              return (
                <button
                  key={t.id}
                  type="button"
                  onClick={() => setTab(t.id)}
                  className="inline-flex items-center gap-1.5 px-3 py-2 text-sm font-semibold transition-colors"
                  style={{
                    color: active ? '#fff' : 'var(--skin-foreground)',
                    background: active ? 'var(--skin-primary)' : 'transparent',
                    borderRadius: 'calc(var(--skin-radius) - 0.2rem)',
                  }}
                >
                  <t.Icon className="h-4 w-4" />
                  {t.label}
                </button>
              );
            })}
          </nav>
        </div>
        <nav
          className="flex items-center gap-1 overflow-x-auto border-t px-3 py-2 sm:hidden"
          style={{ borderColor: 'var(--skin-border)' }}
        >
          {TABS.map((t) => {
            const active = tab === t.id;
            return (
              <button
                key={t.id}
                type="button"
                onClick={() => setTab(t.id)}
                className="inline-flex shrink-0 items-center gap-1.5 px-3 py-1.5 text-xs font-semibold"
                style={{
                  color: active ? '#fff' : 'var(--skin-foreground)',
                  background: active ? 'var(--skin-primary)' : 'transparent',
                  borderRadius: 'var(--skin-radius)',
                }}
              >
                <t.Icon className="h-3.5 w-3.5" />
                {t.label}
              </button>
            );
          })}
        </nav>
      </header>

      <main className="mx-auto max-w-[1400px] px-4 py-8 sm:px-6 lg:px-8">
        {tab === 'appearance' && <AppearanceTab />}
        {tab === 'email' && <EmailTab />}
        {tab === 'mobile' && <MobileAppTab />}
      </main>
    </div>
  );
}
