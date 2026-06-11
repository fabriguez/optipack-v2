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
import { toast } from 'sonner';
import { PageTransition } from '@/components/shared/PageTransition';
import { AppCard, AppCardHeader } from '@/components/ui/AppCard';
import { AppButton } from '@/components/ui/AppButton';
import { apiClient } from '@/lib/api/client';

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
}

export default function SettingsEmailPage() {
  const qc = useQueryClient();
  const [customDomain, setCustomDomain] = useState('');

  const mail = useQuery<TenantMail>({
    queryKey: ['tenant-self', 'mail'],
    queryFn: async () => (await apiClient.get('/system/mail')).data?.data,
  });

  const provision = useMutation({
    mutationFn: (custom?: string) =>
      apiClient.post('/system/mail/provision', custom ? { customDomain: custom } : {}),
    onSuccess: () => {
      toast.success('Domaine provisionne. Configure le DNS ci-dessous.');
      setCustomDomain('');
      qc.invalidateQueries({ queryKey: ['tenant-self', 'mail'] });
    },
    onError: (err: any) => toast.error(err?.response?.data?.message ?? 'Echec'),
  });

  const verify = useMutation({
    mutationFn: () => apiClient.post('/system/mail/verify'),
    onSuccess: (r) => {
      const status = r.data?.data?.resendStatus;
      if (status === 'verified') toast.success('Domaine verifie. Tu peux maintenant envoyer.');
      else toast.info(`Statut : ${status ?? 'pending'} — verifie tes records DNS.`);
      qc.invalidateQueries({ queryKey: ['tenant-self', 'mail'] });
    },
    onError: (err: any) => toast.error(err?.response?.data?.message ?? 'Echec verification'),
  });

  const refresh = useMutation({
    mutationFn: () => apiClient.post('/system/mail/refresh'),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['tenant-self', 'mail'] }),
  });

  if (mail.isLoading) {
    return (
      <PageTransition>
        <div className="h-40 animate-pulse rounded-xl bg-gray-100" />
      </PageTransition>
    );
  }
  if (!mail.data) {
    return (
      <PageTransition>
        <AppCard>
          <p className="text-sm text-red-600">
            Impossible de joindre la messagerie. Verifie que la variable
            <code className="mx-1">OPS_TENANT_PROXY_TOKEN</code>
            est configuree cote API.
          </p>
        </AppCard>
      </PageTransition>
    );
  }
  const m = mail.data;
  const verified = m.resendStatus === 'verified';

  return (
    <PageTransition>
      <div className="space-y-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Messagerie</h1>
          <p className="mt-1 text-sm text-gray-500">
            Configure ton domaine d&apos;envoi (Resend). Une boite de reception
            (Mailcow) avec 250 Mo de stockage suivra bientot.
          </p>
        </div>

        <AppCard>
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div className="flex items-start gap-3">
              <div
                className={
                  'flex h-12 w-12 shrink-0 items-center justify-center rounded-xl ' +
                  (verified
                    ? 'bg-emerald-100 text-emerald-700'
                    : m.resendDomainId
                    ? 'bg-amber-100 text-amber-700'
                    : 'bg-gray-100 text-gray-500')
                }
              >
                <Mail className="h-6 w-6" />
              </div>
              <div>
                <p className="text-base font-semibold">
                  {m.sendingDomain ?? (
                    <span className="text-gray-400">Aucun domaine configure</span>
                  )}
                </p>
                <p className="mt-0.5 text-xs text-gray-500">
                  {m.resendDomainId ? `Resend : ${m.resendDomainId}` : 'Non provisionne'}
                </p>
                <div className="mt-2 flex flex-wrap gap-1.5 text-[11px]">
                  <StatusPill status={m.resendStatus} />
                </div>
              </div>
            </div>
            {m.resendDomainId && (
              <div className="flex items-center gap-2">
                <AppButton variant="outline" onClick={() => refresh.mutate()} loading={refresh.isPending}>
                  <RefreshCw className="h-4 w-4" />
                  Refresh
                </AppButton>
                {!verified && (
                  <AppButton onClick={() => verify.mutate()} loading={verify.isPending}>
                    <CheckCircle2 className="h-4 w-4" />
                    Verifier
                  </AppButton>
                )}
              </div>
            )}
          </div>
        </AppCard>

        {/* Provisioning */}
        {!m.resendDomainId && (
          <AppCard>
            <AppCardHeader
              title="Provisionner un domaine d'envoi"
              description="Choisis : soit on cree un sous-domaine automatique sous transitsoftservices.com, soit tu utilises un domaine dont tu es proprietaire."
            />
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-[1fr_auto]">
              <input
                type="text"
                value={customDomain}
                onChange={(e) => setCustomDomain(e.target.value)}
                placeholder="mail.tonentreprise.com (optionnel)"
                className="rounded-md border px-3 py-2 text-sm font-mono"
              />
              <AppButton onClick={() => provision.mutate(customDomain || undefined)} loading={provision.isPending}>
                <Send className="h-4 w-4" />
                Provisionner
              </AppButton>
            </div>
          </AppCard>
        )}

        {/* DNS records */}
        {m.resendDomainId && (m.resendDnsRecords?.length ?? 0) > 0 && (
          <AppCard padding="sm">
            <header className="border-b px-4 py-3">
              <p className="text-sm font-semibold">Records DNS a configurer</p>
              <p className="mt-0.5 text-xs text-gray-500">
                Ajoute ces enregistrements chez le DNS provider qui gere{' '}
                <code className="font-mono">{m.sendingDomain}</code>. Apres propagation
                (1-30 min), clique &laquo; Verifier &raquo;.
              </p>
            </header>
            <div className="overflow-x-auto">
              <table className="w-full text-xs">
                <thead className="border-b bg-gray-50 text-gray-500">
                  <tr>
                    <th className="px-4 py-1.5 text-left font-normal">Type</th>
                    <th className="px-4 py-1.5 text-left font-normal">Nom</th>
                    <th className="px-4 py-1.5 text-left font-normal">Valeur</th>
                    <th className="px-4 py-1.5 text-left font-normal">Statut</th>
                    <th className="px-4 py-1.5"></th>
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
          </AppCard>
        )}

        {!verified && m.resendDomainId && (
          <div className="rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800">
            <AlertCircle className="mr-1 inline h-3.5 w-3.5" />
            Le domaine n&apos;est pas encore verifie. Tant qu&apos;il ne l&apos;est pas,
            les emails partent avec une banniere &laquo; via resend.dev &raquo; ou
            risquent d&apos;atterrir en spam.
          </div>
        )}

        {/* Reception placeholder (phase 2) */}
        <AppCard>
          <AppCardHeader
            title="Boite de reception"
            description="A venir : 250 Mo de stockage par defaut, webmail accessible, upgrade payant possible."
          />
          <p className="text-sm text-gray-500">
            Quota : <strong>{m.mailboxQuotaMb} Mo</strong> -{' '}
            utilise <strong>{m.storageUsedMb} Mo</strong>.{' '}
            {m.primaryMailbox ? (
              <>Boite principale : <code className="font-mono">{m.primaryMailbox}</code></>
            ) : (
              'Aucune boite encore provisionnee.'
            )}
          </p>
        </AppCard>
      </div>
    </PageTransition>
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
  const cfg = map[status] ?? { bg: 'bg-gray-100', text: 'text-gray-700', label: status };
  return (
    <span className={`inline-flex items-center rounded px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide ${cfg.bg} ${cfg.text}`}>
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
      title="Copier"
    >
      {done ? <CheckCircle2 className="h-3.5 w-3.5 text-emerald-600" /> : <Copy className="h-3.5 w-3.5" />}
    </button>
  );
}
