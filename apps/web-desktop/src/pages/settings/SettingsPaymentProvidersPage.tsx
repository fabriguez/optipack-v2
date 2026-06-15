import { useState } from 'react';
import { ChevronDown, ChevronUp, Plus, Trash2, Save, Zap } from 'lucide-react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { PageTransition } from '@/components/shared/PageTransition';
import { AppCard, AppCardHeader } from '@/components/ui/AppCard';
import { AppButton } from '@/components/ui/AppButton';
import { AppInput } from '@/components/ui/AppInput';
import { paymentConfigApi, type PaymentProvidersConfig, type PaymentChannelEntry, type PaymentProviderEntry } from '@/lib/api/organization';

const CHANNELS: { key: PaymentChannelEntry['channel']; label: string }[] = [
  { key: 'MOBILE_MONEY', label: 'Mobile Money' },
  { key: 'CARD', label: 'Carte bancaire' },
  { key: 'BANK_TRANSFER', label: 'Virement bancaire' },
  { key: 'USSD', label: 'USSD' },
];

const KNOWN_PROVIDERS: Record<string, string[]> = {
  TARAMONEY: ['apiKey', 'businessId', 'webhookSecret'],
  CAMPAY: ['apiUsername', 'apiPassword', 'webhookSecret'],
  MESOMB: ['serviceKey', 'appKey', 'webhookSecret'],
  NOTCHPAY: ['publicKey', 'privateKey'],
  FLUTTERWAVE: ['secretKey', 'webhookSecret'],
  STRIPE: ['secretKey', 'publishableKey', 'webhookSecret'],
};

const COUNTRY_OPTIONS = [
  { code: 'CM', label: 'Cameroun' }, { code: 'SN', label: 'Senegal' }, { code: 'CI', label: "Cote d'Ivoire" },
  { code: 'NG', label: 'Nigeria' }, { code: 'GH', label: 'Ghana' }, { code: 'CD', label: 'RD Congo' },
  { code: 'BF', label: 'Burkina Faso' }, { code: 'ML', label: 'Mali' }, { code: 'NE', label: 'Niger' },
  { code: 'TG', label: 'Togo' }, { code: 'BJ', label: 'Benin' }, { code: 'GN', label: 'Guinee' },
  { code: 'MG', label: 'Madagascar' }, { code: 'KE', label: 'Kenya' }, { code: 'TZ', label: 'Tanzanie' },
  { code: 'UG', label: 'Ouganda' }, { code: 'RW', label: 'Rwanda' }, { code: 'ZM', label: 'Zambie' },
  { code: 'MW', label: 'Malawi' }, { code: 'MZ', label: 'Mozambique' },
];

function ProviderCard({
  provider,
  onChange,
  onDelete,
  onMoveUp,
  onMoveDown,
  isFirst,
  isLast,
}: {
  provider: PaymentProviderEntry;
  onChange: (p: PaymentProviderEntry) => void;
  onDelete: () => void;
  onMoveUp: () => void;
  onMoveDown: () => void;
  isFirst: boolean;
  isLast: boolean;
}) {
  const [expanded, setExpanded] = useState(false);
  const fields = KNOWN_PROVIDERS[provider.name] ?? ['apiKey'];

  return (
    <div className="border border-gray-200 rounded-xl overflow-hidden mb-3">
      <div className="flex items-center gap-3 px-4 py-3 bg-gray-50">
        <div className="flex flex-col gap-0.5">
          <button type="button" onClick={onMoveUp} disabled={isFirst} className="disabled:opacity-30 hover:text-primary-600 transition">
            <ChevronUp className="h-4 w-4" />
          </button>
          <button type="button" onClick={onMoveDown} disabled={isLast} className="disabled:opacity-30 hover:text-primary-600 transition">
            <ChevronDown className="h-4 w-4" />
          </button>
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-sm font-semibold text-gray-900">{provider.name}</p>
          <p className="text-xs text-gray-500">Priorite {provider.priority}</p>
        </div>
        <button type="button" onClick={onDelete} className="text-red-500 hover:text-red-700 transition">
          <Trash2 className="h-4 w-4" />
        </button>
        <button type="button" onClick={() => setExpanded((v) => !v)} className="text-gray-400 hover:text-gray-600 transition">
          {expanded ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
        </button>
      </div>

      {expanded && (
        <div className="px-4 py-4 space-y-4">
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            {fields.map((field) => (
              <AppInput
                key={field}
                label={field}
                type={field.toLowerCase().includes('secret') || field.toLowerCase().includes('password') ? 'password' : 'text'}
                value={provider.credentials?.[field] ?? ''}
                onChange={(e) =>
                  onChange({ ...provider, credentials: { ...provider.credentials, [field]: e.target.value } })
                }
                placeholder={field}
              />
            ))}
          </div>

          <div>
            <p className="text-xs font-semibold text-gray-600 mb-2">Pays couverts (vide = tous)</p>
            <div className="grid grid-cols-2 gap-1 sm:grid-cols-3 lg:grid-cols-4">
              {COUNTRY_OPTIONS.map((c) => {
                const active = (provider.countries ?? []).includes(c.code);
                return (
                  <label key={c.code} className="flex items-center gap-2 cursor-pointer select-none">
                    <input
                      type="checkbox"
                      checked={active}
                      onChange={() => {
                        const countries = active
                          ? (provider.countries ?? []).filter((x) => x !== c.code)
                          : [...(provider.countries ?? []), c.code];
                        onChange({ ...provider, countries });
                      }}
                      className="h-3.5 w-3.5 rounded text-primary-500"
                    />
                    <span className="text-xs text-gray-700">{c.code} {c.label}</span>
                  </label>
                );
              })}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default function SettingsPaymentProvidersPage() {
  const qc = useQueryClient();
  const { data, isLoading } = useQuery({
    queryKey: ['payment-providers-config'],
    queryFn: () => paymentConfigApi.get().then((r) => r.data),
  });

  const [config, setConfig] = useState<PaymentProvidersConfig | null>(null);
  const [dirty, setDirty] = useState(false);
  const [activeChannel, setActiveChannel] = useState<PaymentChannelEntry['channel']>('MOBILE_MONEY');

  if (data && !config) {
    setConfig(data);
  }

  const saveMutation = useMutation({
    mutationFn: (cfg: PaymentProvidersConfig) => paymentConfigApi.save(cfg),
    onSuccess: () => {
      toast.success('Configuration enregistree');
      qc.invalidateQueries({ queryKey: ['payment-providers-config'] });
      setDirty(false);
    },
    onError: (err: any) => toast.error(err?.response?.data?.message ?? 'Erreur sauvegarde'),
  });

  const update = (newConfig: PaymentProvidersConfig) => {
    setConfig(newConfig);
    setDirty(true);
  };

  const getChannel = (ch: PaymentChannelEntry['channel']): PaymentChannelEntry =>
    config?.channels.find((c) => c.channel === ch) ?? { channel: ch, providers: [] };

  const setChannel = (ch: PaymentChannelEntry) => {
    if (!config) return;
    const channels = config.channels.filter((c) => c.channel !== ch.channel);
    if (ch.providers.length > 0) channels.push(ch);
    update({ channels });
  };

  const addProvider = (channelKey: PaymentChannelEntry['channel']) => {
    const name = window.prompt('Nom du provider (ex: TARAMONEY)');
    if (!name) return;
    const ch = getChannel(channelKey);
    const entry: PaymentProviderEntry = {
      name: name.trim().toUpperCase(),
      priority: ch.providers.length + 1,
      countries: [],
      credentials: {},
    };
    setChannel({ ...ch, providers: [...ch.providers, entry] });
  };

  const updateProvider = (channelKey: PaymentChannelEntry['channel'], index: number, updated: PaymentProviderEntry) => {
    const ch = getChannel(channelKey);
    const providers = [...ch.providers];
    providers[index] = updated;
    setChannel({ ...ch, providers });
  };

  const deleteProvider = (channelKey: PaymentChannelEntry['channel'], index: number) => {
    const ch = getChannel(channelKey);
    setChannel({ ...ch, providers: ch.providers.filter((_, i) => i !== index) });
  };

  const moveProvider = (channelKey: PaymentChannelEntry['channel'], index: number, dir: -1 | 1) => {
    const ch = getChannel(channelKey);
    const providers = [...ch.providers];
    const swap = index + dir;
    if (swap < 0 || swap >= providers.length) return;
    [providers[index], providers[swap]] = [providers[swap], providers[index]];
    providers.forEach((p, i) => { p.priority = i + 1; });
    setChannel({ ...ch, providers });
  };

  return (
    <PageTransition>
      <div className="space-y-5">
        <div className="flex items-start justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold text-gray-900">Providers de paiement</h1>
            <p className="text-sm text-gray-500 mt-1">
              Configurez les credentials et la chaine de fallback par canal de paiement.
            </p>
          </div>
          {dirty && (
            <AppButton
              onClick={() => config && saveMutation.mutate(config)}
              loading={saveMutation.isPending}
            >
              <Save className="h-4 w-4" />
              Sauvegarder
            </AppButton>
          )}
        </div>

        {dirty && (
          <div className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-2.5 text-sm font-medium text-amber-800">
            Modifications non sauvegardees — cliquez sur Sauvegarder pour appliquer.
          </div>
        )}

        <div className="flex gap-2 flex-wrap">
          {CHANNELS.map((ch) => (
            <button
              key={ch.key}
              type="button"
              onClick={() => setActiveChannel(ch.key)}
              className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-semibold transition ${
                activeChannel === ch.key
                  ? 'bg-primary-600 text-white'
                  : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
              }`}
            >
              <Zap className="h-3.5 w-3.5" />
              {ch.label}
            </button>
          ))}
        </div>

        {isLoading ? (
          <AppCard>
            <div className="animate-pulse space-y-3">
              {[1, 2].map((i) => <div key={i} className="h-12 bg-gray-100 rounded-xl" />)}
            </div>
          </AppCard>
        ) : (
          <AppCard>
            <AppCardHeader
              title={`${CHANNELS.find((c) => c.key === activeChannel)?.label ?? activeChannel} — Providers`}
              description="Par ordre de priorite. Le premier disponible pour le pays du client est utilise, les suivants servent de fallback."
            />
            {(() => {
              const ch = getChannel(activeChannel);
              return (
                <>
                  {ch.providers.map((p, i) => (
                    <ProviderCard
                      key={`${p.name}-${i}`}
                      provider={p}
                      onChange={(updated) => updateProvider(activeChannel, i, updated)}
                      onDelete={() => deleteProvider(activeChannel, i)}
                      onMoveUp={() => moveProvider(activeChannel, i, -1)}
                      onMoveDown={() => moveProvider(activeChannel, i, 1)}
                      isFirst={i === 0}
                      isLast={i === ch.providers.length - 1}
                    />
                  ))}
                  {ch.providers.length === 0 && (
                    <p className="py-4 text-sm text-gray-400">Aucun provider configure pour ce canal.</p>
                  )}
                  <button
                    type="button"
                    onClick={() => addProvider(activeChannel)}
                    className="mt-2 flex items-center gap-2 text-sm font-semibold text-primary-600 hover:text-primary-700 transition"
                  >
                    <Plus className="h-4 w-4" />
                    Ajouter un provider
                  </button>
                </>
              );
            })()}
          </AppCard>
        )}
      </div>
    </PageTransition>
  );
}
