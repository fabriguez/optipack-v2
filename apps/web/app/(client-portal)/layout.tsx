'use client';

import { useEffect, useState, useCallback } from 'react';
import { useRouter, usePathname } from 'next/navigation';
import Link from 'next/link';
import {
  Home,
  Package,
  FileText,
  Bell,
  Building2,
  LogOut,
  Menu,
  X,
  CreditCard,
  Wallet,
  MessageCircle,
} from 'lucide-react';
import {
  isClientAuthenticated,
  removeClientToken,
  clientPortalApi,
} from '@/lib/api/client-portal';
import { cn } from '@/lib/utils';
import { useTenantMeta } from '@/lib/providers/TenantProvider';
import { SupportFab } from '@/components/support/SupportFab';

type NavLink = {
  href: string;
  label: string;
  icon: React.ComponentType<{ className?: string }>;
  badgeKey?: 'notifications' | 'conversations' | 'invoices';
};

const NAV_LINKS: NavLink[] = [
  { href: '/portal/dashboard', label: 'Accueil', icon: Home },
  { href: '/portal/parcels', label: 'Mes Colis', icon: Package },
  {
    href: '/portal/invoices',
    label: 'Factures',
    icon: FileText,
    badgeKey: 'invoices',
  },
  { href: '/portal/payments', label: 'Paiements', icon: CreditCard },
  { href: '/portal/debts', label: 'Mes Dettes', icon: Wallet },
  {
    href: '/portal/support',
    label: 'Messagerie',
    icon: MessageCircle,
    badgeKey: 'conversations',
  },
  {
    href: '/portal/notifications',
    label: 'Notifications',
    icon: Bell,
    badgeKey: 'notifications',
  },
  { href: '/portal/agencies', label: 'Agences', icon: Building2 },
];

interface NavBadges {
  notifications: number;
  conversations: number;
  invoices: number;
}

const ZERO_BADGES: NavBadges = {
  notifications: 0,
  conversations: 0,
  invoices: 0,
};

export default function ClientPortalLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const { meta } = useTenantMeta();
  const orgName = meta?.name?.trim() || '';
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [badges, setBadges] = useState<NavBadges>(ZERO_BADGES);

  const isLoginPage = pathname === '/portal';

  useEffect(() => {
    if (!isLoginPage && !isClientAuthenticated()) {
      router.replace('/portal');
    }
  }, [isLoginPage, router]);

  const refreshBadges = useCallback(() => {
    if (isLoginPage) return;
    clientPortalApi
      .getDashboard()
      .then((res) => {
        const d = res?.data ?? {};
        setBadges({
          notifications: d.inbox?.unreadNotifications ?? 0,
          conversations: d.inbox?.openConversations ?? 0,
          invoices: d.invoices?.unpaidCount ?? 0,
        });
      })
      .catch(() => setBadges(ZERO_BADGES));
  }, [isLoginPage]);

  useEffect(() => {
    refreshBadges();
    const id = setInterval(refreshBadges, 60_000);
    return () => clearInterval(id);
  }, [refreshBadges, pathname]);

  function handleLogout() {
    removeClientToken();
    router.replace('/portal');
  }

  if (isLoginPage) {
    return <>{children}</>;
  }

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Top bar */}
      <header className="sticky top-0 z-50 border-b border-gray-200 bg-white shadow-sm">
        <div className="mx-auto flex h-16 max-w-7xl items-center justify-between px-4 sm:px-6 lg:px-8">
          <Link
            href="/portal/dashboard"
            className="truncate text-lg font-bold text-primary-700 sm:text-xl"
          >
            {orgName}
          </Link>

          {/* Desktop nav */}
          <nav className="hidden xl:flex items-center gap-1">
            {NAV_LINKS.map((link) => (
              <NavItem
                key={link.href}
                link={link}
                active={pathname.startsWith(link.href)}
                badge={link.badgeKey ? badges[link.badgeKey] : 0}
              />
            ))}
          </nav>

          {/* Desktop logout */}
          <button
            onClick={handleLogout}
            className="hidden xl:flex items-center gap-2 rounded-xl px-3 py-2 text-sm font-medium text-gray-600 transition-colors hover:bg-red-50 hover:text-red-600"
          >
            <LogOut className="h-4 w-4" />
            Deconnexion
          </button>

          {/* Mobile menu button */}
          <button
            onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
            className="xl:hidden rounded-xl p-2 text-gray-600 hover:bg-gray-100"
            aria-label={mobileMenuOpen ? 'Fermer le menu' : 'Ouvrir le menu'}
          >
            {mobileMenuOpen ? (
              <X className="h-5 w-5" />
            ) : (
              <Menu className="h-5 w-5" />
            )}
          </button>
        </div>

        {/* Mobile nav */}
        {mobileMenuOpen && (
          <div className="xl:hidden border-t border-gray-100 bg-white px-4 py-3 space-y-1">
            {NAV_LINKS.map((link) => (
              <NavItem
                key={link.href}
                link={link}
                active={pathname.startsWith(link.href)}
                badge={link.badgeKey ? badges[link.badgeKey] : 0}
                mobile
                onClick={() => setMobileMenuOpen(false)}
              />
            ))}
            <button
              onClick={handleLogout}
              className="flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium text-red-600 transition-colors hover:bg-red-50"
            >
              <LogOut className="h-4 w-4" />
              Deconnexion
            </button>
          </div>
        )}
      </header>

      <main className="mx-auto max-w-7xl px-4 py-6 sm:px-6 lg:px-8">
        {children}
      </main>

      {/* Bulle support flottante (cachee sur la page support dediee). */}
      {!pathname.startsWith('/portal/support') && <SupportFab />}
    </div>
  );
}

function NavItem({
  link,
  active,
  badge,
  mobile,
  onClick,
}: {
  link: NavLink;
  active: boolean;
  badge: number;
  mobile?: boolean;
  onClick?: () => void;
}) {
  return (
    <Link
      href={link.href}
      onClick={onClick}
      className={cn(
        'relative flex items-center gap-2 rounded-xl text-sm font-medium transition-colors',
        mobile ? 'px-3 py-2.5' : 'px-3 py-2',
        active
          ? 'bg-primary-50 text-primary-700'
          : 'text-gray-600 hover:bg-gray-100 hover:text-gray-900',
      )}
    >
      <link.icon className="h-4 w-4" />
      <span>{link.label}</span>
      {badge > 0 && (
        <span className="ml-1 inline-flex h-5 min-w-5 items-center justify-center rounded-full bg-primary-600 px-1.5 text-[10px] font-semibold text-white">
          {badge > 99 ? '99+' : badge}
        </span>
      )}
    </Link>
  );
}
