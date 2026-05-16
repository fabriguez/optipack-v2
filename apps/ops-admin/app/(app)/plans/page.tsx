'use client';
import Link from 'next/link';
import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Search, Pencil } from 'lucide-react';
import { api } from '@/lib/api';
import { Pagination } from '@/components/Pagination';

interface Plan {
  id: string;
  code: string;
  name: string;
  cpuLimit: number;
  memoryMb: number;
  diskQuotaGb: number;
  pricePerMonth: string | number;
  currency: string;
  isActive: boolean;
  isPublic: boolean;
}
interface Listing {
  data: Plan[];
  meta: { total: number };
}

export default function PlansPage() {
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(25);
  const [q, setQ] = useState('');

  const { data, isLoading } = useQuery({
    queryKey: ['plans', { page, pageSize, q }],
    queryFn: async (): Promise<Listing> =>
      // Pas de filtre active : on veut voir actifs ET inactifs cote ops.
      (await api.get('/plans', { params: { page, pageSize, q } })).data,
    placeholderData: (prev) => prev,
  });

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold">Plans de ressources</h1>
        <Link
          href="/plans/new"
          className="rounded-md bg-primary-700 px-3 py-1.5 text-sm text-white hover:bg-primary-900"
        >
          + Nouveau plan
        </Link>
      </div>

      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
        <input
          type="search"
          placeholder="Rechercher par code ou nom..."
          value={q}
          onChange={(e) => {
            setQ(e.target.value);
            setPage(1);
          }}
          className="w-full rounded-md border bg-white pl-9 pr-3 py-2 text-sm shadow-sm"
        />
      </div>

      <div className="overflow-hidden rounded-lg border bg-white shadow-sm">
        <table className="w-full text-sm">
          <thead className="border-b bg-gray-50 text-xs text-gray-500">
            <tr>
              <th className="px-4 py-2 text-left font-normal">Code</th>
              <th className="px-4 py-2 text-left font-normal">Nom</th>
              <th className="px-4 py-2 text-left font-normal">CPU</th>
              <th className="px-4 py-2 text-left font-normal">RAM (Mo)</th>
              <th className="px-4 py-2 text-left font-normal">Disk (Go)</th>
              <th className="px-4 py-2 text-left font-normal">Prix / mois</th>
              <th className="px-4 py-2 text-left font-normal">Etat</th>
              <th className="px-4 py-2 text-right font-normal">Actions</th>
            </tr>
          </thead>
          <tbody>
            {isLoading && (
              <tr>
                <td colSpan={8} className="p-4 text-center text-gray-400">
                  Chargement...
                </td>
              </tr>
            )}
            {!isLoading && (data?.data ?? []).length === 0 && (
              <tr>
                <td colSpan={8} className="p-4 text-center text-gray-400">
                  Aucun plan.
                </td>
              </tr>
            )}
            {(data?.data ?? []).map((p) => (
              <tr key={p.id} className="border-t hover:bg-gray-50">
                <td className="px-4 py-2 font-mono text-xs">{p.code}</td>
                <td className="px-4 py-2">{p.name}</td>
                <td className="px-4 py-2">{p.cpuLimit}</td>
                <td className="px-4 py-2">{p.memoryMb}</td>
                <td className="px-4 py-2">{p.diskQuotaGb}</td>
                <td className="px-4 py-2">
                  {p.pricePerMonth} {p.currency}
                </td>
                <td className="px-4 py-2">
                  <span
                    className={
                      'rounded px-1.5 py-0.5 text-[10px] font-bold ' +
                      (p.isActive ? 'bg-emerald-100 text-emerald-700' : 'bg-gray-100 text-gray-500')
                    }
                  >
                    {p.isActive ? 'ACTIF' : 'INACTIF'}
                  </span>
                </td>
                <td className="px-4 py-2 text-right">
                  <Link
                    href={`/plans/${p.id}`}
                    className="inline-flex items-center gap-1 rounded border px-2 py-1 text-xs hover:bg-gray-50"
                  >
                    <Pencil className="h-3 w-3" /> Editer
                  </Link>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        <Pagination
          page={page}
          pageSize={pageSize}
          total={data?.meta?.total ?? 0}
          onPageChange={setPage}
          onPageSizeChange={(s) => {
            setPageSize(s);
            setPage(1);
          }}
        />
      </div>
    </div>
  );
}
