'use client';

import { usePathname } from 'next/navigation';
import Link from 'next/link';
import { ShieldX } from 'lucide-react';
import { usePermission, useIsTenantAdmin } from '@/lib/hooks/usePermission';
import { useSession } from 'next-auth/react';

/**
 * Carte route → permission(s) requise(s) (mode "any" : une suffit).
 * `adminOnly` : réservé ADMIN/SUPER_ADMIN quelles que soient les permissions.
 * Préfixe absent = route libre.
 */
const ROUTE_PERMISSION_MAP: Array<{ prefix: string; keys: string[]; adminOnly?: boolean }> = [
  { prefix: '/agencies',        keys: ['agency.read'] },
  { prefix: '/warehouses',      keys: ['warehouse.read'] },
  { prefix: '/clients',         keys: ['client.read'] },
  { prefix: '/parcels',         keys: ['parcel.read'] },
  { prefix: '/parcel-groups',   keys: ['parcel.read', 'parcelgroup.manage'] },
  { prefix: '/containers',      keys: ['container.read'] },
  { prefix: '/transit-routes',  keys: ['transitroute.read'] },
  { prefix: '/invoices',        keys: ['invoice.read'] },
  { prefix: '/payments',        keys: ['payment.read'] },
  { prefix: '/cash-register',   keys: ['cashregister.read'] },
  { prefix: '/disbursements',   keys: ['disbursement.read'] },
  { prefix: '/fund-transfers',  keys: ['transfer.read'] },
  { prefix: '/accounting',      keys: ['accounting.read'] },
  { prefix: '/expenses',        keys: ['expense.read'] },
  { prefix: '/debts',           keys: ['debt.read'] },
  { prefix: '/finance-history', keys: ['finance.history.read', 'finance.dashboard.read'] },
  { prefix: '/employees',       keys: ['personnel.read'] },
  { prefix: '/loyalty',         keys: ['loyalty.read'] },
  { prefix: '/penalties',       keys: ['penalty.read'] },
  { prefix: '/chat',            keys: ['support.read'] },
  { prefix: '/reports',         keys: ['report.read'] },
  { prefix: '/audit-log',       keys: ['audit.read'] },
  { prefix: '/carriers',        keys: ['carrier.read'] },
  { prefix: '/notification-center', keys: ['notification.read'] },
  { prefix: '/notifications',   keys: ['notification.read'] },
  // Personnalisation (/settings/branding), Studio site (/settings/site) et
  // Parametres (/settings) : reserves a l'admin tenant.
  { prefix: '/settings',        keys: [], adminOnly: true },
];

function policyForPath(pathname: string): { keys: string[]; adminOnly: boolean } {
  const match = ROUTE_PERMISSION_MAP.find(
    (m) => pathname === m.prefix || pathname.startsWith(m.prefix + '/'),
  );
  // Routes sans contrainte → tableau vide (usePermission([]) = true)
  return { keys: match?.keys ?? [], adminOnly: !!match?.adminOnly };
}

/**
 * Protège les routes ABAC côté client.
 * Pas de permission → page enfant JAMAIS montée ; on rend une UI 404-like.
 * ADMIN tenant et SUPER_ADMIN passent toujours (wildcard '*').
 */
export function PermissionGate({ children }: { children: React.ReactNode }) {
  const pathname = usePathname() ?? '/';
  const { status } = useSession();
  const isAdmin = useIsTenantAdmin();
  const { keys: requiredKeys, adminOnly } = policyForPath(pathname);
  // Toujours appelé (règle des hooks) ; tableau vide → true automatiquement.
  const hasKeys = usePermission(requiredKeys, 'any');
  // adminOnly : les permissions ne suffisent pas, seul le rôle admin passe.
  const allowed = adminOnly ? false : hasKeys;

  // Pendant le chargement de session : laisse passer pour éviter le flash.
  if (status === 'loading') return <>{children}</>;
  // Admin bypass, ou route libre, ou permission présente.
  if (isAdmin || allowed) return <>{children}</>;

  // Pas de permission → enfants JAMAIS montés.
  return (
    <div className="flex min-h-[70vh] items-center justify-center p-6">
      <div className="max-w-md rounded-xl border bg-white p-8 text-center shadow-sm">
        <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-red-50">
          <ShieldX className="h-7 w-7 text-red-500" />
        </div>
        <p className="mt-2 text-5xl font-bold text-gray-200">404</p>
        <h2 className="mt-1 text-lg font-semibold text-gray-900">Page introuvable</h2>
        <p className="mt-2 text-sm text-gray-500">
          Cette page n&apos;existe pas ou vous n&apos;avez pas les droits d&apos;accès nécessaires.
        </p>
        <Link
          href="/"
          className="mt-5 inline-flex items-center justify-center rounded-md bg-primary-700 px-4 py-2 text-sm font-medium text-white hover:bg-primary-900"
        >
          Retour au tableau de bord
        </Link>
      </div>
    </div>
  );
}
