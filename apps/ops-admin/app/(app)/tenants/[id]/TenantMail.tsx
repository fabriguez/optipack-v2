'use client';
import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  AlertCircle,
  CheckCircle2,
  Copy,
  Loader2,
  Mail,
  RefreshCw,
  Send,
} from 'lucide-react';
import { api } from '@/lib/api';
import { formatDate } from '@/lib/utils';

interface DnsRecord {
  type: 'MX' | 'TXT' | 'CNAME';
  name: string;
  value: string;
  status?: string;
  ttl?: string | number;
  priority?: number;
}

interface TenantMail {
  tenantId: string;
  sendingDomain: string | null;
  resendDomainId: string | null;
  resendStatus: string | null;
  resendDnsRecords: DnsRecord[] | null;
  lastVerifiedAt: string | null;
  mailcowDomain: string | null;
  primaryMailbox: string | null;
  mailboxQuotaMb: number;
  storageUsedMb: number;
  updatedAt: string;
}

export function TenantMail({ tenantId }: { tenantId: string }) {
  const qc = useQueryClient();
  const [customDomain, setCustomDomain] = useState('');

  const mail = useQuery<TenantMail>({
    queryKey: ['tenant', tenantId, 'mail'],
    queryFn: async () => (await api.get(`/tenants/${tenantId}/mail`)).data?.data,
  });

  const provision = useMutation({
    mutationFn: (custom?: string) =>
      api.post(`/tenants/${tenantId}/mail/provision`, custom ? { customDomain: custom } : {}),
    onSuccess: () => {
      setCustomDomain('');
      qc.invalidateQueries({ queryKey: ['tenant', tenantId, 'mail'] });
    },
  });

  const verify = useMutation({
    mutationFn: () => api.post(`/tenants/${tenantId}/mail/verify`),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['tenant', tenantId, 'mail'] }),
  });

  const refresh = useMutation({
    mutationFn: () => api.post(`/tenants/${tenantId}/mail/refresh`),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['tenant', tenantId, 'mail'] }),
  });

  if (mail.isLoading) {
    return <p className="text-sm text-gray-400">Chargement...</p>;
  }
  if (!mail.data) {
    return <p className="text-sm text-red-600">Erreur de chargement.</p>;
  }
  const m = mail.data;
  const verified = m.resendStatus === 'verified';

  return (
    <div className="space-y-5">
      {/* Status header */}
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex items-start gap-3">
          <div
            className={
              'flex h-10 w-10 shrink-0 items-center justify-center rounded-full ' +
              (verified
                ? 'bg-emerald-100 text-emerald-700'
                : m.resendDomainId
                ? 'bg-amber-100 text-amber-700'
                : 'bg-gray-100 text-gray-500')
            }
          >
            <Mail className="h-5 w-5" />
          </div>
          <div>
            <p className="text-sm font-semibold">
              {m.sendingDomain ?? <span className="text-gray-400">Pas de domaine d&apos;envoi</span>}
            </p>
            <p className="mt-0.5 text-xs text-gray-500">
              {m.resendDomainId ? (
                <>
                  Resend : <code className="font-mono text-[11px]">{m.resendDomainId}</code>
                </>
              ) : (
                'Pas encore provisionne sur Resend'
              )}
            </p>
            <div className="mt-1.5 flex flex-wrap gap-1.5 text-[11px]">
              <StatusPill status={m.resendStatus} />
              {m.lastVerifiedAt && (
                <span className="rounded bg-gray-100 px-2 py-0.5 text-gray-600">
                  Verifie le {formatDate(m.lastVerifiedAt)}
                </span>
              )}
            </div>
          </div>
        </div>

        {m.resendDomainId && (
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => refresh.mutate()}
              disabled={refresh.isPending}
              className="inline-flex items-center gap-1 rounded-md border bg-white px-2.5 py-1.5 text-xs hover:bg-gray-50 disabled:opacity-50"
            >
              {refresh.isPending ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
              ) : (
                <RefreshCw className="h-3.5 w-3.5" />
              )}
              Refresh
            </button>
            {!verified && (
              <button
                type="button"
                onClick={() => verify.mutate()}
                disabled={verify.isPending}
                className="inline-flex items-center gap-1 rounded-md bg-emerald-600 px-2.5 py-1.5 text-xs font-semibold text-white hover:bg-emerald-700 disabled:opacity-50"
              >
                {verify.isPending ? (
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                ) : (
                  <CheckCircle2 className="h-3.5 w-3.5" />
                )}
                Verifier maintenant
              </button>
            )}
          </div>
        )}
      </div>

      {/* Provision form si aucun domaine */}
      {!m.resendDomainId && (
        <div className="rounded-lg border bg-white p-4">
          <p className="text-sm">
            Aucun domaine d&apos;envoi provisionne. On va creer un domaine Resend pour ce
            tenant. Tu peux soit utiliser un sous-domaine par defaut (
            <code className="font-mono text-[11px]">slug.transitsoftservices.com</code>
            ), soit fournir un domaine custom (que le client controle).
          </p>
          <div className="mt-3 grid grid-cols-1 gap-2 sm:grid-cols-[1fr_auto]">
            <input
              type="text"
              value={customDomain}
              onChange={(e) => setCustomDomain(e.target.value)}
              placeholder="mail.acme.com (optionnel, vide = sous-domaine par defaut)"
              className="rounded-md border px-3 py-2 text-sm font-mono"
            />
            <button
              type="button"
              onClick={() => provision.mutate(customDomain || undefined)}
              disabled={provision.isPending}
              className="inline-flex items-center gap-1.5 rounded-md bg-primary-700 px-3 py-2 text-sm font-medium text-white hover:bg-primary-900 disabled:opacity-50"
            >
              {provision.isPending ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Send className="h-4 w-4" />
              )}
              Provisionner sur Resend
            </button>
          </div>
          {provision.isError && (
            <p className="mt-2 text-xs text-red-600">
              {(provision.error as { response?: { data?: { message?: string } } })?.response?.data
                ?.message ?? 'Echec du provisioning.'}
            </p>
          )}
        </div>
      )}

      {/* DNS records */}
      {m.resendDomainId && (m.resendDnsRecords?.length ?? 0) > 0 && (
        <div className="rounded-lg border bg-white">
          <header className="border-b bg-gray-50 px-4 py-2">
            <p className="text-sm font-semibold">
              Records DNS a configurer{' '}
              <span className="ml-1 text-xs font-normal text-gray-500">
                ({m.resendDnsRecords?.length})
              </span>
            </p>
            <p className="mt-0.5 text-xs text-gray-500">
              Ajoute ces enregistrements chez le DNS provider qui gere le domaine{' '}
              <code className="font-mono">{m.sendingDomain}</code>. Une fois propage
              (1-30 min), clique "Verifier maintenant".
            </p>
          </header>
          <table className="w-full text-xs">
            <thead className="border-b bg-gray-50 text-gray-500">
              <tr>
                <th className="px-4 py-1.5 text-left font-normal">Type</th>
                <th className="px-4 py-1.5 text-left font-normal">Nom</th>
                <th className="px-4 py-1.5 text-left font-normal">Valeur</th>
                <th className="px-4 py-1.5 text-left font-normal">Status</th>
                <th className="px-4 py-1.5 text-left font-normal"></th>
              </tr>
            </thead>
            <tbody className="font-mono">
              {(m.resendDnsRecords ?? []).map((r, i) => (
                <tr key={i} className="border-t">
                  <td className="px-4 py-1.5">{r.type}</td>
                  <td className="break-all px-4 py-1.5 text-gray-700">{r.name}</td>
                  <td className="max-w-md break-all px-4 py-1.5 text-gray-700">
                    {r.value}
                    {typeof r.priority === 'number' && (
                      <span className="ml-2 text-gray-400">prio {r.priority}</span>
                    )}
                  </td>
                  <td className="px-4 py-1.5">
                    <StatusPill status={r.status} />
                  </td>
                  <td className="px-4 py-1.5">
                    <CopyButton text={r.value} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {!verified && m.resendDomainId && (
        <p className="rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800">
          <AlertCircle className="mr-1 inline h-3.5 w-3.5" />
          Le domaine n&apos;est pas encore verifie. Tant qu&apos;il ne l&apos;est pas, les
          emails partiront avec une bannerie "via resend.dev" ou risquent d&apos;atterrir
          en spam.
        </p>
      )}

      {/* Reception (Mailcow) — placeholder phase 2 */}
      <div className="rounded-lg border border-dashed bg-gray-50 p-4">
        <p className="text-sm font-semibold text-gray-700">Reception (Mailcow)</p>
        <p className="mt-1 text-xs text-gray-500">
          Boite de reception {m.primaryMailbox ?? '-'} - quota {m.mailboxQuotaMb} Mo,
          utilise {m.storageUsedMb} Mo. Bientot : provisioning Mailcow + webmail SOGo.
        </p>
      </div>
    </div>
  );
}

function StatusPill({ status }: { status: string | null | undefined }) {
  if (!status) return null;
  const map: Record<string, { bg: string; text: string; label: string }> = {
    verified: { bg: 'bg-emerald-100', text: 'text-emerald-700', label: 'Verifie' },
    pending: { bg: 'bg-amber-100', text: 'text-amber-700', label: 'En attente' },
    failed: { bg: 'bg-red-100', text: 'text-red-700', label: 'Echec' },
    not_started: { bg: 'bg-gray-100', text: 'text-gray-600', label: 'Non demarre' },
  };
  const cfg = map[status] ?? {
    bg: 'bg-gray-100',
    text: 'text-gray-700',
    label: status,
  };
  return (
    <span
      className={`inline-flex items-center rounded px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide ${cfg.bg} ${cfg.text}`}
    >
      {cfg.label}
    </span>
  );
}

function CopyButton({ text }: { text: string }) {
  const [done, setDone] = useState(false);
  return (
    <button
      type="button"
      onClick={() => {
        navigator.clipboard.writeText(text);
        setDone(true);
        setTimeout(() => setDone(false), 1500);
      }}
      className="inline-flex items-center gap-1 text-gray-500 hover:text-gray-700"
      title="Copier dans le presse-papier"
    >
      {done ? (
        <CheckCircle2 className="h-3.5 w-3.5 text-emerald-600" />
      ) : (
        <Copy className="h-3.5 w-3.5" />
      )}
    </button>
  );
}
