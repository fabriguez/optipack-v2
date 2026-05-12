'use client';
import { use } from 'react';
import Link from 'next/link';
import { ArrowLeft } from 'lucide-react';
import { useQuery } from '@tanstack/react-query';
import { api } from '@/lib/api';
import { formatDate } from '@/lib/utils';
import { StatusBadge } from '@/components/StatusBadge';
import { JobLogsViewer } from '@/components/JobLogsViewer';

interface Job {
  id: string;
  tenantId: string;
  type: string;
  status: string;
  errorMessage: string | null;
  startedAt: string | null;
  finishedAt: string | null;
  createdAt: string;
  payload?: unknown;
}

interface Tenant {
  id: string;
  slug: string;
  name: string;
}

export default function JobDetailPage({
  params,
}: {
  params: Promise<{ id: string; jobId: string }>;
}) {
  const { id, jobId } = use(params);

  const tenant = useQuery({
    queryKey: ['tenant', id],
    queryFn: async (): Promise<Tenant> =>
      (await api.get(`/tenants/${id}`)).data?.data,
  });

  const job = useQuery({
    queryKey: ['tenant', id, 'job', jobId],
    queryFn: async (): Promise<Job> =>
      (await api.get(`/tenants/${id}/jobs/${jobId}`)).data?.data,
    refetchInterval: (q) => {
      const s = (q.state.data as Job | undefined)?.status;
      return s === 'SUCCESS' || s === 'FAILED' ? false : 1500;
    },
  });

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2">
        <Link
          href={`/tenants/${id}`}
          className="inline-flex items-center gap-1 text-xs text-gray-500 hover:text-gray-700"
        >
          <ArrowLeft className="h-3 w-3" /> Retour au tenant
        </Link>
      </div>

      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-2xl font-semibold">
            Job {job.data?.type ?? '...'}{' '}
            {job.data && <StatusBadge status={job.data.status} />}
          </h1>
          <p className="font-mono text-xs text-gray-500">{jobId}</p>
          {tenant.data && (
            <p className="text-sm text-gray-500">
              Tenant{' '}
              <Link href={`/tenants/${id}`} className="font-medium text-primary-700 hover:underline">
                {tenant.data.slug}
              </Link>{' '}
              ({tenant.data.name})
            </p>
          )}
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Info label="Cree">{job.data ? formatDate(job.data.createdAt) : '-'}</Info>
        <Info label="Demarre">{job.data?.startedAt ? formatDate(job.data.startedAt) : '-'}</Info>
        <Info label="Termine">{job.data?.finishedAt ? formatDate(job.data.finishedAt) : '-'}</Info>
        <Info label="Duree">
          {job.data?.startedAt && job.data?.finishedAt
            ? formatDuration(
                new Date(job.data.finishedAt).getTime() - new Date(job.data.startedAt).getTime(),
              )
            : job.data?.startedAt
            ? formatDuration(Date.now() - new Date(job.data.startedAt).getTime()) + ' (en cours)'
            : '-'}
        </Info>
      </div>

      {job.data?.errorMessage && (
        <div className="rounded-md border border-red-200 bg-red-50 p-3">
          <p className="text-xs font-semibold text-red-800">Erreur</p>
          <pre className="mt-1 overflow-x-auto whitespace-pre-wrap text-xs text-red-900">
            {job.data.errorMessage}
          </pre>
        </div>
      )}

      <div className="rounded-lg border bg-white p-4 shadow-sm">
        <h2 className="mb-3 text-sm font-semibold">Logs (live)</h2>
        <JobLogsViewer tenantId={id} jobId={jobId} />
      </div>

      {Boolean(job.data?.payload) && (
        <div className="rounded-lg border bg-white p-4 shadow-sm">
          <h2 className="mb-2 text-sm font-semibold">Payload</h2>
          <pre className="overflow-x-auto rounded bg-gray-50 p-3 text-xs">
            {String(JSON.stringify(job.data?.payload, null, 2))}
          </pre>
        </div>
      )}
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

function formatDuration(ms: number): string {
  if (ms < 1000) return `${ms}ms`;
  const s = Math.floor(ms / 1000);
  if (s < 60) return `${s}s`;
  const m = Math.floor(s / 60);
  const rem = s % 60;
  return `${m}m ${rem}s`;
}
