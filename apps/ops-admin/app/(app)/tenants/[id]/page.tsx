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
  Flame,
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
  themeId?: string | null;
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

type ActionKind = 'freeze' | 'unfreeze' | 'archive' | 'purge' | 'migrate' | null;

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
  // Purge utilise DELETE (pas POST) sur endpoint dedie.
  const purge = useMutation({
    mutationFn: () => api.delete(`/tenants/${id}/purge`),
    onSuccess: (r) => {
      const job = r.data?.data?.job ?? r.data?.data;
      if (job?.jobId) setActiveJobId(job.jobId);
      qc.invalidateQueries({ queryKey: ['tenant', id] });
      qc.invalidateQueries({ queryKey: ['tenant-jobs', id] });
      setConfirm(null);
    },
  });

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
          title: `Archiver ${t.slug} ?`,
          description: `Archivage :\n- Stop + suppression des conteneurs\n- Suppression des volumes (PG/Redis/MinIO)\n- Retrait routes Caddy\n- Statut -> ARCHIVED (record garde, billing arrete)\n\nReprovisioning possible plus tard.`,
          destructive: true,
          confirmLabel: 'Archiver',
          requireText: `ARCHIVE ${t.slug}`,
          onConfirm: () => archive.mutate(),
          loading: archive.isPending,
        };
      case 'purge':
        return {
          title: `SUPPRIMER DEFINITIVEMENT ${t.slug} ?`,
          description: `Suppression DEFINITIVE :\n- Conteneurs + images locales + volumes + network\n- Fichiers compose/env/seed sur le VPS\n- Record tenant + jobs + subscriptions dans la DB orchestrator\n\nAucun retour en arriere. Aucun archivage.`,
          destructive: true,
          confirmLabel: 'Supprimer definitivement',
          requireText: `PURGE ${t.slug}`,
          onConfirm: () => purge.mutate(),
          loading: purge.isPending,
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
          {!t.isMain && (
            <button
              type="button"
              onClick={() => setConfirm('purge')}
              disabled={purge.isPending}
              className="inline-flex items-center gap-1.5 rounded-md border border-red-300 bg-red-50 px-3 py-1.5 text-sm font-semibold text-red-700 hover:bg-red-100 disabled:opacity-50"
              title="Suppression definitive (containers + volumes + record DB)"
            >
              <Flame className="h-4 w-4" />
              Supprimer
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

      <Section title="URLs publiques du tenant">
        <TenantUrls slug={t.slug} customDomain={t.customDomain} isMain={!!t.isMain} />
      </Section>

      <Section title="Compte admin tenant">
        <OwnerCredentials tenantId={t.id} ownerEmail={t.ownerEmail} />
      </Section>

      <Section title="Containers (stack tenant)">
        <TenantContainers tenantId={t.id} />
      </Section>

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
            themeId: t.themeId ?? null,
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

/**
 * Liens publics du tenant calcules depuis slug + customDomain + BASE_DOMAIN.
 * Reproduit la logique routing de CaddyService :
 *   main tenant :  base / app.base / api.base
 *   regular      :  slug.base / app.slug.base / api.slug.base
 *   custom domain : override du host public (web-client) si fourni
 */
function TenantUrls({
  slug,
  customDomain,
  isMain,
}: {
  slug: string;
  customDomain: string | null;
  isMain: boolean;
}) {
  const base = process.env.NEXT_PUBLIC_BASE_DOMAIN || 'transitsoftservices.com';
  const publicHost = isMain ? base : `${slug}.${base}`;
  const staffHost = isMain ? `app.${base}` : `app.${slug}.${base}`;
  const apiHost = isMain ? `api.${base}` : `api.${slug}.${base}`;
  const links: { label: string; url: string; sub?: string }[] = [
    { label: 'Site public + portail client', url: `https://${publicHost}`, sub: 'web-client (skin)' },
    { label: 'Dashboard staff', url: `https://${staffHost}`, sub: 'web (admin tenant)' },
    { label: 'API tenant', url: `https://${apiHost}/api/v1`, sub: 'backend REST' },
  ];
  if (customDomain) {
    links.unshift({ label: 'Custom domain', url: `https://${customDomain}`, sub: 'alias public' });
  }
  return (
    <div className="space-y-2">
      {links.map((l) => (
        <div key={l.url} className="flex items-start justify-between gap-3 rounded border bg-gray-50 px-3 py-2">
          <div className="min-w-0">
            <p className="text-xs font-medium text-gray-700">{l.label}</p>
            <a
              href={l.url}
              target="_blank"
              rel="noopener noreferrer"
              className="block truncate font-mono text-xs text-primary-700 hover:underline"
            >
              {l.url}
            </a>
            {l.sub && <p className="mt-0.5 text-[10px] text-gray-400">{l.sub}</p>}
          </div>
          <div className="flex shrink-0 items-center gap-1">
            <button
              type="button"
              onClick={() => navigator.clipboard.writeText(l.url).catch(() => {})}
              className="rounded border bg-white px-2 py-1 text-[11px] text-gray-600 hover:bg-gray-100"
              title="Copier"
            >
              Copier
            </button>
            <a
              href={l.url}
              target="_blank"
              rel="noopener noreferrer"
              className="rounded border bg-white px-2 py-1 text-[11px] text-gray-600 hover:bg-gray-100"
              title="Ouvrir dans un nouvel onglet"
            >
              Ouvrir
            </a>
          </div>
        </div>
      ))}
    </div>
  );
}

/**
 * Section "Compte admin tenant" : affiche l'email owner, permet de generer
 * une nouvelle pwd. La plaintext n'est affichee qu'une seule fois apres
 * generation (jamais persistee cote ops-admin). Bouton copy + show/hide.
 */
function OwnerCredentials({ tenantId, ownerEmail }: { tenantId: string; ownerEmail: string }) {
  const [generated, setGenerated] = useState<{ email: string; password: string } | null>(null);
  const [visible, setVisible] = useState(false);
  const [copied, setCopied] = useState(false);
  const reset = useMutation({
    mutationFn: async () =>
      (await api.post(`/tenants/${tenantId}/reset-owner-password`)).data?.data as {
        email: string;
        password: string;
      },
    onSuccess: (data) => {
      setGenerated(data);
      setVisible(true);
    },
  });

  const copyPwd = async () => {
    if (!generated) return;
    try {
      await navigator.clipboard.writeText(generated.password);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {/* clipboard refuse */}
  };

  return (
    <div className="space-y-3">
      <div className="grid grid-cols-1 gap-2 text-sm sm:grid-cols-2">
        <div>
          <p className="text-xs text-gray-500">Email owner (SUPER_ADMIN)</p>
          <p className="font-mono text-sm">{ownerEmail}</p>
        </div>
        <div>
          <p className="text-xs text-gray-500">Mot de passe initial</p>
          <p className="text-xs italic text-gray-400">
            Genere a la creation du tenant. Visible dans les logs du job
            PROVISION (cherche &quot;OWNER CREDENTIALS&quot;). Si perdu, regenere ci-dessous.
          </p>
        </div>
      </div>

      {generated && (
        <div className="rounded-md border border-amber-300 bg-amber-50 p-3 text-xs">
          <p className="mb-1 font-semibold text-amber-900">
            Nouveau mot de passe genere (affiche une seule fois)
          </p>
          <div className="flex items-center gap-2">
            <code className="flex-1 break-all rounded bg-white px-2 py-1 font-mono">
              {visible ? generated.password : '••••••••••••••••'}
            </code>
            <button
              type="button"
              onClick={() => setVisible((v) => !v)}
              className="rounded border bg-white px-2 py-1 text-[11px] text-gray-600 hover:bg-gray-50"
            >
              {visible ? 'Masquer' : 'Afficher'}
            </button>
            <button
              type="button"
              onClick={copyPwd}
              className="rounded border bg-white px-2 py-1 text-[11px] text-gray-600 hover:bg-gray-50"
            >
              {copied ? 'Copie !' : 'Copier'}
            </button>
          </div>
          <p className="mt-2 text-[11px] text-amber-800">
            Email : <span className="font-mono">{generated.email}</span> -- transmets-le par un
            canal sur. La pwd n&apos;est pas conservee en clair cote ops.
          </p>
        </div>
      )}

      <div className="flex items-center justify-between">
        <button
          type="button"
          onClick={() => reset.mutate()}
          disabled={reset.isPending}
          className="inline-flex items-center gap-1.5 rounded-md border border-red-300 bg-red-50 px-3 py-1.5 text-sm font-medium text-red-700 hover:bg-red-100 disabled:opacity-50"
        >
          {reset.isPending ? 'Generation...' : 'Generer un nouveau mot de passe'}
        </button>
        {reset.isError && (
          <p className="text-xs text-red-600">
            {(reset.error as Error | undefined)?.message ?? 'Echec'}
          </p>
        )}
      </div>
    </div>
  );
}

interface ContainerInfo {
  name: string;
  image: string;
  state: string;
  status: string;
  ports: string;
  createdAt: string;
}

/**
 * Section containers du stack tenant : liste + boutons Logs / Terminal par
 * container. Logs = modal pre-rempli (200 dernieres lignes, refresh + copy).
 * Terminal = exec one-shot (input cmd + output). Pas de TTY interactif --
 * pour debug rapide uniquement, sinon `docker exec -it` SSH direct.
 */
function TenantContainers({ tenantId }: { tenantId: string }) {
  const qc = useQueryClient();
  const list = useQuery<ContainerInfo[]>({
    queryKey: ['tenant', tenantId, 'containers'],
    queryFn: async () =>
      (await api.get(`/tenants/${tenantId}/containers`)).data?.data ?? [],
    refetchInterval: 5000,
  });
  const [logsTarget, setLogsTarget] = useState<string | null>(null);
  const [execTarget, setExecTarget] = useState<string | null>(null);

  const stackAction = useMutation({
    mutationFn: async (action: 'stop' | 'start' | 'restart') => {
      await api.post(`/tenants/${tenantId}/stack/${action}`);
    },
    onSuccess: () => {
      setTimeout(() => qc.invalidateQueries({ queryKey: ['tenant', tenantId, 'containers'] }), 2000);
    },
  });

  const actionLabel: Record<string, string> = {
    stop: 'Arret stack...',
    start: 'Demarrage stack...',
    restart: 'Redemarrage stack...',
  };

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2">
        <span className="text-xs text-gray-500 mr-1">Stack :</span>
        {(['stop', 'start', 'restart'] as const).map((a) => (
          <button
            key={a}
            type="button"
            disabled={stackAction.isPending}
            onClick={() => stackAction.mutate(a)}
            className={
              'rounded border px-2.5 py-1 text-xs font-medium transition ' +
              (a === 'stop'
                ? 'border-red-300 text-red-700 hover:bg-red-50 disabled:opacity-50'
                : a === 'start'
                ? 'border-green-300 text-green-700 hover:bg-green-50 disabled:opacity-50'
                : 'border-gray-300 text-gray-700 hover:bg-gray-50 disabled:opacity-50')
            }
          >
            {stackAction.isPending && stackAction.variables === a
              ? actionLabel[a]
              : a === 'stop' ? 'Arreter' : a === 'start' ? 'Demarrer' : 'Redemarrer'}
          </button>
        ))}
        {stackAction.isError && (
          <span className="text-xs text-red-600 ml-2">
            {(stackAction.error as any)?.response?.data?.message ?? 'Erreur'}
          </span>
        )}
      </div>

      {list.isLoading && <p className="text-xs text-gray-400">Chargement...</p>}
      {!list.isLoading && (list.data ?? []).length === 0 && (
        <p className="text-xs text-gray-400">
          Aucun container actif pour ce tenant. Le stack est peut-etre archive
          ou pas encore provisionne.
        </p>
      )}
      <div className="overflow-x-auto">
        <table className="w-full text-xs">
          <thead className="text-[10px] uppercase text-gray-500">
            <tr>
              <th className="px-2 py-1 text-left font-normal">Container</th>
              <th className="px-2 py-1 text-left font-normal">Etat</th>
              <th className="px-2 py-1 text-left font-normal">Status</th>
              <th className="px-2 py-1 text-left font-normal">Image</th>
              <th className="px-2 py-1 text-right font-normal">Actions</th>
            </tr>
          </thead>
          <tbody>
            {(list.data ?? []).map((c) => (
              <tr key={c.name} className="border-t">
                <td className="px-2 py-1.5 font-mono">{c.name}</td>
                <td className="px-2 py-1.5">
                  <span
                    className={
                      'rounded px-1.5 py-0.5 text-[10px] ' +
                      (c.state === 'running'
                        ? 'bg-emerald-100 text-emerald-800'
                        : c.state === 'exited'
                        ? 'bg-red-100 text-red-700'
                        : 'bg-gray-100 text-gray-600')
                    }
                  >
                    {c.state}
                  </span>
                </td>
                <td className="px-2 py-1.5 text-gray-600">{c.status}</td>
                <td className="px-2 py-1.5 truncate font-mono text-[10px] text-gray-500">{c.image}</td>
                <td className="px-2 py-1.5 text-right">
                  <button
                    type="button"
                    onClick={() => setLogsTarget(c.name)}
                    className="mr-1 rounded border px-2 py-0.5 text-[11px] hover:bg-gray-50"
                  >
                    Logs
                  </button>
                  <button
                    type="button"
                    onClick={() => setExecTarget(c.name)}
                    className="rounded border px-2 py-0.5 text-[11px] hover:bg-gray-50"
                  >
                    Terminal
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {logsTarget && (
        <ContainerLogsModal
          tenantId={tenantId}
          name={logsTarget}
          onClose={() => setLogsTarget(null)}
        />
      )}
      {execTarget && (
        <ContainerExecModal
          tenantId={tenantId}
          name={execTarget}
          onClose={() => setExecTarget(null)}
        />
      )}
    </div>
  );
}

function ContainerLogsModal({
  tenantId,
  name,
  onClose,
}: {
  tenantId: string;
  name: string;
  onClose: () => void;
}) {
  const [tail, setTail] = useState(200);
  const { data, isFetching, refetch } = useQuery<{ logs: string; code: number }>({
    queryKey: ['tenant', tenantId, 'container-logs', name, tail],
    queryFn: async () =>
      (await api.get(`/tenants/${tenantId}/containers/${name}/logs`, { params: { tail } })).data
        ?.data,
    refetchInterval: 3000,
  });
  const copy = async () => {
    try { await navigator.clipboard.writeText(data?.logs ?? ''); } catch {/* */}
  };
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
      <div className="flex h-[80vh] w-full max-w-4xl flex-col rounded-lg bg-white shadow-2xl">
        <div className="flex items-center justify-between border-b px-4 py-2">
          <div className="flex items-center gap-2">
            <h3 className="text-sm font-semibold">Logs : <span className="font-mono">{name}</span></h3>
            <select
              value={tail}
              onChange={(e) => setTail(Number(e.target.value))}
              className="rounded border px-1.5 py-0.5 text-xs"
            >
              <option value={50}>50</option>
              <option value={200}>200</option>
              <option value={500}>500</option>
              <option value={2000}>2000</option>
            </select>
            {isFetching && <span className="text-[10px] text-gray-400">refresh...</span>}
          </div>
          <div className="flex gap-1">
            <button type="button" onClick={() => refetch()} className="rounded border px-2 py-1 text-[11px] hover:bg-gray-50">Refresh</button>
            <button type="button" onClick={copy} className="rounded border px-2 py-1 text-[11px] hover:bg-gray-50">Copier</button>
            <button type="button" onClick={onClose} className="rounded border px-2 py-1 text-[11px] hover:bg-gray-50">Fermer</button>
          </div>
        </div>
        <pre className="flex-1 overflow-auto bg-gray-900 p-4 text-[11px] leading-relaxed text-gray-100">
{data?.logs || '(vide)'}
        </pre>
      </div>
    </div>
  );
}

function ContainerExecModal({
  tenantId,
  name,
  onClose,
}: {
  tenantId: string;
  name: string;
  onClose: () => void;
}) {
  const [cmd, setCmd] = useState('');
  const [history, setHistory] = useState<Array<{ cmd: string; output: string; code: number }>>([]);
  const exec = useMutation({
    mutationFn: async (c: string) =>
      (await api.post(`/tenants/${tenantId}/containers/${name}/exec`, { cmd: c })).data?.data as {
        output: string;
        code: number;
      },
    onSuccess: (data, variables) => {
      setHistory((h) => [...h, { cmd: variables, output: data.output, code: data.code }]);
      setCmd('');
    },
  });
  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    if (cmd.trim()) exec.mutate(cmd.trim());
  };
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
      <div className="flex h-[80vh] w-full max-w-4xl flex-col rounded-lg bg-white shadow-2xl">
        <div className="flex items-center justify-between border-b px-4 py-2">
          <h3 className="text-sm font-semibold">
            Terminal (exec one-shot) : <span className="font-mono">{name}</span>
          </h3>
          <button type="button" onClick={onClose} className="rounded border px-2 py-1 text-[11px] hover:bg-gray-50">
            Fermer
          </button>
        </div>
        <div className="flex-1 overflow-auto bg-gray-900 p-4 font-mono text-[12px] text-gray-100">
          {history.length === 0 && (
            <p className="text-[11px] text-gray-500">
              Pas d&apos;historique. Lance une commande ci-dessous. Pas de TTY
              interactif (timeout 30s par commande). Ex : <code>ls -la /app</code>,
              <code>printenv | head</code>, <code>cat /etc/hosts</code>.
            </p>
          )}
          {history.map((h, i) => (
            <div key={i} className="mb-3">
              <div className="text-emerald-400">$ {h.cmd}</div>
              <pre className="whitespace-pre-wrap text-gray-200">{h.output}</pre>
              <div className="text-[10px] text-gray-500">exit code : {h.code}</div>
            </div>
          ))}
        </div>
        <form onSubmit={submit} className="flex gap-2 border-t bg-gray-50 p-3">
          <span className="font-mono text-sm text-gray-500">$</span>
          <input
            type="text"
            value={cmd}
            onChange={(e) => setCmd(e.target.value)}
            placeholder="ls -la /app"
            className="flex-1 rounded border bg-white px-2 py-1.5 font-mono text-xs"
            autoFocus
          />
          <button
            type="submit"
            disabled={!cmd.trim() || exec.isPending}
            className="rounded bg-primary-700 px-3 py-1.5 text-xs text-white hover:bg-primary-900 disabled:opacity-50"
          >
            {exec.isPending ? '...' : 'Run'}
          </button>
        </form>
      </div>
    </div>
  );
}
