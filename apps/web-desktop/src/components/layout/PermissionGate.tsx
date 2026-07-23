import { Link, useLocation } from 'react-router-dom';
import { ShieldX } from 'lucide-react';
import { usePermission, useIsTenantAdmin } from '@/lib/hooks/usePermission';
import { useAuthStore } from '@/lib/auth/authStore';
import { matchRoutePolicy } from '@/lib/permissions/dashboardPolicy';

export function PermissionGate({ children }: { children: React.ReactNode }) {
  const pathname = useLocation().pathname ?? '/';
  const status = useAuthStore((s) => s.status);
  const isAdmin = useIsTenantAdmin();
  const { anyOf: requiredKeys, adminOnly } = matchRoutePolicy(pathname);
  const hasKeys = usePermission(requiredKeys, 'any');
  // adminOnly : les permissions ne suffisent pas, seul le rôle admin passe.
  const allowed = adminOnly ? false : hasKeys;

  if (status === 'loading') return <>{children}</>;
  if (isAdmin || allowed) return <>{children}</>;

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
          to="/"
          className="mt-5 inline-flex items-center justify-center rounded-md bg-primary-700 px-4 py-2 text-sm font-medium text-white hover:bg-primary-900"
        >
          Retour au tableau de bord
        </Link>
      </div>
    </div>
  );
}
