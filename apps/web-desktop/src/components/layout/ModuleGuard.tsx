import { Link, useLocation } from 'react-router-dom';
import { Lock } from 'lucide-react';
import { useTenantMeta } from '@/lib/providers/TenantProvider';

/**
 * Mapping route prefix -> code module. Doit rester aligne avec les flags
 * `module:` declares dans Sidebar.tsx et la liste KNOWN_MODULES de
 * l'ops-admin TenantStudio. Une route absente de ce mapping est toujours
 * accessible (ex: /notifications, /settings, /audit-log, /, /admin/*).
 */
const ROUTE_MODULE_MAP: Array<{ prefix: string; module: string }> = [
  { prefix: '/agencies', module: 'agencies' },
  { prefix: '/warehouses', module: 'warehouses' },
  { prefix: '/clients', module: 'clients' },
  { prefix: '/parcels', module: 'parcels' },
  { prefix: '/containers', module: 'containers' },
  { prefix: '/transit-routes', module: 'transit-routes' },
  { prefix: '/invoices', module: 'invoices' },
  { prefix: '/payments', module: 'payments' },
  { prefix: '/cash-register', module: 'payments' },
  { prefix: '/disbursements', module: 'disbursements' },
  { prefix: '/fund-transfers', module: 'fund-transfers' },
  { prefix: '/accounting', module: 'accounting' },
  { prefix: '/expenses', module: 'expenses' },
  { prefix: '/debts', module: 'debts' },
  { prefix: '/employees', module: 'employees' },
  { prefix: '/loyalty', module: 'loyalty' },
  { prefix: '/penalties', module: 'penalties' },
  { prefix: '/chat', module: 'chat' },
  { prefix: '/reports', module: 'reports' },
];

function requiredModuleForPath(pathname: string): string | null {
  const match = ROUTE_MODULE_MAP.find(
    (m) => pathname === m.prefix || pathname.startsWith(m.prefix + '/'),
  );
  return match?.module ?? null;
}

export function ModuleGuard({ children }: { children: React.ReactNode }) {
  const pathname = useLocation().pathname ?? '/';
  const { isModuleEnabled, meta, loading } = useTenantMeta();

  // Pendant le boot du provider, on laisse passer pour eviter le flash.
  if (loading || !meta) return <>{children}</>;

  const required = requiredModuleForPath(pathname);
  if (!required) return <>{children}</>;
  if (isModuleEnabled(required)) return <>{children}</>;

  return (
    <div className="flex min-h-[60vh] items-center justify-center p-6">
      <div className="max-w-md rounded-xl border bg-white p-6 text-center shadow-sm">
        <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-amber-100">
          <Lock className="h-6 w-6 text-amber-700" />
        </div>
        <h2 className="mt-4 text-lg font-semibold text-gray-900">Module desactive</h2>
        <p className="mt-2 text-sm text-gray-600">
          Le module <span className="font-mono text-xs">{required}</span> n&apos;est
          pas active pour ton organisation. Contacte l&apos;administrateur si tu
          penses qu&apos;il devrait l&apos;etre.
        </p>
        <Link
          to="/"
          className="mt-4 inline-flex items-center justify-center rounded-md bg-primary-700 px-4 py-2 text-sm font-medium text-white hover:bg-primary-900"
        >
          Retour au tableau de bord
        </Link>
      </div>
    </div>
  );
}
