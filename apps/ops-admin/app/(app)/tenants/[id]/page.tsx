'use client';
import { use } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '@/lib/api';
import { StatusBadge } from '@/components/StatusBadge';
import { formatDate } from '@/lib/utils';

interface TenantDetail {
  id: string;
  slug: string;
  name: string;
  ownerEmail: string;
  status: string;
  currentVersion: string | null;
  apiPort: number | null;
  webPort: number | null;
  vps: { host: string } | null;
  customDomain: string | null;
  enabledModules: string[];
}

export default function TenantDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = use(params);
  const qc = useQueryClient();

  const tenant = useQuery({
    queryKey: ['tenant', id],
    queryFn: async (): Promise<TenantDetail> =>
      (await api.get(`/tenants/${id}`)).data?.data,
  });
  const jobs = useQuery({
    queryKey: ['tenant-jobs', id],
    queryFn: async () => (await api.get(`/tenants/${id}/jobs`)).data?.data ?? [],
  });
  const updates = useQuery({
    queryKey: ['tenant-updates', id],
    queryFn: async () => (await api.get(`/tenants/${id}/updates`)).data?.data ?? [],
  });

  const freeze = useMutation({
    mutationFn: () => api.post(`/tenants/${id}/freeze`),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['tenant', id] }),
  });
  const unfreeze = useMutation({
    mutationFn: () => api.post(`/tenants/${id}/unfreeze`),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['tenant', id] }),
  });

  if (tenant.isLoading || !tenant.data) {
    return <div className="text-gray-500">Chargement...</div>;
  }
  const t = tenant.data;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold">{t.name}</h1>
          <p className="font-mono text-sm text-gray-500">{t.slug}</p>
        </div>
        <div className="flex gap-2">
          {t.status === 'ACTIVE' && (
            <button
              onClick={() => freeze.mutate()}
              className="rounded-md border px-3 py-1.5 text-sm hover:bg-gray-50"
              disabled={freeze.isPending}
            >
              Freeze
            </button>
          )}
          {t.status === 'FROZEN' && (
            <button
              onClick={() => unfreeze.mutate()}
              className="rounded-md bg-primary-700 px-3 py-1.5 text-sm text-white hover:bg-primary-900"
              disabled={unfreeze.isPending}
            >
              Unfreeze
            </button>
          )}
        </div>
      </div>

      <div className="grid grid-cols-2 gap-4">
        <Info label="Status">
          <StatusBadge status={t.status} />
        </Info>
        <Info label="Version">{t.currentVersion ?? '-'}</Info>
        <Info label="VPS">{t.vps?.host ?? '-'}</Info>
        <Info label="Owner">{t.ownerEmail}</Info>
        <Info label="API port">{t.apiPort ?? '-'}</Info>
        <Info label="Web port">{t.webPort ?? '-'}</Info>
        <Info label="Custom domain">{t.customDomain ?? '-'}</Info>
        <Info label="Modules">{(t.enabledModules ?? []).join(', ') || '-'}</Info>
      </div>

      <Section title="Updates">
        <table className="w-full text-sm">
          <thead className="text-xs text-gray-500">
            <tr>
              <th className="text-left font-normal">From</th>
              <th className="text-left font-normal">To</th>
              <th className="text-left font-normal">Status</th>
              <th className="text-left font-normal">Started</th>
            </tr>
          </thead>
          <tbody>
            {(updates.data ?? []).map(
              (u: {
                id: string;
                fromVersion: string;
                toVersion: string;
                status: string;
                startedAt: string | null;
              }) => (
                <tr key={u.id} className="border-t">
                  <td className="py-2 font-mono text-xs">{u.fromVersion}</td>
                  <td className="py-2 font-mono text-xs">{u.toVersion}</td>
                  <td className="py-2">
                    <StatusBadge status={u.status} />
                  </td>
                  <td className="py-2 text-xs text-gray-500">
                    {formatDate(u.startedAt)}
                  </td>
                </tr>
              ),
            )}
          </tbody>
        </table>
      </Section>

      <Section title="Jobs de provisioning">
        <table className="w-full text-sm">
          <thead className="text-xs text-gray-500">
            <tr>
              <th className="text-left font-normal">Type</th>
              <th className="text-left font-normal">Status</th>
              <th className="text-left font-normal">Cree</th>
            </tr>
          </thead>
          <tbody>
            {(jobs.data ?? []).map(
              (j: {
                id: string;
                type: string;
                status: string;
                createdAt: string;
              }) => (
                <tr key={j.id} className="border-t">
                  <td className="py-2">{j.type}</td>
                  <td className="py-2">
                    <StatusBadge status={j.status} />
                  </td>
                  <td className="py-2 text-xs text-gray-500">
                    {formatDate(j.createdAt)}
                  </td>
                </tr>
              ),
            )}
          </tbody>
        </table>
      </Section>
    </div>
  );
}

function Info({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="rounded-md border bg-white px-3 py-2 shadow-sm">
      <div className="text-xs uppercase text-gray-500">{label}</div>
      <div className="mt-1 text-sm">{children}</div>
    </div>
  );
}

function Section({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <div className="rounded-lg border bg-white p-4 shadow-sm">
      <h2 className="mb-3 text-sm font-semibold">{title}</h2>
      {children}
    </div>
  );
}
