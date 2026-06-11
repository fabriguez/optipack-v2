import { Link, useLocation } from 'react-router-dom';
import { cn } from '@/lib/utils/cn';
import { usePermission } from '@/lib/hooks/usePermission';

const TABS = [
  { href: '/admin/personnel/postes', label: 'Postes', perm: ['position.manage', 'personnel.read'] },
  { href: '/admin/personnel/permissions', label: 'Permissions', perm: ['permission.manage'] },
  { href: '/admin/personnel/plannings', label: 'Plannings', perm: ['schedule.manage'] },
  { href: '/admin/personnel/jours-non-ouvres', label: 'Jours non ouvres', perm: ['holiday.manage'] },
];

export default function AdminPersonnelLayout({ children }: { children: React.ReactNode }) {
  const pathname = useLocation().pathname;
  // Acces au moins a une des sections (sinon le menu n'a pas de raison d'etre).
  const canAccess = usePermission(
    [...new Set(TABS.flatMap((t) => t.perm))],
    'any',
  );
  if (!canAccess) {
    return (
      <div className="p-8">
        <h1 className="text-xl font-bold text-gray-900">Administration RH</h1>
        <p className="mt-2 text-sm text-gray-600">Vous n&apos;avez pas l&apos;autorisation d&apos;acceder a cette section.</p>
      </div>
    );
  }
  return (
    <div className="space-y-4 p-4 sm:p-6">
      <header>
        <h1 className="text-2xl font-bold text-gray-900">Administration RH</h1>
        <p className="text-sm text-gray-600">
          Postes, matrice de permissions, plannings et jours non ouvres.
        </p>
      </header>
      <nav className="flex flex-wrap gap-1 border-b border-gray-200">
        {TABS.map((t) => (
          <TabLink key={t.href} href={t.href} label={t.label} perm={t.perm} active={pathname === t.href} />
        ))}
      </nav>
      <div className="pt-2">{children}</div>
    </div>
  );
}

function TabLink({ href, label, perm, active }: { href: string; label: string; perm: string[]; active: boolean }) {
  const allowed = usePermission(perm, 'any');
  if (!allowed) return null;
  return (
    <Link
      to={href}
      className={cn(
        'px-4 py-2 text-sm font-medium border-b-2 -mb-px transition-colors',
        active
          ? 'border-primary-600 text-primary-700'
          : 'border-transparent text-gray-600 hover:text-gray-900 hover:border-gray-300',
      )}
    >
      {label}
    </Link>
  );
}
