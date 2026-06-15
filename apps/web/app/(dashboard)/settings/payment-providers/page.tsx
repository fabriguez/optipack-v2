'use client';

import { useEffect, useState } from 'react';
import { Plus, Trash2, Eye, EyeOff, Save, ChevronDown, ChevronUp, AlertTriangle } from 'lucide-react';
import { PageTransition } from '@/components/shared/PageTransition';
import { AppCard } from '@/components/ui/AppCard';
import { usePaymentConfig, useSavePaymentConfig } from '@/lib/hooks/usePaymentConfig';
import type { PaymentChannelEntry, PaymentProviderEntry, ProviderCredentials } from '@/lib/api/organization';

// ── Constants ──────────────────────────────────────────────────────────────

const CHANNELS: Array<{ key: PaymentChannelEntry['channel']; label: string }> = [
  { key: 'MOBILE_MONEY', label: 'Mobile Money' },
  { key: 'CARD', label: 'Carte bancaire' },
  { key: 'BANK_TRANSFER', label: 'Virement bancaire' },
  { key: 'USSD', label: 'USSD' },
];

const KNOWN_PROVIDERS = [
  'TARAMONEY', 'CAMPAY', 'NOTCHPAY', 'MESOMB', 'FLUTTERWAVE', 'STRIPE',
];

type CredField = { key: string; label: string; secret?: boolean };

const CREDENTIAL_FIELDS: Record<string, CredField[]> = {
  TARAMONEY: [
    { key: 'apiKey', label: 'Clé API', secret: true },
    { key: 'businessId', label: 'Business ID' },
    { key: 'webhookSecret', label: 'Secret Webhook', secret: true },
  ],
  CAMPAY: [
    { key: 'apiUsername', label: 'Username' },
    { key: 'apiPassword', label: 'Mot de passe', secret: true },
    { key: 'webhookSecret', label: 'Secret Webhook', secret: true },
  ],
  MESOMB: [
    { key: 'serviceKey', label: 'Service Key', secret: true },
    { key: 'appKey', label: 'App Key', secret: true },
    { key: 'webhookSecret', label: 'Secret Webhook', secret: true },
  ],
  NOTCHPAY: [
    { key: 'publicKey', label: 'Clé publique' },
    { key: 'privateKey', label: 'Clé privée', secret: true },
  ],
  FLUTTERWAVE: [
    { key: 'secretKey', label: 'Secret Key', secret: true },
    { key: 'webhookSecret', label: 'Secret Webhook', secret: true },
  ],
  STRIPE: [
    { key: 'secretKey', label: 'Secret Key (sk_...)', secret: true },
    { key: 'publishableKey', label: 'Clé publiable (pk_...)' },
    { key: 'webhookSecret', label: 'Secret Webhook (whsec_...)', secret: true },
  ],
};

const COUNTRY_OPTIONS = [
  'CM', 'SN', 'CI', 'BF', 'GH', 'KE', 'RW', 'GA', 'CD', 'CG',
  'TZ', 'UG', 'SL', 'ZM', 'BJ', 'TG', 'GN', 'ML', 'NE', 'NG',
];

// ── Helpers ────────────────────────────────────────────────────────────────

function emptyProvider(): PaymentProviderEntry {
  return { name: 'TARAMONEY', priority: 1, countries: [], credentials: {} };
}

function ensureChannel(
  channels: PaymentChannelEntry[],
  ch: PaymentChannelEntry['channel'],
): PaymentChannelEntry[] {
  if (channels.find((c) => c.channel === ch)) return channels;
  return [...channels, { channel: ch, providers: [] }];
}

// ── Sub-components ─────────────────────────────────────────────────────────

function CredentialFields({
  providerName,
  credentials,
  onChange,
}: {
  providerName: string;
  credentials: ProviderCredentials;
  onChange: (c: ProviderCredentials) => void;
}) {
  const [visible, setVisible] = useState<Record<string, boolean>>({});
  const fields = CREDENTIAL_FIELDS[providerName.toUpperCase()] ?? [];

  if (fields.length === 0) {
    return (
      <p className="text-xs text-gray-400 italic">
        Provider inconnu — credentials geres manuellement via l'API.
      </p>
    );
  }

  return (
    <div className="space-y-2">
      {fields.map((f) => (
        <div key={f.key}>
          <label className="block text-xs font-medium text-gray-600 mb-0.5">{f.label}</label>
          <div className="flex gap-1">
            <input
              type={f.secret && !visible[f.key] ? 'password' : 'text'}
              className="flex-1 rounded-lg border border-gray-200 bg-white px-3 py-1.5 text-sm font-mono"
              placeholder={`${f.key}...`}
              value={credentials[f.key] ?? ''}
              onChange={(e) => onChange({ ...credentials, [f.key]: e.target.value })}
              autoComplete="off"
            />
            {f.secret && (
              <button
                type="button"
                className="rounded-lg border border-gray-200 px-2 text-gray-400 hover:text-gray-700"
                onClick={() => setVisible((v) => ({ ...v, [f.key]: !v[f.key] }))}
              >
                {visible[f.key] ? <EyeOff className="h-3.5 w-3.5" /> : <Eye className="h-3.5 w-3.5" />}
              </button>
            )}
          </div>
        </div>
      ))}
    </div>
  );
}

function ProviderCard({
  provider,
  index,
  total,
  onChange,
  onRemove,
  onMoveUp,
  onMoveDown,
}: {
  provider: PaymentProviderEntry;
  index: number;
  total: number;
  onChange: (p: PaymentProviderEntry) => void;
  onRemove: () => void;
  onMoveUp: () => void;
  onMoveDown: () => void;
}) {
  const [open, setOpen] = useState(index === 0);
  const toggleCountry = (code: string) => {
    const cur = provider.countries ?? [];
    onChange({
      ...provider,
      countries: cur.includes(code) ? cur.filter((c) => c !== code) : [...cur, code],
    });
  };

  return (
    <div className="rounded-xl border border-gray-200 bg-white overflow-hidden">
      {/* Header */}
      <div
        className="flex items-center gap-3 px-4 py-3 cursor-pointer hover:bg-gray-50"
        onClick={() => setOpen((o) => !o)}
      >
        <div className="flex flex-col gap-0.5">
          <button
            type="button"
            onClick={(e) => { e.stopPropagation(); onMoveUp(); }}
            disabled={index === 0}
            className="p-0.5 text-gray-300 hover:text-gray-600 disabled:opacity-30"
          >
            <ChevronUp className="h-3 w-3" />
          </button>
          <button
            type="button"
            onClick={(e) => { e.stopPropagation(); onMoveDown(); }}
            disabled={index === total - 1}
            className="p-0.5 text-gray-300 hover:text-gray-600 disabled:opacity-30"
          >
            <ChevronDown className="h-3 w-3" />
          </button>
        </div>
        <span className="rounded px-2 py-0.5 text-xs font-mono font-semibold bg-blue-50 text-blue-700">{provider.name}</span>
        <span className="text-xs text-gray-400">priorité {provider.priority}</span>
        {(provider.countries?.length ?? 0) > 0 && (
          <span className="text-xs text-gray-400">
            {provider.countries!.join(', ')}
          </span>
        )}
        <div className="ml-auto flex items-center gap-2">
          <button
            type="button"
            onClick={(e) => { e.stopPropagation(); onRemove(); }}
            className="rounded p-1 text-gray-300 hover:bg-red-50 hover:text-red-600"
          >
            <Trash2 className="h-3.5 w-3.5" />
          </button>
          {open ? <ChevronUp className="h-4 w-4 text-gray-400" /> : <ChevronDown className="h-4 w-4 text-gray-400" />}
        </div>
      </div>

      {/* Body */}
      {open && (
        <div className="border-t border-gray-100 px-4 py-4 space-y-4 bg-gray-50">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">Provider</label>
              <select
                className="w-full rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm"
                value={provider.name}
                onChange={(e) => onChange({ ...provider, name: e.target.value })}
              >
                {KNOWN_PROVIDERS.map((p) => (
                  <option key={p} value={p}>{p}</option>
                ))}
                <option value={provider.name}>{provider.name}</option>
              </select>
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">Priorité (bas = premier)</label>
              <input
                type="number"
                min={1}
                className="w-full rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm"
                value={provider.priority}
                onChange={(e) => onChange({ ...provider, priority: Number(e.target.value) || 1 })}
              />
            </div>
          </div>

          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">
              Pays (vide = tous)
            </label>
            <div className="flex flex-wrap gap-1.5">
              {COUNTRY_OPTIONS.map((code) => {
                const selected = (provider.countries ?? []).includes(code);
                return (
                  <button
                    key={code}
                    type="button"
                    onClick={() => toggleCountry(code)}
                    className="rounded px-2 py-0.5 text-xs font-mono font-semibold transition"
                    style={{
                      background: selected ? 'var(--color-primary-600, #166534)' : '#f3f4f6',
                      color: selected ? '#fff' : '#374151',
                    }}
                  >
                    {code}
                  </button>
                );
              })}
            </div>
          </div>

          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">
              URL API (optionnel — override sandbox/prod)
            </label>
            <input
              type="text"
              className="w-full rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm"
              value={provider.apiBaseUrl ?? ''}
              onChange={(e) => onChange({ ...provider, apiBaseUrl: e.target.value || undefined })}
              placeholder="https://..."
            />
          </div>

          <div>
            <p className="text-xs font-semibold text-gray-700 mb-2">Credentials</p>
            <CredentialFields
              providerName={provider.name}
              credentials={provider.credentials ?? {}}
              onChange={(c) => onChange({ ...provider, credentials: c })}
            />
          </div>
        </div>
      )}
    </div>
  );
}

// ── Page ───────────────────────────────────────────────────────────────────

export default function PaymentProvidersPage() {
  const { data: remote, isLoading } = usePaymentConfig();
  const saveMutation = useSavePaymentConfig();
  const [channels, setChannels] = useState<PaymentChannelEntry[]>([]);
  const [activeChannel, setActiveChannel] = useState<PaymentChannelEntry['channel']>('MOBILE_MONEY');
  const [dirty, setDirty] = useState(false);

  useEffect(() => {
    if (remote) {
      setChannels(remote.channels ?? []);
      setDirty(false);
    }
  }, [remote]);

  const mutateChannels = (fn: (prev: PaymentChannelEntry[]) => PaymentChannelEntry[]) => {
    setChannels((prev) => fn(prev));
    setDirty(true);
  };

  const updateProvider = (ch: PaymentChannelEntry['channel'], idx: number, p: PaymentProviderEntry) => {
    mutateChannels((prev) =>
      prev.map((c) =>
        c.channel !== ch ? c : { ...c, providers: c.providers.map((pr, i) => (i === idx ? p : pr)) },
      ),
    );
  };

  const removeProvider = (ch: PaymentChannelEntry['channel'], idx: number) => {
    mutateChannels((prev) =>
      prev.map((c) =>
        c.channel !== ch ? c : { ...c, providers: c.providers.filter((_, i) => i !== idx) },
      ),
    );
  };

  const addProvider = (ch: PaymentChannelEntry['channel']) => {
    mutateChannels((prev) => {
      const next = ensureChannel(prev, ch);
      return next.map((c) =>
        c.channel !== ch ? c : { ...c, providers: [...c.providers, emptyProvider()] },
      );
    });
  };

  const moveProvider = (ch: PaymentChannelEntry['channel'], from: number, to: number) => {
    mutateChannels((prev) =>
      prev.map((c) => {
        if (c.channel !== ch) return c;
        const ps = [...c.providers];
        const [item] = ps.splice(from, 1);
        ps.splice(to, 0, item);
        return { ...c, providers: ps.map((p, i) => ({ ...p, priority: i + 1 })) };
      }),
    );
  };

  const activeProviders =
    channels.find((c) => c.channel === activeChannel)?.providers ?? [];

  const save = () => {
    saveMutation.mutate({ channels });
    setDirty(false);
  };

  if (isLoading) {
    return (
      <PageTransition>
        <p className="text-sm text-gray-400 p-4">Chargement...</p>
      </PageTransition>
    );
  }

  return (
    <PageTransition>
      <div className="space-y-5">
        <div className="flex items-start justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold text-gray-900">Providers de paiement</h1>
            <p className="text-sm text-gray-500 mt-1">
              Configurez les agregateurs par canal et par pays. La chaine de fallback suit l'ordre d'affichage.
            </p>
          </div>
          <button
            type="button"
            onClick={save}
            disabled={!dirty || saveMutation.isPending}
            className="inline-flex items-center gap-2 rounded-xl px-4 py-2 text-sm font-semibold text-white transition disabled:opacity-50"
            style={{ background: 'var(--color-primary-600, #166534)' }}
          >
            <Save className="h-4 w-4" />
            {saveMutation.isPending ? 'Enregistrement...' : 'Enregistrer'}
          </button>
        </div>

        {dirty && (
          <div className="flex items-center gap-2 rounded-lg bg-amber-50 border border-amber-200 px-4 py-2 text-sm text-amber-700">
            <AlertTriangle className="h-4 w-4 shrink-0" />
            Modifications non enregistrees
          </div>
        )}

        {/* Channel tabs */}
        <div className="flex gap-1 border-b border-gray-200">
          {CHANNELS.map((ch) => {
            const count = channels.find((c) => c.channel === ch.key)?.providers.length ?? 0;
            return (
              <button
                key={ch.key}
                type="button"
                onClick={() => setActiveChannel(ch.key)}
                className="px-4 py-2.5 text-sm font-medium border-b-2 transition-colors"
                style={{
                  borderColor: activeChannel === ch.key ? 'var(--color-primary-600, #166534)' : 'transparent',
                  color: activeChannel === ch.key ? 'var(--color-primary-700, #14532d)' : '#6b7280',
                }}
              >
                {ch.label}
                {count > 0 && (
                  <span className="ml-1.5 rounded-full bg-gray-100 px-1.5 py-0.5 text-xs text-gray-600">
                    {count}
                  </span>
                )}
              </button>
            );
          })}
        </div>

        {/* Providers list */}
        <div className="space-y-3">
          {activeProviders.length === 0 ? (
            <div className="rounded-xl border border-gray-200 bg-white">
              <p className="py-6 text-center text-sm text-gray-400">
                Aucun provider configure pour ce canal.
              </p>
            </div>
          ) : (
            activeProviders.map((p, i) => (
              <ProviderCard
                key={i}
                provider={p}
                index={i}
                total={activeProviders.length}
                onChange={(updated) => updateProvider(activeChannel, i, updated)}
                onRemove={() => removeProvider(activeChannel, i)}
                onMoveUp={() => moveProvider(activeChannel, i, i - 1)}
                onMoveDown={() => moveProvider(activeChannel, i, i + 1)}
              />
            ))
          )}

          <button
            type="button"
            onClick={() => addProvider(activeChannel)}
            className="flex w-full items-center justify-center gap-2 rounded-xl border-2 border-dashed border-gray-200 py-3 text-sm text-gray-400 transition hover:border-primary-300 hover:text-primary-600"
          >
            <Plus className="h-4 w-4" />
            Ajouter un provider {CHANNELS.find((c) => c.key === activeChannel)?.label}
          </button>
        </div>
      </div>
    </PageTransition>
  );
}
