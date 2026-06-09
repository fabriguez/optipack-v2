'use client';

import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { motion } from 'framer-motion';
import {
  Home,
  Package,
  User,
  LogOut,
  Menu,
  X,
  Bell,
  FileText,
} from 'lucide-react';
import { type ReactNode, useEffect, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Tag } from 'lucide-react';
import { isAuthenticated, portalApi, type ClientProfile } from '@/lib/api/client';
import { useLogout } from '@/lib/hooks/useAuth';
import { cn } from '@/lib/utils';
import { SupportFab } from '@/components/support/SupportFab';

const BASE_NAV = [
  { href: '/app', label: 'Accueil', icon: Home },
  { href: '/app/parcels', label: 'Mes colis', icon: Package },
  { href: '/app/invoices', label: 'Factures', icon: FileText },
  { href: '/app/profile', label: 'Profil', icon: User },
];
const PARTNER_NAV = { href: '/app/tarifs', label: 'Mes tarifs', icon: Tag };

export function DashboardShell({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const logout = useLogout();
  const [open, setOpen] = useState(false);

  useEffect(() => {
    if (!isAuthenticated()) router.replace('/login');
  }, [router]);

  // "Mes tarifs" n'apparait que pour les clients partenaires. On lit isPartner
  // via /me (cache partage avec la page profil).
  const { data: me } = useQuery<ClientProfile>({
    queryKey: ['portal', 'me'],
    queryFn: () => portalApi.getMe(),
    enabled: isAuthenticated(),
  });
  const NAV = me?.isPartner ? [...BASE_NAV, PARTNER_NAV] : BASE_NAV;

  return (
    <div className="min-h-screen" style={{ background: 'var(--skin-background)' }}>
      <header
        className="sticky top-0 z-40 border-b backdrop-blur"
        style={{
          background: 'color-mix(in oklab, var(--skin-surface) 82%, transparent)',
          borderColor: 'var(--skin-border)',
        }}
      >
        <div className="mx-auto flex h-16 max-w-7xl items-center justify-between px-4 sm:px-6 lg:px-8">
          <div className="flex items-center gap-8">
            <Link href="/app" className="flex items-center gap-2">
              <div
                className="flex h-8 w-8 items-center justify-center skin-radius"
                style={{ background: 'var(--skin-primary)' }}
              >
                <Package className="h-4 w-4 text-white" />
              </div>
              <span
                className="text-base font-bold tracking-tight skin-font-heading"
                style={{ color: 'var(--skin-foreground)' }}
              >
                Transit Soft Services
              </span>
            </Link>

            <nav className="hidden md:flex items-center gap-1">
              {NAV.map((item) => {
                const active = item.href === '/app'
                  ? pathname === '/app'
                  : pathname.startsWith(item.href);
                return (
                  <Link
                    key={item.href}
                    href={item.href}
                    className="relative inline-flex items-center gap-1.5 px-3 py-2 text-sm font-medium transition-colors"
                    style={{ color: active ? 'var(--skin-primary)' : 'var(--skin-foreground)' }}
                  >
                    <item.icon className="h-4 w-4" />
                    {item.label}
                    {active && (
                      <motion.span
                        layoutId="active-tab"
                        className="absolute inset-x-1 -bottom-px h-0.5 rounded-full"
                        style={{ background: 'var(--skin-primary)' }}
                      />
                    )}
                  </Link>
                );
              })}
            </nav>
          </div>

          <div className="flex items-center gap-2">
            <button
              type="button"
              className="inline-flex h-9 w-9 items-center justify-center skin-btn-ghost"
              aria-label="Notifications"
            >
              <Bell className="h-4 w-4" />
            </button>
            <button
              type="button"
              onClick={logout}
              className="hidden md:inline-flex items-center gap-1.5 px-3 py-2 text-sm font-medium skin-btn-ghost"
            >
              <LogOut className="h-4 w-4" />
              Quitter
            </button>
            <button
              type="button"
              onClick={() => setOpen((o) => !o)}
              className="md:hidden inline-flex h-9 w-9 items-center justify-center skin-btn-ghost"
            >
              {open ? <X className="h-4 w-4" /> : <Menu className="h-4 w-4" />}
            </button>
          </div>
        </div>
        {open && (
          <div
            className="md:hidden border-t px-4 py-3 space-y-1"
            style={{ background: 'var(--skin-surface)', borderColor: 'var(--skin-border)' }}
          >
            {NAV.map((item) => (
              <Link
                key={item.href}
                href={item.href}
                onClick={() => setOpen(false)}
                className={cn(
                  'flex items-center gap-2 rounded-lg px-3 py-2 text-sm font-medium',
                )}
                style={{
                  color:
                    pathname === item.href
                      ? 'var(--skin-primary)'
                      : 'var(--skin-foreground)',
                }}
              >
                <item.icon className="h-4 w-4" /> {item.label}
              </Link>
            ))}
            <button
              type="button"
              onClick={logout}
              className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-sm font-medium"
              style={{ color: '#dc2626' }}
            >
              <LogOut className="h-4 w-4" /> Quitter
            </button>
          </div>
        )}
      </header>

      <main className="mx-auto max-w-7xl px-4 py-8 sm:px-6 lg:px-8">{children}</main>

      {/* Bulle support flottante, presente sur tout l'espace client. */}
      <SupportFab />
    </div>
  );
}
