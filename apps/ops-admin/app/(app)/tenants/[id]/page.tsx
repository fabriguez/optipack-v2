'use client';
import { use, useState } from 'react';
import Link from 'next/link';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  ArrowLeft,
  Eye,
  PauseCircle,
  PlayCircle,
  Archive,
  Loader2,
} from 'lucide-react';
import { api } from '@/lib/api';
import { StatusBadge } from '@/components/StatusBadge';
import { formatDate } from '@/lib/utils';
import { ConfirmDialog } from '@/components/ConfirmDialog';
import { JobLogsViewer } from '@/components/JobLogsViewer';
import { TenantStudio } from './TenantStudio';
import { TenantMail } from './TenantMail';

interface TenantDetail {
  id: string;
  slug: string;
  name: string;
  ownerEmail: string;
  status: string;
  currentVersion: string | null;
  apiPort: number | null;
  webPort: number | null;
  webClientPort: number | null;
  vps: { id: string; host: string; name: string } | null;
  customDomain: string | null;
  enabledModules: string[];
  isMain?: boolean;
  primaryColor: string | null;
  secondaryColor: string | null;
  accentColor: string | null;
  logoUrl: string | null;
  pinnedVersion: string | null;
  autoUpdatePolicy: string | null;
  skinId?: string | null;
  skinCustomization?: Record<string, unknown> | null;
}

interface Job {
  id: string;
  type: string;
  status: string;
  createdAt: string;
  finishedAt?: string | null;
}

interface UpdateJob {
  id: string;
  fromVersion: string;
  toVersion: string;
  status: string;
  startedAt: string | null;
}

type ActionKind = 'freeze' | 'unfreeze' | 'archive' | 'migrate' | null;

export default function TenantDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = use(params);
  const qc = useQueryClient();
  const [confirm, setConfirm] = useState<ActionKind>(null);
  const [activeJobId, setActiveJobId] = useState<string | null>(null);

  const tenant = useQuery({
    queryKey: ['tenant', id],
    queryFn: async (): Promise<TenantDetail> =>
      (await api.get(`/tenants/${id}`)).data?.data,
  });
  const jobs = useQuery({
    queryKey: ['tenant-jobs', id],
    queryFn: async (): Promise<Job[]> =>
      (await api.get(`/tenants/${id}/jobs`)).data?.data ?? [],
    refetchInterval: activeJobId ? 2000 : false,
  });
  const updates = useQuery({
    queryKey: ['tenant-updates', id],
    queryFn: async (): Promise<UpdateJob[]> =>
      (await api.get(`/tenants/${id}/updates`)).data?.data ?? [],
  });

  function actionMutation(path: 'freeze' | 'unfreeze' | 'archive') {
    return useMutation({
      mutationFn: () => api.post(`/tenants/${id}/${path}`),
      onSuccess: (r) => {
        // Le controller renvoie le job cree (selon TenantController) -- on
        // l'ouvre directement dans le viewer pour suivre les logs en live.
        const job = r.data?.data?.job ?? r.data?.data;
        if (job?.id) setActiveJobId(job.id);
        qc.invalidateQueries({ queryKey: ['tenant', id] });
        qc.invalidateQueries({ queryKey: ['tenant-jobs', id] });
        setConfirm(null);
      },
    });
  }

  const freeze = actionMutation('freeze');
  const unfreeze = actionMutation('unfreeze');
  const archive = actionMutation('archive');

  if (tenant.isLoading || !tenant.data) {
    return <div className="text-sm text-gray-500">Chargement...</div>;
  }
  const t = tenant.data;

  const dialogProps = (() => {
    switch (confirm) {
      case 'freeze':
        return {
          title: `Freezer le tenant ${t.slug} ?`,
          description: `Cela va :\n- Marquer le tenant FROZEN en BDD\n- Couper les conteneurs (sauf tenant principal/VPS local)\n- Caddy renverra une page 503 sur toutes les routes de ce tenant.\n\n${t.isMain ? 'ATTENTION : tenant principal -- le site sera inaccessible pour tes propres clients aussi.' : ''}`,
          destructive: !!t.isMain,
          confirmLabel: 'Freezer',
          requireText: t.isMain ? `FREEZE ${t.slug}` : undefined,
          onConfirm: () => freeze.mutate(),
          loading: freeze.isPending,
        };
      case 'unfreeze':
        return {
          title: `Defreezer ${t.slug} ?`,
          description:
            'Cela va redemarrer les conteneurs et Caddy reprendra le reverse-proxy normal.',
          confirmLabel: 'Defreezer',
          onConfirm: () => unfreeze.mutate(),
          loading: unfreeze.isPending,
        };
      case 'archive':
        return {
          title: `ARCHIVER ${t.slug} ? Action quasi-irreversible.`,
          description: `Cela va :\n- Stopper + supprimer les conteneurs\n- Drop la BDD du tenant (DESTRUCTIF)\n- Retirer les routes Caddy\n- Marquer tenant ARCHIVED\n\nAucun retour en arriere automatique apres ca.`,
          destructive: true,
          confirmLabel: 'Archiver definitivement',
          requireText: `DELETE ${t.slug}`,
          onConfirm: () => archive.mutate(),
          loading: archive.isPending,
        };
      default:
        return null;
    }
  })();

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2">
        <Link
          href="/tenants"
          className="inline-flex items-center gap-1 text-xs text-gray-500 hover:text-gray-700"
        >
          <ArrowLeft className="h-3 w-3" /> Retour aux tenants
        </Link>
      </div>

      <div className="flex items-start justify-between">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-2xl font-semibold">{t.name}</h1>
            {t.isMain && (
              <span className="rounded bg-amber-100 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-amber-700">
                Tenant principal
              </span>
            )}
          </div>
          <p className="font-mono text-sm text-gray-500">{t.slug}</p>
        </div>
        <div className="flex flex-wrap gap-2">
          {t.status === 'ACTIVE' && (
            <button
              type="button"
              onClick={() => setConfirm('freeze')}
              disabled={freeze.isPending}
              className="inline-flex items-center gap-1.5 rounded-md border bg-white px-3 py-1.5 text-sm hover:bg-amber-50 disabled:opacity-50"
            >
              {freeze.isPending ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <PauseCircle className="h-4 w-4" />
              )}
              Freezer
            </button>
          )}
          {t.status === 'FROZEN' && (
            <button
              type="button"
              onClick={() => setConfirm('unfreeze')}
              disabled={unfreeze.isPending}
              className="inline-flex items-center gap-1.5 rounded-md bg-emerald-600 px-3 py-1.5 text-sm text-white hover:bg-emerald-700 disabled:opacity-50"
            >
              {unfreeze.isPending ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <PlayCircle className="h-4 w-4" />
              )}
              Defreezer
            </button>
          )}
          {!t.isMain && t.status !== 'ARCHIVED' && (
            <button
              type="button"
              onClick={() => setConfirm('archive')}
              disabled={archive.isPending}
              className="inline-flex items-center gap-1.5 rounded-md border border-red-200 bg-white px-3 py-1.5 text-sm text-red-600 hover:bg-red-50 disabled:opacity-50"
            >
              <Archive className="h-4 w-4" />
              Archiver
            </button>
          )}
        </div>
      </div>

      <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
        <Info label="Status">
          <StatusBadge status={t.status} />
        </Info>
        <Info label="Version">{t.currentVersion ?? '-'}</Info>
        <Info label="VPS">
          {t.vps ? (
            <Link href={`/vps/${t.vps.id}`} className="hover:underline">
              {t.vps.name}
            </Link>
          ) : (
            '-'
          )}
        </Info>
        <Info label="Owner">{t.ownerEmail}</Info>
        <Info label="API port">{t.apiPort ?? '-'}</Info>
        <Info label="Web port">{t.webPort ?? '-'}</Info>
        <Info label="Web-client port">{t.webClientPort ?? '-'}</Info>
        <Info label="Custom domain">{t.customDomain ?? '-'}</Info>
      </div>

      <Section title="Messagerie (Resend)">
        <TenantMail tenantId={t.id} />
      </Section>

      <Section title="Studio (theme et configuration)">
        <TenantStudio
          tenantId={t.id}
          initial={{
            primaryColor: t.primaryColor,
            secondaryColor: t.secondaryColor,
            accentColor: t.accentColor,
            logoUrl: t.logoUrl,
            enabledModules: t.enabledModules ?? [],
            pinnedVersion: t.pinnedVersion,
            autoUpdatePolicy: t.autoUpdatePolicy,
            customDomain: t.customDomain,
            skinId: t.skinId ?? null,
            skinCustomization: (t.skinCustomization as never) ?? null,
          }}
        />
      </Section>

      {activeJobId && (
        <Section
          title="Job en cours"
          action={
            <button
              type="button"
              onClick={() => setActiveJobId(null)}
              className="text-xs text-gray-500 hover:text-gray-700"
            >
              Fermer le viewer
            </button>
          }
        >
          <JobLogsViewer tenantId={id} jobId={activeJobId} />
        </Section>
      )}

      <Section title="Jobs de provisioning">
        <table className="w-full text-sm">
          <thead className="text-xs text-gray-500">
            <tr>
              <th className="text-left font-normal">Type</th>
              <th className="text-left font-normal">Status</th>
              <th className="text-left font-normal">Cree</th>
              <th className="text-left font-normal">Termine</th>
              <th className="text-right font-normal"></th>
            </tr>
          </thead>
          <tbody>
            {(jobs.data ?? []).slice(0, 10).map((j) => (
              <tr key={j.id} className="border-t">
                <td className="py-2">{j.type}</td>
                <td className="py-2">
                  <StatusBadge status={j.status} />
                </td>
                <td className="py-2 text-xs text-gray-500">{formatDate(j.createdAt)}</td>
                <td className="py-2 text-xs text-gray-500">
                  {j.finishedAt ? formatDate(j.finishedAt) : '-'}
                </td>
                <td className="py-2 text-right">
                  <div className="inline-flex items-center gap-1">
                    <button
                      type="button"
                      onClick={() => setActiveJobId(j.id)}
                      className="inline-flex items-center gap-1 rounded border px-2 py-1 text-xs hover:bg-gray-50"
                      title="Apercu rapide des logs"
                    >
                      <Eye className="h-3 w-3" /> Logs
                    </button>
                    <Link
                      href={`/tenants/${id}/jobs/${j.id}`}
                      className="inline-flex items-center gap-1 rounded border px-2 py-1 text-xs hover:bg-gray-50"
                      title="Page complete du job"
                    >
                      Ouvrir
                    </Link>
                  </div>
                </td>
              </tr>
            ))}
            {(jobs.data ?? []).length === 0 && (
              <tr>
                <td colSpan={5} className="py-4 text-center text-xs text-gray-400">
                  Aucun job.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </Section>

      <Section title="Updates de version">
        <table className="w-full text-sm">
          <thead className="text-xs text-gray-500">
            <tr>
              <th className="text-left font-normal">De</th>
              <th className="text-left font-normal">Vers</th>
              <th className="text-left font-normal">Status</th>
              <th className="text-left font-normal">Demarre</th>
            </tr>
          </thead>
          <tbody>
            {(updates.data ?? []).map((u) => (
              <tr key={u.id} className="border-t">
                <td className="py-2 font-mono text-xs">{u.fromVersion}</td>
                <td className="py-2 font-mono text-xs">{u.toVersion}</td>
                <td className="py-2">
                  <StatusBadge status={u.status} />
                </td>
                <td className="py-2 text-xs text-gray-500">{formatDate(u.startedAt)}</td>
              </tr>
            ))}
            {(updates.data ?? []).length === 0 && (
              <tr>
                <td colSpan={4} className="py-4 text-center text-xs text-gray-400">
                  Aucune mise a jour.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </Section>

      {dialogProps && (
        <ConfirmDialog
          open={confirm !== null}
          onCancel={() => setConfirm(null)}
          {...dialogProps}
        />
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

function Section({
  title,
  action,
  children,
}: {
  title: string;
  action?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <div className="rounded-lg border bg-white p-4 shadow-sm">
      <div className="mb-3 flex items-center justify-between">
        <h2 className="text-sm font-semibold">{title}</h2>
        {action}
      </div>
      {children}
    </div>
  );
}
