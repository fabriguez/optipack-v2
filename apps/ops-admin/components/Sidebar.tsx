'use client';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import {
  LayoutDashboard,
  Server,
  Users,
  Package,
  CreditCard,
  Rocket,
  ShieldCheck,
  Database,
  ScrollText,
  LogOut,
} from 'lucide-react';
import { logout } from '@/lib/api';
import { cn } from '@/lib/utils';

const items = [
  { href: '/dashboard', label: 'Dashboard', icon: LayoutDashboard },
  { href: '/vps', label: 'VPS', icon: Server },
  { href: '/tenants', label: 'Tenants', icon: Package },
  { href: '/plans', label: 'Plans', icon: CreditCard },
  { href: '/releases', label: 'Releases', icon: Rocket },
  { href: '/backups', label: 'Backups', icon: Database },
  { href: '/ops-admins', label: 'Ops Admins', icon: Users },
  { href: '/audit-logs', label: 'Audit', icon: ScrollText },
];

export function Sidebar() {
  const path = usePathname();
  const router = useRouter();

  async function handleLogout() {
    await logout();
    router.replace('/login');
  }

  return (
    <aside className="flex h-screen w-60 flex-col border-r bg-white">
      <div className="flex items-center gap-2 px-4 py-4 border-b">
        <ShieldCheck className="text-primary-700" size={22} />
        <span className="font-semibold text-sm">TransitSoft Ops</span>
      </div>
      <nav className="flex-1 overflow-y-auto p-2">
        {items.map((it) => {
          const Icon = it.icon;
          const active = path?.startsWith(it.href);
          return (
            <Link
              key={it.href}
              href={it.href}
              className={cn(
                'flex items-center gap-2 rounded-md px-3 py-2 text-sm transition-colors',
                active
                  ? 'bg-primary-50 text-primary-900 font-medium'
                  : 'text-gray-700 hover:bg-gray-100',
              )}
            >
              <Icon size={16} />
              {it.label}
            </Link>
          );
        })}
      </nav>
      <button
        onClick={handleLogout}
        className="flex items-center gap-2 border-t px-4 py-3 text-sm text-gray-600 hover:bg-gray-50"
      >
        <LogOut size={16} />
        Deconnexion
      </button>
    </aside>
  );
}
