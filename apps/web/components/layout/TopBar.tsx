'use client';

import { useState, useEffect, useRef } from 'react';
import { useSession } from 'next-auth/react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { Search, Bell, ChevronDown, Package, Users, Container, FileText, User, Settings, LogOut, X } from 'lucide-react';
import { AppAvatar } from '@/components/ui/AppAvatar';
import { AppDropdownMenu } from '@/components/ui/AppDropdownMenu';
import { AppBadge } from '@/components/ui/AppBadge';
import { useLogout } from '@/lib/hooks/useAuth';
import { apiClient } from '@/lib/api/client';
import { cn } from '@/lib/utils/cn';

export function TopBar() {
  const { data: session } = useSession();
  const router = useRouter();
  const logoutMutation = useLogout();

  const userName = session?.user?.name || 'Utilisateur';
  const userEmail = session?.user?.email || '';

  return (
    <header className="sticky top-0 z-30 flex h-16 items-center justify-between border-b border-gray-200 bg-white px-6">
      <GlobalSearch />

      <div className="flex items-center gap-2">
        <NotificationBell />

        <AppDropdownMenu
          trigger={
            <button className="flex items-center gap-2 rounded-xl px-2 py-1.5 hover:bg-gray-100 transition-colors">
              <AppAvatar fallback={userName} size="sm" />
              <div className="hidden text-left sm:block">
                <p className="text-sm font-medium text-gray-900">{userName}</p>
                <p className="text-xs text-gray-500">{userEmail}</p>
              </div>
              <ChevronDown className="h-4 w-4 text-gray-400" />
            </button>
          }
          items={[
            { label: 'Mon profil', icon: <User className="h-4 w-4" />, onClick: () => router.push('/settings') },
            { label: 'Parametres', icon: <Settings className="h-4 w-4" />, onClick: () => router.push('/settings') },
            { label: 'Deconnexion', icon: <LogOut className="h-4 w-4" />, onClick: () => logoutMutation.mutate(), variant: 'destructive' },
          ]}
        />
      </div>
    </header>
  );
}

function NotificationBell() {
  const router = useRouter();
  const [hasNew, setHasNew] = useState(false);

  return (
    <button
      className="relative rounded-xl p-2 text-gray-500 hover:bg-gray-100 transition-colors"
      onClick={() => { setHasNew(false); router.push('/notifications'); }}
    >
      <Bell
        className={cn('h-5 w-5', hasNew && 'animate-bell-ring')}
        style={{ transformOrigin: 'top center' }}
      />
      {hasNew && <span className="absolute right-1.5 top-1.5 h-2 w-2 rounded-full bg-red-500" />}
    </button>
  );
}

function GlobalSearch() {
  const router = useRouter();
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<any>(null);
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  useEffect(() => {
    if (query.length < 2) { setResults(null); setOpen(false); return; }
    const timer = setTimeout(async () => {
      try {
        const { data } = await apiClient.get('/search', { params: { q: query } });
        setResults(data.data);
        setOpen(true);
      } catch { /* ignore */ }
    }, 300);
    return () => clearTimeout(timer);
  }, [query]);

  const hasResults = results && (
    results.parcels?.length || results.clients?.length || results.containers?.length || results.invoices?.length
  );

  return (
    <div ref={ref} className="relative w-full max-w-lg">
      <Search className="absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
      <input
        type="text"
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        onFocus={() => results && setOpen(true)}
        placeholder="Rechercher colis, client, conteneur, facture..."
        className="h-10 w-full rounded-xl border border-gray-200 bg-gray-50 pl-10 pr-9 text-sm outline-none transition-all focus:border-primary-500 focus:bg-white focus:ring-2 focus:ring-primary-100"
      />
      {query && (
        <button onClick={() => { setQuery(''); setOpen(false); }} className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600">
          <X className="h-3.5 w-3.5" />
        </button>
      )}

      {open && (
        <div className="absolute left-0 top-full z-50 mt-2 w-full rounded-xl border border-gray-200 bg-white shadow-elevated overflow-hidden animate-fade-in">
          {!hasResults ? (
            <p className="px-4 py-6 text-center text-sm text-gray-400">Aucun resultat pour "{query}"</p>
          ) : (
            <div className="max-h-80 overflow-y-auto">
              <ResultSection title="Colis" icon={<Package className="h-4 w-4" />} items={results.parcels} onSelect={(item) => { router.push(`/parcels/${item.id}`); setOpen(false); setQuery(''); }}
                renderItem={(item) => (
                  <div>
                    <span className="font-mono text-xs font-bold text-primary-700">{item.trackingNumber}</span>
                    <span className="ml-2 text-sm text-gray-600">{item.designation}</span>
                  </div>
                )}
              />
              <ResultSection title="Clients" icon={<Users className="h-4 w-4" />} items={results.clients} onSelect={(item) => { router.push(`/clients/${item.id}`); setOpen(false); setQuery(''); }}
                renderItem={(item) => (
                  <div>
                    <span className="text-sm font-medium text-gray-900">{item.fullName}</span>
                    <span className="ml-2 text-xs text-gray-400">{item.phone}</span>
                  </div>
                )}
              />
              <ResultSection title="Conteneurs" icon={<Container className="h-4 w-4" />} items={results.containers} onSelect={(item) => { router.push(`/containers/${item.id}`); setOpen(false); setQuery(''); }}
                renderItem={(item) => (
                  <span className="font-mono text-sm">{item.designation}</span>
                )}
              />
              <ResultSection title="Factures" icon={<FileText className="h-4 w-4" />} items={results.invoices} onSelect={(item) => { router.push(`/invoices/${item.id}`); setOpen(false); setQuery(''); }}
                renderItem={(item) => (
                  <span className="font-mono text-sm">{item.reference}</span>
                )}
              />
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function ResultSection({ title, icon, items, onSelect, renderItem }: {
  title: string;
  icon: React.ReactNode;
  items: any[];
  onSelect: (item: any) => void;
  renderItem: (item: any) => React.ReactNode;
}) {
  if (!items?.length) return null;
  return (
    <div>
      <div className="flex items-center gap-2 px-4 py-2 bg-gray-50 border-b border-gray-100">
        {icon}
        <span className="text-xs font-semibold uppercase tracking-wider text-gray-500">{title}</span>
        <AppBadge className="ml-auto">{items.length}</AppBadge>
      </div>
      {items.map((item) => (
        <button key={item.id} onClick={() => onSelect(item)} className="flex w-full items-center px-4 py-2.5 text-left hover:bg-primary-50/40 transition-colors">
          {renderItem(item)}
        </button>
      ))}
    </div>
  );
}
