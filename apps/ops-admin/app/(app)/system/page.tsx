'use client';
import { useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Loader2, RefreshCw, Database, ShieldCheck, AlertTriangle } from 'lucide-react';
import { api } from '@/lib/api';
import { ConfirmDialog } from '@/components/ConfirmDialog';

interface Action {
  key: string;
  title: string;
  description: string;
  icon: React.ComponentType<{ className?: string }>;
  endpoint: string;
  confirmTitle: string;
  confirmDescription: string;
  confirmLabel: string;
  invalidate?: string[];
}

const ACTIONS: Action[] = [
  {
    key: 'caddy-reconcile',
    title: 'Reconcilier Caddy',
    description:
      'Pousse l\'etat attendu (tenants actifs, ports, domaines) vers tous les Caddy. Utile si un Caddy a perdu sa config ou est desync.',
    icon: ShieldCheck,
    endpoint: '/caddy/reconcile',
    confirmTitle: 'Lancer la reconciliation Caddy ?',
    confirmDescription:
      'Operation idempotente : reconstruit la config Caddy a partir de la base. Aucun downtime si tout est OK.',
    confirmLabel: 'Reconcilier',
    invalidate: ['tenants'],
  },
  {
    key: 'backups-nightly',
    title: 'Lancer backups nocturnes maintenant',
    description:
      'Declenche le job de backup automatique de tous les tenants actifs. Equivalent au cron quotidien.',
    icon: Database,
    endpoint: '/backups/run-nightly',
    confirmTitle: 'Lancer les backups nocturnes ?',
    confirmDescription:
      'Tous les tenants actifs seront sauvegardes (DB + uploads). Peut prendre plusieurs minutes selon la flotte.',
    confirmLabel: 'Lancer',
    invalidate: ['backups'],
  },
  {
    key: 'autofreeze',
    title: 'Lancer auto-freeze',
    description:
      'Parcourt les abonnements expires et freeze les tenants qui doivent l\'etre. Equivalent au cron 5min.',
    icon: AlertTriangle,
    endpoint: '/billing/run-autofreeze',
    confirmTitle: 'Lancer l\'auto-freeze ?',
    confirmDescription:
      'Les tenants dont l\'abonnement est expire et impaye seront freezes. Operation idempotente.',
    confirmLabel: 'Lancer',
    invalidate: ['billing-overview', 'tenants'],
  },
];

export default function SystemPage() {
  const qc = useQueryClient();
  const [pending, setPending] = useState<Action | null>(null);
  const [lastRun, setLastRun] = useState<Record<string, { ok: boolean; at: string; msg?: string }>>({});

  const run = useMutation({
    mutationFn: (action: Action) => api.post(action.endpoint),
    onSuccess: (_r, action) => {
      setLastRun((p) => ({ ...p, [action.key]: { ok: true, at: new Date().toISOString() } }));
      setPending(null);
      action.invalidate?.forEach((k) => qc.invalidateQueries({ queryKey: [k] }));
    },
    onError: (err: any, action) => {
      setLastRun((p) => ({
        ...p,
        [action.key]: {
          ok: false,
          at: new Date().toISOString(),
          msg: err?.response?.data?.message ?? err.message,
        },
      }));
      setPending(null);
    },
  });

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold">Systeme</h1>
        <p className="mt-1 text-sm text-gray-500">
          Outils d’operations : reconciliation Caddy, backups, autofreeze.
        </p>
      </div>

      <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
        {ACTIONS.map((a) => {
          const Icon = a.icon;
          const last = lastRun[a.key];
          const isPending = run.isPending && pending?.key === a.key;
          return (
            <div key={a.key} className="rounded-lg border bg-white p-5 shadow-sm">
              <div className="flex items-start gap-3">
                <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-primary-50 text-primary-700">
                  <Icon className="h-5 w-5" />
                </div>
                <div className="flex-1">
                  <h3 className="text-base font-semibold">{a.title}</h3>
                  <p className="mt-1 text-xs text-gray-500">{a.description}</p>
                  {last && (
                    <p
                      className={
                        'mt-2 text-xs ' + (last.ok ? 'text-emerald-600' : 'text-red-600')
                      }
                    >
                      {last.ok
                        ? `OK - ${new Date(last.at).toLocaleTimeString('fr-FR')}`
                        : `Echec - ${last.msg ?? '?'}`}
                    </p>
                  )}
                </div>
              </div>
              <div className="mt-4">
                <button
                  type="button"
                  onClick={() => setPending(a)}
                  disabled={isPending}
                  className="inline-flex items-center gap-1.5 rounded-md bg-primary-700 px-3 py-1.5 text-sm font-medium text-white hover:bg-primary-900 disabled:opacity-50"
                >
                  {isPending ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <RefreshCw className="h-4 w-4" />
                  )}
                  Lancer
                </button>
              </div>
            </div>
          );
        })}
      </div>

      <ConfirmDialog
        open={!!pending}
        onCancel={() => setPending(null)}
        title={pending?.confirmTitle ?? ''}
        description={pending?.confirmDescription ?? ''}
        confirmLabel={pending?.confirmLabel ?? 'Lancer'}
        loading={run.isPending}
        onConfirm={() => {
          if (pending) run.mutate(pending);
        }}
      />
    </div>
  );
}
