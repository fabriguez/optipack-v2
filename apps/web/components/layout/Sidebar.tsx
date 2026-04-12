'use client';

import { useState } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useLogout } from '@/lib/hooks/useAuth';
import { useSidebar } from './DashboardLayout';
import {
  LayoutDashboard,
  Building2,
  Warehouse,
  Users,
  Package,
  Container,
  Route,
  FileText,
  CreditCard,
  Vault,
  ArrowRightLeft,
  BookOpen,
  Receipt,
  HandCoins,
  UserCog,
  Star,
  AlertTriangle,
  Bell,
  MessageSquare,
  BarChart3,
  Settings,
  Shield,
  ChevronLeft,
  ChevronDown,
  LogOut,
} from 'lucide-react';
import { cn } from '@/lib/utils/cn';

interface NavItem {
  label: string;
  href: string;
  icon: React.ElementType;
}

const mainNav: NavItem[] = [
  { label: 'Tableau de bord', href: '/', icon: LayoutDashboard },
  { label: 'Agences', href: '/agencies', icon: Building2 },
  { label: 'Magasins', href: '/warehouses', icon: Warehouse },
  { label: 'Clients', href: '/clients', icon: Users },
  { label: 'Colis', href: '/parcels', icon: Package },
  { label: 'Conteneurs', href: '/containers', icon: Container },
  { label: 'Routes transit', href: '/transit-routes', icon: Route },
];

const financeNav: NavItem[] = [
  { label: 'Factures', href: '/invoices', icon: FileText },
  { label: 'Paiements', href: '/payments', icon: CreditCard },
  { label: 'Caisse', href: '/cash-register', icon: Vault },
  { label: 'Decaissements', href: '/disbursements', icon: Receipt },
  { label: 'Transferts', href: '/fund-transfers', icon: ArrowRightLeft },
  { label: 'Comptabilite', href: '/accounting', icon: BookOpen },
  { label: 'Depenses', href: '/expenses', icon: HandCoins },
  { label: 'Dettes', href: '/debts', icon: AlertTriangle },
];

const systemNav: NavItem[] = [
  { label: 'Personnel', href: '/employees', icon: UserCog },
  { label: 'Fidelite', href: '/loyalty', icon: Star },
  { label: 'Penalites', href: '/penalties', icon: AlertTriangle },
  { label: 'Notifications', href: '/notifications', icon: Bell },
  { label: 'Support', href: '/chat', icon: MessageSquare },
  { label: 'Rapports', href: '/reports', icon: BarChart3 },
  { label: 'Parametres', href: '/settings', icon: Settings },
  { label: 'Audit', href: '/audit-log', icon: Shield },
];

function NavSection({
  title,
  items,
  collapsed,
  defaultOpen = true,
}: {
  title: string;
  items: NavItem[];
  collapsed: boolean;
  defaultOpen?: boolean;
}) {
  const pathname = usePathname();
  const hasActiveItem = items.some(
    (item) => pathname === item.href || (item.href !== '/' && pathname.startsWith(item.href)),
  );
  const [open, setOpen] = useState(defaultOpen || hasActiveItem);

  return (
    <div className="mb-1">
      {!collapsed && (
        <button
          onClick={() => setOpen(!open)}
          className="flex w-full items-center justify-between px-4 py-1.5 text-[11px] uppercase tracking-wider text-sidebar-muted font-medium hover:text-white transition-colors"
        >
          <span>{title}</span>
          <ChevronDown
            className={cn(
              'h-3.5 w-3.5 transition-transform duration-200',
              !open && '-rotate-90',
            )}
          />
        </button>
      )}
      <div
        className={cn(
          'overflow-hidden transition-all duration-200',
          !collapsed && !open ? 'max-h-0 opacity-0' : 'max-h-[500px] opacity-100',
        )}
      >
        <nav className="flex flex-col gap-0.5 px-2 pb-2">
          {items.map((item) => {
            const isActive =
              pathname === item.href || (item.href !== '/' && pathname.startsWith(item.href));
            return (
              <Link
                key={item.href}
                href={item.href}
                className={cn(
                  'flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-colors',
                  isActive
                    ? 'bg-sidebar-active text-white'
                    : 'text-sidebar-muted hover:bg-sidebar-hover hover:text-white',
                )}
                title={collapsed ? item.label : undefined}
              >
                <item.icon className="h-5 w-5 shrink-0" />
                {!collapsed && <span className="truncate">{item.label}</span>}
              </Link>
            );
          })}
        </nav>
      </div>
    </div>
  );
}

export function Sidebar() {
  const logoutMutation = useLogout();
  const { collapsed, setCollapsed } = useSidebar();

  return (
    <aside
      className={cn(
        'sticky top-0 z-40 flex h-screen shrink-0 flex-col bg-sidebar-bg transition-all duration-200',
        collapsed ? 'w-[68px]' : 'w-[260px]',
      )}
    >
      {/* Logo */}
      <div className="flex h-16 items-center justify-between px-4 border-b border-white/10">
        {!collapsed && (
          <span className="text-xl font-bold text-white tracking-tight">OptiPack</span>
        )}
        <button
          onClick={() => setCollapsed(!collapsed)}
          className="rounded-lg p-1.5 text-sidebar-muted hover:bg-sidebar-hover hover:text-white transition-colors"
        >
          <ChevronLeft
            className={cn('h-5 w-5 transition-transform', collapsed && 'rotate-180')}
          />
        </button>
      </div>

      {/* Navigation */}
      <div className="flex-1 overflow-y-auto py-3">
        <NavSection title="Menu" items={mainNav} collapsed={collapsed} defaultOpen={true} />
        <NavSection title="Finance" items={financeNav} collapsed={collapsed} defaultOpen={true} />
        <NavSection title="Systeme" items={systemNav} collapsed={collapsed} defaultOpen={false} />
      </div>

      {/* Footer */}
      <div className="border-t border-white/10 p-3">
        <button
          onClick={() => logoutMutation.mutate()}
          disabled={logoutMutation.isPending}
          className="flex w-full items-center gap-3 rounded-lg px-3 py-2 text-sm text-sidebar-muted hover:bg-sidebar-hover hover:text-white transition-colors disabled:opacity-50"
        >
          <LogOut className="h-5 w-5 shrink-0" />
          {!collapsed && <span>{logoutMutation.isPending ? 'Deconnexion...' : 'Deconnexion'}</span>}
        </button>
      </div>
    </aside>
  );
}
