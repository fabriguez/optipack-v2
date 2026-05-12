'use client';
import Link from 'next/link';
import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Search, Pencil, ShieldAlert, ShieldCheck } from 'lucide-react';
import { api } from '@/lib/api';
import { formatDate } from '@/lib/utils';
import { Pagination } from '@/components/Pagination';

interface OpsAdmin {
  id: string;
  email: string;
  fullName: string;
  isSuperAdmin: boolean;
  isActive: boolean;
  twoFactorEnabled: boolean;
  lastLoginAt: string | null;
}
interface Listing {
  data: OpsAdmin[];
  meta: { total: number };
}

export default function OpsAdminsPage() {
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(25);
  const [q, setQ] = useState('');

  const { data, isLoading } = useQuery({
    queryKey: ['ops-admins', { page, pageSize, q }],
    queryFn: async (): Promise<Listing> =>
      (await api.get('/ops-admins', { params: { page, pageSize, q } })).data,
    placeholderData: (prev) => prev,
  });

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold">Ops Admins</h1>
        <Link
          href="/ops-admins/new"
          className="rounded-md bg-primary-700 px-3 py-1.5 text-sm text-white hover:bg-primary-900"
        >
          + Inviter
        </Link>
      </div>

      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
        <input
          type="search"
          placeholder="Rechercher par email ou nom..."
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
              <th className="px-4 py-2 text-left font-normal">Email</th>
              <th className="px-4 py-2 text-left font-normal">Nom</th>
              <th className="px-4 py-2 text-left font-normal">Role</th>
              <th className="px-4 py-2 text-left font-normal">2FA</th>
              <th className="px-4 py-2 text-left font-normal">Actif</th>
              <th className="px-4 py-2 text-left font-normal">Dernier login</th>
              <th className="px-4 py-2 text-right font-normal">Actions</th>
            </tr>
          </thead>
          <tbody>
            {isLoading && (
              <tr>
                <td colSpan={7} className="p-4 text-center text-gray-400">
                  Chargement...
                </td>
              </tr>
            )}
            {!isLoading && (data?.data ?? []).length === 0 && (
              <tr>
                <td colSpan={7} className="p-4 text-center text-gray-400">
                  Aucun admin.
                </td>
              </tr>
            )}
            {(data?.data ?? []).map((a) => (
              <tr key={a.id} className="border-t hover:bg-gray-50">
                <td className="px-4 py-2">{a.email}</td>
                <td className="px-4 py-2">{a.fullName}</td>
                <td className="px-4 py-2">
                  {a.isSuperAdmin ? (
                    <span className="inline-flex items-center gap-1 rounded bg-amber-100 px-1.5 py-0.5 text-[10px] font-bold text-amber-700">
                      <ShieldAlert className="h-3 w-3" /> SUPER
                    </span>
                  ) : (
                    <span className="rounded bg-gray-100 px-1.5 py-0.5 text-[10px] font-bold text-gray-600">
                      admin
                    </span>
                  )}
                </td>
                <td className="px-4 py-2">
                  {a.twoFactorEnabled ? (
                    <ShieldCheck className="h-4 w-4 text-emerald-600" />
                  ) : (
                    <ShieldAlert className="h-4 w-4 text-red-500" />
                  )}
                </td>
                <td className="px-4 py-2">
                  <span
                    className={
                      'rounded px-1.5 py-0.5 text-[10px] font-bold ' +
                      (a.isActive
                        ? 'bg-emerald-100 text-emerald-700'
                        : 'bg-gray-100 text-gray-500')
                    }
                  >
                    {a.isActive ? 'ACTIF' : 'INACTIF'}
                  </span>
                </td>
                <td className="px-4 py-2 text-xs text-gray-500">
                  {formatDate(a.lastLoginAt)}
                </td>
                <td className="px-4 py-2 text-right">
                  <Link
                    href={`/ops-admins/${a.id}`}
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
