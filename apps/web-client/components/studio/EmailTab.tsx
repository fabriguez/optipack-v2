'use client';

import { useEffect, useState } from 'react';
import { motion } from 'framer-motion';
import { Check, Copy, Loader2, Mail, ShieldCheck, Sparkles } from 'lucide-react';
import { toast } from 'sonner';
import { useMutation, useQuery } from '@tanstack/react-query';
import type {
  EmailConfig,
  EmailConfigPublic,
  EmailProvider,
} from '@transitsoftservices/shared';
import { portalApi, apiClient } from '@/lib/api/client';
import { Field } from '@/components/auth/Field';

const PROVIDERS: { id: EmailProvider; label: string; desc: string }[] = [
  {
    id: 'shared',
    label: 'Transit Soft Services (partage)',
    desc: 'Sender no-reply@notify.transitsoftservices.com - mention "via Transit Soft Services". Aucun DNS, ready en 0 minute.',
  },
  {
    id: 'resend',
    label: 'Resend',
    desc: 'Recommande - DNS DKIM/SPF a ajouter chez votre registrar, deliverability premium.',
  },
  {
    id: 'sendgrid',
    label: 'SendGrid',
    desc: 'A venir.',
  },
  {
    id: 'ses',
    label: 'AWS SES',
    desc: 'A venir.',
  },
];

export function EmailTab() {
  const [provider, setProvider] = useState<EmailProvider>('shared');
  const [senderEmail, setSenderEmail] = useState('');
  const [senderName, setSenderName] = useState('');
  const [replyTo, setReplyTo] = useState('');
  const [apiKey, setApiKey] = useState('');
  const [config, setConfig] = useState<EmailConfigPublic | null>(null);

  // Load current tenant-meta to hydrate state.
  const { data: meta } = useQuery({
    queryKey: ['tenant-meta'],
    queryFn: () => apiClient.get('/tenant-meta').then((r) => r.data.data),
  });

  useEffect(() => {
    if (!meta?.emailConfig) return;
    const cfg = meta.emailConfig as EmailConfigPublic;
    setConfig(cfg);
    setProvider(cfg.provider ?? 'shared');
    setSenderEmail(cfg.senderEmail ?? '');
    setSenderName(cfg.senderName ?? '');
    setReplyTo(cfg.replyTo ?? '');
  }, [meta]);

  const save = useMutation({
    mutationFn: () =>
      portalApi.patchEmailConfig({
        provider,
        senderEmail: senderEmail || undefined,
        senderName: senderName || undefined,
        replyTo: replyTo || undefined,
        ...(apiKey
          ? { credentials: { apiKey } as EmailConfig['credentials'] }
          : {}),
      }),
    onSuccess: ({ emailConfig }) => {
      setConfig(emailConfig ?? null);
      setApiKey('');
      toast.success('Configuration email enregistree.');
    },
    onError: (err: any) => {
      toast.error(err?.response?.data?.message || 'Sauvegarde impossible.');
    },
  });

  const verify = useMutation({
    mutationFn: () => portalApi.verifyEmailDomain(),
    onSuccess: (data) => {
      setConfig((prev) =>
        prev
          ? {
              ...prev,
              dkimStatus: data.status,
              dnsRecords: data.dnsRecords,
              verifiedAt:
                data.status === 'verified'
                  ? new Date().toISOString()
                  : prev.verifiedAt,
            }
          : null,
      );
      if (data.status === 'verified') toast.success('Domaine verifie.');
      else if (data.status === 'failed')
        toast.error(data.message || 'Verification echouee.');
      else toast.info('En attente de propagation DNS.');
    },
  });

  const showResendBlock = provider === 'resend';

  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      className="space-y-6"
    >
      <header>
        <h2
          className="text-xl font-bold tracking-tight skin-font-heading"
          style={{ color: 'var(--skin-foreground)' }}
        >
          <Mail className="mr-2 inline h-5 w-5" />
          Email transactionnel
        </h2>
        <p className="mt-1 text-sm" style={{ color: 'var(--skin-muted)' }}>
          Notifications de colis, recus, reset de mot de passe. Choisissez
          votre provider et votre adresse d'envoi.
        </p>
      </header>

      <section className="space-y-3 p-5 skin-card">
        <h3
          className="text-xs font-bold uppercase tracking-[0.2em]"
          style={{ color: 'var(--skin-primary)' }}
        >
          Provider
        </h3>
        <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
          {PROVIDERS.map((p) => {
            const active = provider === p.id;
            const disabled = p.id === 'sendgrid' || p.id === 'ses';
            return (
              <button
                key={p.id}
                type="button"
                disabled={disabled}
                onClick={() => setProvider(p.id)}
                className="text-left p-3 transition-all"
                style={{
                  background: 'var(--skin-surface)',
                  border: `1px solid ${active ? 'var(--skin-primary)' : 'var(--skin-border)'}`,
                  borderRadius: 'var(--skin-radius-sm)',
                  opacity: disabled ? 0.45 : 1,
                  cursor: disabled ? 'not-allowed' : 'pointer',
                }}
              >
                <div className="flex items-center justify-between">
                  <p
                    className="text-sm font-semibold"
                    style={{ color: 'var(--skin-foreground)' }}
                  >
                    {p.label}
                  </p>
                  {active && (
                    <span
                      className="inline-flex h-4 w-4 items-center justify-center rounded-full text-white"
                      style={{ background: 'var(--skin-primary)' }}
                    >
                      <Check className="h-3 w-3" />
                    </span>
                  )}
                </div>
                <p
                  className="mt-1 text-[11px] leading-snug"
                  style={{ color: 'var(--skin-muted)' }}
                >
                  {p.desc}
                </p>
              </button>
            );
          })}
        </div>
      </section>

      <section className="space-y-3 p-5 skin-card">
        <h3
          className="text-xs font-bold uppercase tracking-[0.2em]"
          style={{ color: 'var(--skin-primary)' }}
        >
          Identite d'envoi
        </h3>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <Field
            label="Adresse d'expedition"
            hint={
              provider === 'shared'
                ? 'En mode partage on utilise no-reply@notify.transitsoftservices.com.'
                : 'Doit etre sur un domaine que vous controlez.'
            }
          >
            <input
              type="email"
              value={senderEmail}
              onChange={(e) => setSenderEmail(e.target.value)}
              placeholder="no-reply@acme.com"
              className="skin-input"
              disabled={provider === 'shared'}
            />
          </Field>
          <Field label="Nom affiche">
            <input
              type="text"
              value={senderName}
              onChange={(e) => setSenderName(e.target.value)}
              placeholder="Acme Transit"
              className="skin-input"
            />
          </Field>
        </div>
        <Field label="Repondre a (optionnel)">
          <input
            type="email"
            value={replyTo}
            onChange={(e) => setReplyTo(e.target.value)}
            placeholder="support@acme.com"
            className="skin-input"
          />
        </Field>
      </section>

      {showResendBlock && (
        <section className="space-y-3 p-5 skin-card">
          <h3
            className="text-xs font-bold uppercase tracking-[0.2em]"
            style={{ color: 'var(--skin-primary)' }}
          >
            Cle API Resend
          </h3>
          <Field
            label="API Key"
            hint={
              config?.apiKeyHint
                ? `Cle deja enregistree : ${config.apiKeyHint}. Laissez vide pour ne pas la modifier.`
                : "Trouvable sur resend.com -> API Keys."
            }
          >
            <input
              type="password"
              value={apiKey}
              onChange={(e) => setApiKey(e.target.value)}
              placeholder={config?.apiKeyHint ?? 're_xxx...'}
              className="skin-input"
              autoComplete="off"
            />
          </Field>
        </section>
      )}

      <div className="flex flex-wrap items-center gap-3">
        <button
          type="button"
          onClick={() => save.mutate()}
          disabled={save.isPending}
          className="inline-flex items-center gap-2 px-5 py-2.5 text-sm font-semibold skin-btn-primary"
        >
          {save.isPending ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <>
              <Sparkles className="h-4 w-4" />
              Enregistrer
            </>
          )}
        </button>
        {showResendBlock && senderEmail && (
          <button
            type="button"
            onClick={() => verify.mutate()}
            disabled={verify.isPending}
            className="inline-flex items-center gap-2 px-4 py-2.5 text-sm font-semibold skin-btn-ghost"
          >
            {verify.isPending ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <ShieldCheck className="h-4 w-4" />
            )}
            Verifier DKIM
          </button>
        )}
        {config?.dkimStatus && (
          <StatusBadge status={config.dkimStatus} />
        )}
      </div>

      {config?.dnsRecords && config.dnsRecords.length > 0 && (
        <section className="space-y-3 p-5 skin-card">
          <h3
            className="text-xs font-bold uppercase tracking-[0.2em]"
            style={{ color: 'var(--skin-primary)' }}
          >
            Enregistrements DNS a ajouter
          </h3>
          <p className="text-xs" style={{ color: 'var(--skin-muted)' }}>
            Ajoutez ces enregistrements chez votre registrar (OVH, Namecheap,
            Cloudflare...). La verification peut prendre jusqu'a 1h.
          </p>
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead>
                <tr style={{ color: 'var(--skin-muted)' }}>
                  <th className="px-2 py-2 text-left font-semibold">Type</th>
                  <th className="px-2 py-2 text-left font-semibold">Nom</th>
                  <th className="px-2 py-2 text-left font-semibold">Valeur</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {config.dnsRecords.map((r, i) => (
                  <tr
                    key={i}
                    className="border-t"
                    style={{ borderColor: 'var(--skin-border)' }}
                  >
                    <td className="px-2 py-2 font-mono font-semibold">{r.type}</td>
                    <td className="px-2 py-2 font-mono">{r.name}</td>
                    <td className="px-2 py-2 font-mono break-all">{r.value}</td>
                    <td className="px-2 py-2">
                      <button
                        type="button"
                        onClick={() => {
                          navigator.clipboard.writeText(r.value);
                          toast.success('Copie');
                        }}
                        className="inline-flex h-7 w-7 items-center justify-center skin-btn-ghost"
                        aria-label="Copier"
                      >
                        <Copy className="h-3 w-3" />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}
    </motion.div>
  );
}

function StatusBadge({ status }: { status: 'pending' | 'verified' | 'failed' }) {
  const map = {
    pending: { color: '#a16207', label: 'En attente' },
    verified: { color: '#16a34a', label: 'Verifie' },
    failed: { color: '#dc2626', label: 'Echec' },
  } as const;
  const m = map[status];
  return (
    <span
      className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-bold uppercase tracking-wide skin-radius-sm"
      style={{
        background: `color-mix(in oklab, ${m.color} 12%, transparent)`,
        color: m.color,
      }}
    >
      <span
        className="inline-block h-1.5 w-1.5 rounded-full"
        style={{ background: m.color }}
      />
      {m.label}
    </span>
  );
}
