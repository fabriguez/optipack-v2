'use client';
import { useParams } from 'next/navigation';
import Link from 'next/link';
import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  ArrowLeft,
  Shield,
  ShieldCheck,
  ShieldOff,
  Trash2,
  Loader2,
  AlertCircle,
  Info,
} from 'lucide-react';
import { api } from '@/lib/api';

interface UfwRule {
  index: number;
  raw: string;
  action: string;
  target: string;
  source: string;
}

interface UfwStatus {
  enabled: boolean;
  defaultPolicy: { incoming: string; outgoing: string; routed: string };
  rules: UfwRule[];
  raw: string;
}

type Action = 'allow' | 'deny' | 'reject' | 'limit';

export default function UfwPage() {
  const { id } = useParams<{ id: string }>();
  const qc = useQueryClient();
  const [toast, setToast] = useState<{ kind: 'ok' | 'err'; msg: string } | null>(null);
  const [newSpec, setNewSpec] = useState('');
  const [newAction, setNewAction] = useState<Action>('allow');

  const { data, isLoading, error } = useQuery<UfwStatus>({
    queryKey: ['ufw', id],
    queryFn: async () => (await api.get(`/vps/${id}/ufw`)).data?.data,
    retry: false,
  });

  const errMsg = (err: unknown): string => {
    if (typeof err === 'object' && err && 'response' in err) {
      // @ts-expect-error axios shape
      return err.response?.data?.message ?? 'Erreur inconnue';
    }
    return 'Erreur inconnue';
  };

  const flash = (kind: 'ok' | 'err', msg: string) => {
    setToast({ kind, msg });
    setTimeout(() => setToast(null), 5000);
  };

  const toggle = useMutation({
    mutationFn: async (enable: boolean) => {
      const path = enable ? 'enable' : 'disable';
      return (await api.post(`/vps/${id}/ufw/${path}`)).data?.data;
    },
    onSuccess: (_, enable) => {
      flash('ok', enable ? 'UFW active' : 'UFW desactive');
      qc.invalidateQueries({ queryKey: ['ufw', id] });
    },
    onError: (err) => flash('err', errMsg(err)),
  });

  const addRule = useMutation({
    mutationFn: async () =>
      (await api.post(`/vps/${id}/ufw/rules`, { action: newAction, spec: newSpec })).data?.data,
    onSuccess: (status: UfwStatus) => {
      qc.setQueryData(['ufw', id], status);
      flash('ok', `Regle ajoutee : ${newAction} ${newSpec}`);
      setNewSpec('');
    },
    onError: (err) => flash('err', errMsg(err)),
  });

  const deleteRule = useMutation({
    mutationFn: async (index: number) =>
      (await api.delete(`/vps/${id}/ufw/rules/${index}`)).data?.data,
    onSuccess: (status: UfwStatus) => {
      qc.setQueryData(['ufw', id], status);
      flash('ok', 'Regle supprimee');
    },
    onError: (err) => flash('err', errMsg(err)),
  });

  const baseline = useMutation({
    mutationFn: async () => (await api.post(`/vps/${id}/ufw/baseline`)).data?.data,
    onSuccess: () => {
      flash('ok', 'Baseline appliquee (22/80/443 + enable)');
      qc.invalidateQueries({ queryKey: ['ufw', id] });
    },
    onError: (err) => flash('err', errMsg(err)),
  });

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2">
        <Link href={`/vps`} className="inline-flex items-center gap-1 text-xs text-gray-500 hover:text-gray-700">
          <ArrowLeft className="h-3 w-3" /> Retour aux VPS
        </Link>
      </div>

      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold">UFW Firewall</h1>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => baseline.mutate()}
            disabled={baseline.isPending}
            className="inline-flex items-center gap-1.5 rounded-md border bg-white px-3 py-1.5 text-sm hover:bg-gray-50 disabled:opacity-50"
            title="Allow 22/80/443 + enable. Idempotent."
          >
            {baseline.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Shield className="h-4 w-4" />}
            Appliquer baseline
          </button>
          {data?.enabled ? (
            <button
              type="button"
              onClick={() => toggle.mutate(false)}
              disabled={toggle.isPending}
              className="inline-flex items-center gap-1.5 rounded-md bg-red-600 px-3 py-1.5 text-sm text-white hover:bg-red-700 disabled:opacity-50"
            >
              {toggle.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <ShieldOff className="h-4 w-4" />}
              Desactiver UFW
            </button>
          ) : (
            <button
              type="button"
              onClick={() => toggle.mutate(true)}
              disabled={toggle.isPending}
              className="inline-flex items-center gap-1.5 rounded-md bg-emerald-600 px-3 py-1.5 text-sm text-white hover:bg-emerald-700 disabled:opacity-50"
            >
              {toggle.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <ShieldCheck className="h-4 w-4" />}
              Activer UFW
            </button>
          )}
        </div>
      </div>

      {toast && (
        <div
          className={
            'rounded-md border px-3 py-2 text-sm ' +
            (toast.kind === 'ok'
              ? 'border-emerald-200 bg-emerald-50 text-emerald-800'
              : 'border-red-200 bg-red-50 text-red-800')
          }
        >
          {toast.msg}
        </div>
      )}

      {error && (
        <div className="rounded-md border border-amber-200 bg-amber-50 p-3 text-sm text-amber-800">
          <div className="flex items-start gap-2">
            <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
            <div>
              <p className="font-medium">UFW indisponible pour ce VPS</p>
              <p className="mt-0.5 text-xs">{errMsg(error)}</p>
              <p className="mt-1 text-xs">
                Pour le VPS local, gere UFW directement via la CLI host :{' '}
                <code className="rounded bg-amber-100 px-1">sudo ufw status</code>,{' '}
                <code className="rounded bg-amber-100 px-1">sudo ufw allow 443/tcp</code>, etc.
              </p>
            </div>
          </div>
        </div>
      )}

      <div className="rounded-md border border-blue-200 bg-blue-50 p-3 text-xs text-blue-900">
        <div className="flex items-start gap-2">
          <Info className="mt-0.5 h-4 w-4 shrink-0" />
          <div>
            <p className="font-medium">UFW et creation de tenants : aucun port a ouvrir</p>
            <p className="mt-0.5">
              Les containers tenant sont bindes sur <code>127.0.0.1</code> et Caddy
              (frontal HTTPS :80/:443) sert toutes les sous-routes. Donc creer
              un tenant n'ajoute rien a UFW. La baseline (22/80/443) suffit.
            </p>
          </div>
        </div>
      </div>

      <section className="rounded-lg border bg-white p-4 shadow-sm">
        <h2 className="mb-3 text-sm font-semibold">Etat</h2>
        {isLoading ? (
          <p className="text-sm text-gray-400">Chargement...</p>
        ) : data ? (
          <div className="grid grid-cols-2 gap-3 text-sm sm:grid-cols-4">
            <div>
              <p className="text-xs uppercase tracking-wide text-gray-500">Status</p>
              <p className={data.enabled ? 'font-semibold text-emerald-700' : 'font-semibold text-red-600'}>
                {data.enabled ? 'ACTIVE' : 'INACTIVE'}
              </p>
            </div>
            <div>
              <p className="text-xs uppercase tracking-wide text-gray-500">Default IN</p>
              <p className="font-mono text-xs">{data.defaultPolicy.incoming}</p>
            </div>
            <div>
              <p className="text-xs uppercase tracking-wide text-gray-500">Default OUT</p>
              <p className="font-mono text-xs">{data.defaultPolicy.outgoing}</p>
            </div>
            <div>
              <p className="text-xs uppercase tracking-wide text-gray-500">Default ROUTED</p>
              <p className="font-mono text-xs">{data.defaultPolicy.routed}</p>
            </div>
          </div>
        ) : null}
      </section>

      <section className="rounded-lg border bg-white p-4 shadow-sm">
        <h2 className="mb-3 text-sm font-semibold">Ajouter une regle</h2>
        <div className="flex flex-wrap items-end gap-2">
          <div>
            <label className="text-xs text-gray-500">Action</label>
            <select
              value={newAction}
              onChange={(e) => setNewAction(e.target.value as Action)}
              className="block rounded-md border px-2 py-1.5 text-sm"
            >
              <option value="allow">allow</option>
              <option value="deny">deny</option>
              <option value="reject">reject</option>
              <option value="limit">limit</option>
            </select>
          </div>
          <div className="flex-1 min-w-[200px]">
            <label className="text-xs text-gray-500">Spec (ex: 443/tcp, OpenSSH, from 1.2.3.4 to any port 22)</label>
            <input
              type="text"
              value={newSpec}
              onChange={(e) => setNewSpec(e.target.value)}
              placeholder="443/tcp"
              className="block w-full rounded-md border px-2 py-1.5 text-sm font-mono"
            />
          </div>
          <button
            type="button"
            onClick={() => addRule.mutate()}
            disabled={!newSpec || addRule.isPending}
            className="inline-flex items-center gap-1.5 rounded-md bg-primary-700 px-3 py-1.5 text-sm text-white hover:bg-primary-900 disabled:opacity-50"
          >
            {addRule.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : '+'}
            Ajouter
          </button>
        </div>
      </section>

      <section className="rounded-lg border bg-white shadow-sm">
        <h2 className="border-b px-4 py-3 text-sm font-semibold">Regles ({data?.rules.length ?? 0})</h2>
        <table className="w-full text-sm">
          <thead className="border-b bg-gray-50 text-xs text-gray-500">
            <tr>
              <th className="w-12 px-4 py-2 text-left font-normal">#</th>
              <th className="px-4 py-2 text-left font-normal">Cible</th>
              <th className="w-24 px-4 py-2 text-left font-normal">Action</th>
              <th className="px-4 py-2 text-left font-normal">Source</th>
              <th className="w-16 px-4 py-2 text-right font-normal"></th>
            </tr>
          </thead>
          <tbody>
            {(data?.rules ?? []).map((r) => (
              <tr key={r.index} className="border-t hover:bg-gray-50">
                <td className="px-4 py-2 font-mono text-xs text-gray-500">{r.index}</td>
                <td className="px-4 py-2 font-mono text-xs">{r.target}</td>
                <td className="px-4 py-2">
                  <span
                    className={
                      'rounded px-1.5 py-0.5 text-[10px] font-bold ' +
                      (r.action === 'ALLOW'
                        ? 'bg-emerald-100 text-emerald-700'
                        : r.action === 'DENY' || r.action === 'REJECT'
                        ? 'bg-red-100 text-red-700'
                        : 'bg-amber-100 text-amber-700')
                    }
                  >
                    {r.action}
                  </span>
                </td>
                <td className="px-4 py-2 font-mono text-xs text-gray-600">{r.source}</td>
                <td className="px-4 py-2 text-right">
                  <button
                    type="button"
                    onClick={() => deleteRule.mutate(r.index)}
                    disabled={deleteRule.isPending && deleteRule.variables === r.index}
                    className="inline-flex items-center gap-1 rounded border px-2 py-1 text-xs text-red-600 hover:bg-red-50 disabled:opacity-50"
                    title="Supprimer cette regle"
                  >
                    {deleteRule.isPending && deleteRule.variables === r.index ? (
                      <Loader2 className="h-3 w-3 animate-spin" />
                    ) : (
                      <Trash2 className="h-3 w-3" />
                    )}
                  </button>
                </td>
              </tr>
            ))}
            {data && data.rules.length === 0 && (
              <tr>
                <td colSpan={5} className="px-4 py-6 text-center text-gray-400">
                  Aucune regle. Clique sur <b>Appliquer baseline</b> pour ouvrir 22/80/443.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </section>

      {data?.raw && (
        <details className="text-xs text-gray-500">
          <summary className="cursor-pointer">Sortie brute <code>ufw status</code></summary>
          <pre className="mt-2 overflow-auto rounded border bg-gray-50 p-3 font-mono text-[11px] text-gray-700">
            {data.raw}
          </pre>
        </details>
      )}
    </div>
  );
}
