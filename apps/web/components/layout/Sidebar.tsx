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
  ShieldCheck,
  ChevronLeft,
  ChevronDown,
  LogOut,
} from 'lucide-react';
import { cn } from '@/lib/utils/cn';
import { useTenantMeta } from '@/lib/providers/TenantProvider';
import { AuthedImage } from '@/components/shared/AuthedImage';
import { usePermission } from '@/lib/hooks/usePermission';

interface NavItem {
  label: string;
  href: string;
  icon: React.ElementType;
  /** Module flag pour filtrage par tenant (Phase 0.4) */
  module?: string;
  /** Permission(s) ABAC requise(s) pour afficher l'entree (any). Phase 1 RH. */
  permissions?: string[];
}

const mainNav: NavItem[] = [
  { label: 'Tableau de bord', href: '/', icon: LayoutDashboard },
  { label: 'Agences', href: '/agencies', icon: Building2, module: 'agencies' },
  { label: 'Magasins', href: '/warehouses', icon: Warehouse, module: 'warehouses' },
  { label: 'Clients', href: '/clients', icon: Users, module: 'clients' },
  { label: 'Colis', href: '/parcels', icon: Package, module: 'parcels' },
  { label: 'Conteneurs', href: '/containers', icon: Container, module: 'containers' },
  { label: 'Routes transit', href: '/transit-routes', icon: Route, module: 'transit-routes' },
];

const financeNav: NavItem[] = [
  { label: 'Factures', href: '/invoices', icon: FileText, module: 'invoices' },
  { label: 'Paiements', href: '/payments', icon: CreditCard, module: 'payments' },
  { label: 'Caisse', href: '/cash-register', icon: Vault, module: 'payments' },
  { label: 'Decaissements', href: '/disbursements', icon: Receipt, module: 'disbursements' },
  { label: 'Transferts', href: '/fund-transfers', icon: ArrowRightLeft, module: 'fund-transfers' },
  { label: 'Comptabilite', href: '/accounting', icon: BookOpen, module: 'accounting' },
  { label: 'Depenses', href: '/expenses', icon: HandCoins, module: 'expenses' },
  { label: 'Dettes', href: '/debts', icon: AlertTriangle, module: 'debts' },
];

const adminNav: NavItem[] = [
  {
    label: 'Administration RH',
    href: '/admin/personnel/postes',
    icon: ShieldCheck,
    permissions: ['position.manage', 'permission.manage', 'schedule.manage', 'holiday.manage'],
  },
  {
    label: 'Politique fidelite',
    href: '/admin/loyalty',
    icon: Star,
    permissions: ['system.config'],
  },
];

const systemNav: NavItem[] = [
  { label: 'Personnel', href: '/employees', icon: UserCog, module: 'employees' },
  { label: 'Fidelite', href: '/loyalty', icon: Star, module: 'loyalty' },
  { label: 'Penalites', href: '/penalties', icon: AlertTriangle, module: 'penalties' },
  { label: 'Notifications', href: '/notifications', icon: Bell },
  { label: 'Support', href: '/chat', icon: MessageSquare, module: 'chat' },
  { label: 'Rapports', href: '/reports', icon: BarChart3, module: 'reports' },
  { label: 'Personnalisation', href: '/settings/branding', icon: Settings },
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
  // Permissions effectives de la session : utilisees pour filtrer les items
  // dont l'attribut `permissions` n'est pas satisfait par l'utilisateur.
  const allPerms = items.flatMap((it) => it.permissions ?? []);
  const hasAnyPerm = usePermission(allPerms.length > 0 ? allPerms : ['*'], 'any');
  const visibleItems = items.filter((it) => {
    if (!it.permissions || it.permissions.length === 0) return true;
    return hasAnyPerm; // grossier mais suffisant tant qu'il n'y a qu'un item avec perms par section
  });

  const hasActiveItem = visibleItems.some(
    (item) => pathname === item.href || (item.href !== '/' && pathname.startsWith(item.href)),
  );
  const [open, setOpen] = useState(defaultOpen || hasActiveItem);

  if (visibleItems.length === 0) return null;

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
          {visibleItems.map((item) => {
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
  const { collapsed, setCollapsed, mobileOpen } = useSidebar();
  const { isModuleEnabled, meta } = useTenantMeta();

  // Phase 0.4 : filtre les items selon les modules actives du tenant
  const filterByModule = (items: NavItem[]) =>
    items.filter((it) => !it.module || isModuleEnabled(it.module));

  const filteredMain = filterByModule(mainNav);
  const filteredFinance = filterByModule(financeNav);
  const filteredSystem = filterByModule(systemNav);
  const filteredAdmin = filterByModule(adminNav);

  return (
    <aside
      className={cn(
        // Desktop : sticky cote, toujours visible. Mobile : drawer fixed gauche.
        'top-0 z-40 flex h-screen shrink-0 flex-col bg-sidebar-bg transition-all duration-200',
        // md+ : behavior original
        'md:sticky md:translate-x-0',
        collapsed ? 'md:w-[68px]' : 'md:w-[260px]',
        // Mobile : fixed off-canvas
        'fixed left-0',
        mobileOpen ? 'translate-x-0 w-[260px]' : '-translate-x-full w-[260px]',
      )}
    >
      {/* Logo + nom dynamique du tenant */}
      <div className="flex h-16 items-center justify-between px-4 border-b border-white/10">
        {!collapsed && (
          <div className="flex items-center gap-2 min-w-0">
            {meta?.logoUrl && (
              <AuthedImage src={meta.logoUrl} alt="logo" className="h-8 w-8 object-contain rounded" fallback={<div className="h-8 w-8" />} />
            )}
            <span className="text-lg font-bold text-white tracking-tight truncate">
              {meta?.name ?? 'TransitSoftServices'}
            </span>
          </div>
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

      {/* Navigation : items filtres par modules actives */}
      <div className="flex-1 overflow-y-auto py-3">
        {filteredMain.length > 0 && <NavSection title="Menu" items={filteredMain} collapsed={collapsed} defaultOpen={true} />}
        {filteredFinance.length > 0 && <NavSection title="Finance" items={filteredFinance} collapsed={collapsed} defaultOpen={true} />}
        {filteredSystem.length > 0 && <NavSection title="Systeme" items={filteredSystem} collapsed={collapsed} defaultOpen={false} />}
        {filteredAdmin.length > 0 && <NavSection title="Administration" items={filteredAdmin} collapsed={collapsed} defaultOpen={false} />}
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
