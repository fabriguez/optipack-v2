'use client';
import { useEffect, useRef, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  AlertCircle,
  CheckCircle2,
  Copy,
  Globe,
  Loader2,
  RefreshCw,
  Rocket,
  Trash2,
  XCircle,
} from 'lucide-react';
import { api } from '@/lib/api';
import { formatDate } from '@/lib/utils';
import { ConfirmDialog } from '@/components/ConfirmDialog';

interface DeployJob {
  id: string;
  status: 'queued' | 'building' | 'succeeded' | 'failed' | string;
  trigger: string;
  commitSha: string | null;
  startedAt: string | null;
  finishedAt: string | null;
  logs: string | null;
  errorLog: string | null;
  createdAt: string;
}

interface Site {
  tenantId: string;
  repoUrl: string;
  branch: string;
  dockerfilePath: string;
  buildContext: string | null;
  containerPort: number;
  sitePort: number | null;
  healthPath: string;
  cpuLimit: number;
  memoryMb: number;
  status: 'idle' | 'building' | 'live' | 'failed' | string;
  autoDeploy: boolean;
  lastDeploySha: string | null;
  lastDeployAt: string | null;
  lastError: string | null;
  isSshRepo: boolean;
  hasRepoToken: boolean;
  hasRepoSshKey: boolean;
  hasEnvVars: boolean;
  webhookUrl: string;
  deployJobs: DeployJob[];
}

interface FormState {
  repoUrl: string;
  branch: string;
  dockerfilePath: string;
  buildContext: string;
  containerPort: number;
  healthPath: string;
  cpuLimit: number;
  memoryMb: number;
  autoDeploy: boolean;
  repoToken: string;
  repoSshKey: string;
  envVars: string;
}

const EMPTY_FORM: FormState = {
  repoUrl: '',
  branch: 'main',
  dockerfilePath: 'Dockerfile',
  buildContext: '',
  containerPort: 3000,
  healthPath: '/',
  cpuLimit: 0.5,
  memoryMb: 512,
  autoDeploy: true,
  repoToken: '',
  repoSshKey: '',
  envVars: '',
};

/** Parse "KEY=VALUE" (une par ligne, # = commentaire) -> objet. */
function parseEnv(text: string): Record<string, string> {
  const out: Record<string, string> = {};
  for (const line of text.split('\n')) {
    const t = line.trim();
    if (!t || t.startsWith('#')) continue;
    const i = t.indexOf('=');
    if (i <= 0) continue;
    out[t.slice(0, i).trim()] = t.slice(i + 1);
  }
  return out;
}

export function TenantCustomSite({
  tenantId,
  slug,
  canDelete,
}: {
  tenantId: string;
  slug: string;
  canDelete: boolean;
}) {
  const qc = useQueryClient();
  const [form, setForm] = useState<FormState>(EMPTY_FORM);
  const [editing, setEditing] = useState(false);
  const [secret, setSecret] = useState<string | null>(null);
  const [confirmDelete, setConfirmDelete] = useState(false);

  const q = useQuery<Site | null>({
    queryKey: ['tenant', tenantId, 'site'],
    queryFn: async () => (await api.get(`/tenants/${tenantId}/site`)).data?.data ?? null,
    // Poll tant qu'un build tourne (statut site building OU dernier job non terminal).
    refetchInterval: (query) => {
      const s = query.state.data as Site | null | undefined;
      if (!s) return false;
      const latest = s.deployJobs?.[0];
      const busy = s.status === 'building' || latest?.status === 'building' || latest?.status === 'queued';
      return busy ? 2000 : false;
    },
  });

  const site = q.data ?? null;

  const configure = useMutation({
    mutationFn: (payload: Record<string, unknown>) => api.put(`/tenants/${tenantId}/site`, payload),
    onSuccess: (res) => {
      const data = res.data?.data as { webhookSecret?: string } | undefined;
      if (data?.webhookSecret) setSecret(data.webhookSecret);
      setEditing(false);
      qc.invalidateQueries({ queryKey: ['tenant', tenantId, 'site'] });
    },
  });

  const redeploy = useMutation({
    mutationFn: () => api.post(`/tenants/${tenantId}/site/redeploy`),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['tenant', tenantId, 'site'] }),
  });

  const regenerate = useMutation({
    mutationFn: () => api.post(`/tenants/${tenantId}/site/webhook/regenerate`),
    onSuccess: (res) => {
      const data = res.data?.data as { webhookSecret?: string } | undefined;
      if (data?.webhookSecret) setSecret(data.webhookSecret);
      qc.invalidateQueries({ queryKey: ['tenant', tenantId, 'site'] });
    },
  });

  const remove = useMutation({
    mutationFn: () => api.delete(`/tenants/${tenantId}/site`),
    onSuccess: () => {
      setConfirmDelete(false);
      setSecret(null);
      qc.invalidateQueries({ queryKey: ['tenant', tenantId, 'site'] });
    },
  });

  // Pré-remplit le form depuis la config existante quand on ouvre l'édition.
  const openEdit = () => {
    if (site) {
      setForm({
        repoUrl: site.repoUrl,
        branch: site.branch,
        dockerfilePath: site.dockerfilePath,
        buildContext: site.buildContext ?? '',
        containerPort: site.containerPort,
        healthPath: site.healthPath,
        cpuLimit: site.cpuLimit,
        memoryMb: site.memoryMb,
        autoDeploy: site.autoDeploy,
        repoToken: '',
        repoSshKey: '',
        envVars: '',
      });
    } else {
      setForm(EMPTY_FORM);
    }
    setEditing(true);
  };

  const submit = () => {
    const payload: Record<string, unknown> = {
      repoUrl: form.repoUrl.trim(),
      branch: form.branch.trim() || 'main',
      dockerfilePath: form.dockerfilePath.trim() || 'Dockerfile',
      buildContext: form.buildContext.trim() || null,
      containerPort: Number(form.containerPort),
      healthPath: form.healthPath.trim() || '/',
      cpuLimit: Number(form.cpuLimit),
      memoryMb: Number(form.memoryMb),
      autoDeploy: form.autoDeploy,
    };
    // Secrets : envoyés seulement si saisis (vide = inchangé côté serveur).
    if (form.repoToken.trim()) payload.repoToken = form.repoToken.trim();
    if (form.repoSshKey.trim()) payload.repoSshKey = form.repoSshKey;
    if (form.envVars.trim()) payload.envVars = parseEnv(form.envVars);
    configure.mutate(payload);
  };

  if (q.isLoading) return <p className="text-sm text-gray-400">Chargement...</p>;

  return (
    <div className="space-y-5">
      {/* Pas de site configuré + pas en édition -> CTA */}
      {!site && !editing && (
        <div className="rounded-lg border border-dashed bg-gray-50 p-4">
          <p className="text-sm text-gray-700">
            Aucun site custom. Tu peux brancher un repo GitHub : l&apos;orchestrateur le build
            sur le VPS du tenant et le lance dans un container isolé qui prend les hosts publics
            (<code className="font-mono text-[11px]">{slug}.…</code>), à la place du web-client
            standard. Les updates tenant ne le touchent pas.
          </p>
          <button
            type="button"
            onClick={openEdit}
            className="mt-3 inline-flex items-center gap-1.5 rounded-md bg-primary-700 px-3 py-2 text-sm font-medium text-white hover:bg-primary-900"
          >
            <Globe className="h-4 w-4" /> Configurer un site custom
          </button>
        </div>
      )}

      {/* Header statut */}
      {site && !editing && (
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="flex items-start gap-3">
            <StatusIcon status={site.status} />
            <div>
              <p className="text-sm font-semibold">
                <a href={site.repoUrl} target="_blank" rel="noreferrer" className="hover:underline">
                  {site.repoUrl}
                </a>{' '}
                <span className="text-gray-400">@ {site.branch}</span>
              </p>
              <p className="mt-0.5 text-xs text-gray-500">
                {site.dockerfilePath}
                {site.buildContext ? ` · context ${site.buildContext}` : ''} · port container{' '}
                {site.containerPort}
                {site.sitePort ? ` → host ${site.sitePort}` : ''} · {site.cpuLimit} CPU /{' '}
                {site.memoryMb} Mo
              </p>
              <div className="mt-1.5 flex flex-wrap items-center gap-1.5 text-[11px]">
                <StatusPill status={site.status} />
                {site.autoDeploy && (
                  <span className="rounded bg-blue-100 px-2 py-0.5 text-blue-700">auto-deploy ON</span>
                )}
                {site.lastDeploySha && (
                  <span className="rounded bg-gray-100 px-2 py-0.5 font-mono text-gray-600">
                    {site.lastDeploySha.slice(0, 8)}
                  </span>
                )}
                {site.lastDeployAt && (
                  <span className="rounded bg-gray-100 px-2 py-0.5 text-gray-600">
                    {formatDate(site.lastDeployAt)}
                  </span>
                )}
              </div>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => redeploy.mutate()}
              disabled={redeploy.isPending || site.status === 'building'}
              className="inline-flex items-center gap-1 rounded-md bg-emerald-600 px-2.5 py-1.5 text-xs font-semibold text-white hover:bg-emerald-700 disabled:opacity-50"
            >
              {redeploy.isPending || site.status === 'building' ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
              ) : (
                <Rocket className="h-3.5 w-3.5" />
              )}
              Redéployer
            </button>
            <button
              type="button"
              onClick={openEdit}
              className="inline-flex items-center gap-1 rounded-md border bg-white px-2.5 py-1.5 text-xs hover:bg-gray-50"
            >
              <RefreshCw className="h-3.5 w-3.5" /> Config
            </button>
            {canDelete && (
              <button
                type="button"
                onClick={() => setConfirmDelete(true)}
                className="inline-flex items-center gap-1 rounded-md border border-red-200 bg-white px-2.5 py-1.5 text-xs text-red-600 hover:bg-red-50"
              >
                <Trash2 className="h-3.5 w-3.5" /> Supprimer
              </button>
            )}
          </div>
        </div>
      )}

      {site?.lastError && site.status === 'failed' && !editing && (
        <p className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-800">
          <AlertCircle className="mr-1 inline h-3.5 w-3.5" />
          Dernier build échoué : {site.lastError}
        </p>
      )}

      {/* Webhook (URL toujours affichée ; secret uniquement après config/régén) */}
      {site && !editing && (
        <WebhookBox
          url={site.webhookUrl}
          secret={secret}
          branch={site.branch}
          onRegenerate={() => regenerate.mutate()}
          regenerating={regenerate.isPending}
        />
      )}

      {/* Form config */}
      {editing && (
        <div className="rounded-lg border bg-white p-4">
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <Field label="Repo (HTTPS ou SSH)" full>
              <input
                className="w-full rounded-md border px-3 py-2 text-sm font-mono"
                value={form.repoUrl}
                onChange={(e) => setForm({ ...form, repoUrl: e.target.value })}
                placeholder="git@github.com:BrightkyEfoo/alnadjah.git"
              />
              <p className="mt-1 text-[11px] text-gray-400">
                HTTPS (<code className="font-mono">https://…</code>, + token si privé) ou SSH (
                <code className="font-mono">git@host:org/repo.git</code>, + clé de déploiement ci-dessous).
              </p>
            </Field>
            <Field label="Branche">
              <input
                className="w-full rounded-md border px-3 py-2 text-sm font-mono"
                value={form.branch}
                onChange={(e) => setForm({ ...form, branch: e.target.value })}
              />
            </Field>
            <Field label="Dockerfile (chemin)">
              <input
                className="w-full rounded-md border px-3 py-2 text-sm font-mono"
                value={form.dockerfilePath}
                onChange={(e) => setForm({ ...form, dockerfilePath: e.target.value })}
              />
            </Field>
            <Field label="Contexte de build (sous-dossier, optionnel)">
              <input
                className="w-full rounded-md border px-3 py-2 text-sm font-mono"
                value={form.buildContext}
                onChange={(e) => setForm({ ...form, buildContext: e.target.value })}
                placeholder="(racine)"
              />
            </Field>
            <Field label="Port exposé (EXPOSE du Dockerfile)">
              <input
                type="number"
                className="w-full rounded-md border px-3 py-2 text-sm"
                value={form.containerPort}
                onChange={(e) => setForm({ ...form, containerPort: Number(e.target.value) })}
              />
            </Field>
            <Field label="Health path">
              <input
                className="w-full rounded-md border px-3 py-2 text-sm font-mono"
                value={form.healthPath}
                onChange={(e) => setForm({ ...form, healthPath: e.target.value })}
              />
            </Field>
            <Field label="CPU (coeurs)">
              <input
                type="number"
                step="0.1"
                className="w-full rounded-md border px-3 py-2 text-sm"
                value={form.cpuLimit}
                onChange={(e) => setForm({ ...form, cpuLimit: Number(e.target.value) })}
              />
            </Field>
            <Field label="RAM (Mo)">
              <input
                type="number"
                className="w-full rounded-md border px-3 py-2 text-sm"
                value={form.memoryMb}
                onChange={(e) => setForm({ ...form, memoryMb: Number(e.target.value) })}
              />
            </Field>
            <Field label={`Token HTTPS privé ${site?.hasRepoToken ? '(défini — vide = inchangé)' : '(optionnel)'}`}>
              <input
                type="password"
                className="w-full rounded-md border px-3 py-2 text-sm font-mono"
                value={form.repoToken}
                onChange={(e) => setForm({ ...form, repoToken: e.target.value })}
                placeholder="ghp_… (repos HTTPS privés)"
              />
            </Field>
            <Field label={`Clé SSH de déploiement ${site?.hasRepoSshKey ? '(définie — vide = inchangé)' : '(repos git@…)'}`} full>
              <textarea
                className="h-24 w-full rounded-md border px-3 py-2 text-sm font-mono"
                value={form.repoSshKey}
                onChange={(e) => setForm({ ...form, repoSshKey: e.target.value })}
                placeholder={'-----BEGIN OPENSSH PRIVATE KEY-----\n… (clé privée du deploy key GitHub)\n-----END OPENSSH PRIVATE KEY-----'}
              />
              <p className="mt-1 text-[11px] text-gray-400">
                Pour un repo SSH (<code className="font-mono">git@github.com:…</code>) : colle la clé privée
                dont la clé publique est ajoutée en Deploy key du repo. Chiffrée avant stockage.
              </p>
            </Field>
            <Field label={`Variables d'env ${site?.hasEnvVars ? '(définies — vide = inchangé)' : '(build + runtime)'}`} full>
              <textarea
                className="h-24 w-full rounded-md border px-3 py-2 text-sm font-mono"
                value={form.envVars}
                onChange={(e) => setForm({ ...form, envVars: e.target.value })}
                placeholder={'NEXT_PUBLIC_API_URL=https://api.acme.com\nNODE_ENV=production'}
              />
            </Field>
          </div>

          <label className="mt-3 flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={form.autoDeploy}
              onChange={(e) => setForm({ ...form, autoDeploy: e.target.checked })}
            />
            Auto-déploiement sur push GitHub (webhook)
          </label>

          {configure.isError && (
            <p className="mt-2 text-xs text-red-600">
              {(configure.error as { response?: { data?: { message?: string } } })?.response?.data
                ?.message ?? 'Échec de la configuration.'}
            </p>
          )}

          <div className="mt-4 flex justify-end gap-2">
            <button
              type="button"
              onClick={() => setEditing(false)}
              className="rounded-md border bg-white px-3 py-1.5 text-sm hover:bg-gray-50"
            >
              Annuler
            </button>
            <button
              type="button"
              onClick={submit}
              disabled={configure.isPending || !form.repoUrl.trim()}
              className="inline-flex items-center gap-1.5 rounded-md bg-primary-700 px-3 py-1.5 text-sm font-medium text-white hover:bg-primary-900 disabled:opacity-50"
            >
              {configure.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <CheckCircle2 className="h-4 w-4" />}
              Enregistrer
            </button>
          </div>
        </div>
      )}

      {/* Logs du dernier déploiement */}
      {site && !editing && site.deployJobs?.[0] && <DeployLogs job={site.deployJobs[0]} />}

      <ConfirmDialog
        open={confirmDelete}
        destructive
        title="Supprimer le site custom ?"
        description={`Le container du site est arrêté et les hosts publics repassent au web-client standard. La config (repo, secrets) est effacée.`}
        requireText={slug}
        confirmLabel="Supprimer"
        loading={remove.isPending}
        onConfirm={() => remove.mutate()}
        onCancel={() => setConfirmDelete(false)}
      />
    </div>
  );
}

function WebhookBox({
  url,
  secret,
  branch,
  onRegenerate,
  regenerating,
}: {
  url: string;
  secret: string | null;
  branch: string;
  onRegenerate: () => void;
  regenerating: boolean;
}) {
  return (
    <div className="rounded-lg border bg-white p-4">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-sm font-semibold">Webhook GitHub (auto-deploy)</p>
          <p className="mt-1 text-xs text-gray-500">
            GitHub → repo → Settings → Webhooks → Add webhook. Content type{' '}
            <code className="font-mono">application/json</code>, event <code className="font-mono">push</code>.
            Déploie sur push de la branche <code className="font-mono">{branch}</code>.
          </p>
        </div>
        <button
          type="button"
          onClick={onRegenerate}
          disabled={regenerating}
          className="inline-flex shrink-0 items-center gap-1 rounded-md border bg-white px-2.5 py-1.5 text-xs hover:bg-gray-50 disabled:opacity-50"
          title="Génère un nouveau secret (invalide l'ancien)"
        >
          {regenerating ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <RefreshCw className="h-3.5 w-3.5" />}
          Régénérer le secret
        </button>
      </div>
      <div className="mt-2 space-y-2">
        <LabeledCopy label="Payload URL" value={url} mono />
        {secret ? (
          <LabeledCopy label="Secret (copie-le maintenant, non réaffiché)" value={secret} mono highlight />
        ) : (
          <p className="text-xs text-gray-400">
            Secret : masqué. Clique « Régénérer le secret » (ou ré-enregistre la config) pour en obtenir un nouveau.
          </p>
        )}
      </div>
    </div>
  );
}

function DeployLogs({ job }: { job: DeployJob }) {
  const preRef = useRef<HTMLPreElement>(null);
  const logs = job.logs || '';
  useEffect(() => {
    if (preRef.current) preRef.current.scrollTop = preRef.current.scrollHeight;
  }, [logs]);
  return (
    <div className="rounded-lg border bg-white shadow-sm">
      <div className="flex items-center justify-between border-b px-4 py-2">
        <div className="flex items-center gap-2">
          <StatusPill status={job.status} />
          <span className="text-xs text-gray-500">déploiement {job.trigger}</span>
          {job.commitSha && (
            <span className="font-mono text-[10px] text-gray-400">{job.commitSha.slice(0, 8)}</span>
          )}
        </div>
        {job.startedAt && <span className="text-[11px] text-gray-400">{formatDate(job.startedAt)}</span>}
      </div>
      <pre
        ref={preRef}
        className="max-h-[50vh] overflow-auto bg-gray-900 p-4 text-[12px] leading-relaxed text-gray-100"
      >
{logs || '(en attente de la 1ère ligne de log...)'}
      </pre>
      {job.errorLog && (
        <div className="border-t bg-red-50 p-3 text-xs text-red-800">
          <p className="font-semibold">Erreur :</p>
          <p className="mt-1 whitespace-pre-line">{job.errorLog}</p>
        </div>
      )}
    </div>
  );
}

function Field({
  label,
  full,
  children,
}: {
  label: string;
  full?: boolean;
  children: React.ReactNode;
}) {
  return (
    <div className={full ? 'sm:col-span-2' : ''}>
      <label className="text-xs text-gray-500">{label}</label>
      <div className="mt-1">{children}</div>
    </div>
  );
}

function LabeledCopy({
  label,
  value,
  mono,
  highlight,
}: {
  label: string;
  value: string;
  mono?: boolean;
  highlight?: boolean;
}) {
  const [done, setDone] = useState(false);
  return (
    <div>
      <p className="text-[11px] text-gray-500">{label}</p>
      <div
        className={
          'mt-0.5 flex items-center gap-2 rounded border px-2.5 py-1.5 ' +
          (highlight ? 'border-amber-300 bg-amber-50' : 'bg-gray-50')
        }
      >
        <code className={'min-w-0 flex-1 truncate text-xs ' + (mono ? 'font-mono' : '')}>{value}</code>
        <button
          type="button"
          onClick={() => {
            navigator.clipboard.writeText(value);
            setDone(true);
            setTimeout(() => setDone(false), 1500);
          }}
          className="shrink-0 text-gray-500 hover:text-gray-700"
          title="Copier"
        >
          {done ? <CheckCircle2 className="h-3.5 w-3.5 text-emerald-600" /> : <Copy className="h-3.5 w-3.5" />}
        </button>
      </div>
    </div>
  );
}

function StatusIcon({ status }: { status: string }) {
  const cfg =
    status === 'live'
      ? { bg: 'bg-emerald-100 text-emerald-700', Icon: CheckCircle2 }
      : status === 'building'
        ? { bg: 'bg-blue-100 text-blue-700', Icon: Loader2 }
        : status === 'failed'
          ? { bg: 'bg-red-100 text-red-700', Icon: XCircle }
          : { bg: 'bg-gray-100 text-gray-500', Icon: Globe };
  const { bg, Icon } = cfg;
  return (
    <div className={'flex h-10 w-10 shrink-0 items-center justify-center rounded-full ' + bg}>
      <Icon className={'h-5 w-5 ' + (status === 'building' ? 'animate-spin' : '')} />
    </div>
  );
}

function StatusPill({ status }: { status: string | null | undefined }) {
  if (!status) return null;
  const map: Record<string, { bg: string; text: string; label: string }> = {
    live: { bg: 'bg-emerald-100', text: 'text-emerald-700', label: 'Live' },
    building: { bg: 'bg-blue-100', text: 'text-blue-700', label: 'Build...' },
    queued: { bg: 'bg-amber-100', text: 'text-amber-700', label: 'En file' },
    succeeded: { bg: 'bg-emerald-100', text: 'text-emerald-700', label: 'OK' },
    failed: { bg: 'bg-red-100', text: 'text-red-700', label: 'Échec' },
    idle: { bg: 'bg-gray-100', text: 'text-gray-600', label: 'Inactif' },
  };
  const cfg = map[status] ?? { bg: 'bg-gray-100', text: 'text-gray-700', label: status };
  return (
    <span
      className={`inline-flex items-center rounded px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide ${cfg.bg} ${cfg.text}`}
    >
      {cfg.label}
    </span>
  );
}
