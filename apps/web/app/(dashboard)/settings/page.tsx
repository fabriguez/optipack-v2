'use client';

import { useState, useEffect } from 'react';
import { Settings, Globe, Trash2, Plus, Save, Award, Palette, Boxes, Layout, Mail, CreditCard, ShieldAlert, Zap, Bell, MessageCircle, MessageSquareMore } from 'lucide-react';
import Link from 'next/link';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { PageTransition } from '@/components/shared/PageTransition';
import { AppCard, AppCardHeader } from '@/components/ui/AppCard';
import { AppInput } from '@/components/ui/AppInput';
import { AppButton } from '@/components/ui/AppButton';
import { AppTabs } from '@/components/ui/AppTabs';
import { AppBadge } from '@/components/ui/AppBadge';
import { AppDataTable } from '@/components/ui/AppDataTable';
import { configApi, currenciesApi, type CurrencyInput } from '@/lib/api/config';
import { useIsTenantAdmin } from '@/lib/hooks/usePermission';

// ── Config Labels ──────────────────────────────────────────

const CONFIG_LABELS: Record<string, string> = {
  penalty_daily_rate: 'Taux journalier de penalite (XAF)',
  penalty_grace_days: 'Jours de grace avant penalite',
  loyalty_points_divisor: 'Diviseur de points de fidelite',
};

export default function SettingsPage() {
  const isAdmin = useIsTenantAdmin();
  return (
    <PageTransition>
      <div className="space-y-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Parametres</h1>
          <p className="text-sm text-gray-500 mt-1">Configuration du systeme.</p>
        </div>

        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <Link href="/settings/loyalty" className="block">
            <AppCard className="hover:border-primary-300 transition">
              <div className="flex items-center gap-3">
                <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-primary-50">
                  <Award className="h-5 w-5 text-primary-600" />
                </div>
                <div>
                  <p className="text-sm font-medium">Programme de fidelite</p>
                  <p className="text-xs text-gray-500">Paliers + reductions + avantages</p>
                </div>
              </div>
            </AppCard>
          </Link>
          <Link href="/settings/branding" className="block">
            <AppCard className="hover:border-primary-300 transition">
              <div className="flex items-center gap-3">
                <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-primary-50">
                  <Palette className="h-5 w-5 text-primary-600" />
                </div>
                <div>
                  <p className="text-sm font-medium">Branding (dashboard)</p>
                  <p className="text-xs text-gray-500">Logo, couleurs, identite interne</p>
                </div>
              </div>
            </AppCard>
          </Link>
          {isAdmin && (
            <Link href="/settings/site" className="block">
              <AppCard className="hover:border-primary-300 transition">
                <div className="flex items-center gap-3">
                  <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-primary-50">
                    <Layout className="h-5 w-5 text-primary-600" />
                  </div>
                  <div>
                    <p className="text-sm font-medium">Studio - Site public</p>
                    <p className="text-xs text-gray-500">Peau, couleurs, typo et images du portail client</p>
                  </div>
                </div>
              </AppCard>
            </Link>
          )}
          <Link href="/settings/debt-block" className="block">
            <AppCard className="hover:border-primary-300 transition">
              <div className="flex items-center gap-3">
                <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-primary-50">
                  <ShieldAlert className="h-5 w-5 text-primary-600" />
                </div>
                <div>
                  <p className="text-sm font-medium">Blocage sur dettes</p>
                  <p className="text-xs text-gray-500">Refus auto remise/creation colis si dette &gt; seuil</p>
                </div>
              </div>
            </AppCard>
          </Link>
          <Link href="/settings/payment-methods" className="block">
            <AppCard className="hover:border-primary-300 transition">
              <div className="flex items-center gap-3">
                <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-primary-50">
                  <CreditCard className="h-5 w-5 text-primary-600" />
                </div>
                <div>
                  <p className="text-sm font-medium">Methodes de paiement</p>
                  <p className="text-xs text-gray-500">Modes acceptes : especes, MoMo, virement, custom...</p>
                </div>
              </div>
            </AppCard>
          </Link>
          <Link href="/settings/payment-providers" className="block">
            <AppCard className="hover:border-primary-300 transition">
              <div className="flex items-center gap-3">
                <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-primary-50">
                  <Zap className="h-5 w-5 text-primary-600" />
                </div>
                <div>
                  <p className="text-sm font-medium">Providers de paiement</p>
                  <p className="text-xs text-gray-500">TaraMoney, Campay, Stripe... — credentials & fallback</p>
                </div>
              </div>
            </AppCard>
          </Link>
          <Link href="/settings/email" className="block">
            <AppCard className="hover:border-primary-300 transition">
              <div className="flex items-center gap-3">
                <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-primary-50">
                  <Mail className="h-5 w-5 text-primary-600" />
                </div>
                <div>
                  <p className="text-sm font-medium">Messagerie</p>
                  <p className="text-xs text-gray-500">Domaine d&apos;envoi + DNS + reception</p>
                </div>
              </div>
            </AppCard>
          </Link>
          <Link href="/settings/notifications" className="block">
            <AppCard className="hover:border-primary-300 transition">
              <div className="flex items-center gap-3">
                <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-primary-50">
                  <Bell className="h-5 w-5 text-primary-600" />
                </div>
                <div>
                  <p className="text-sm font-medium">Notifications</p>
                  <p className="text-xs text-gray-500">Canaux, events, templates de messages</p>
                </div>
              </div>
            </AppCard>
          </Link>
          <Link href="/settings/whatsapp-personal" className="block">
            <AppCard className="hover:border-primary-300 transition">
              <div className="flex items-center gap-3">
                <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-primary-50">
                  <MessageCircle className="h-5 w-5 text-primary-600" />
                </div>
                <div>
                  <p className="text-sm font-medium">WhatsApp Personnel</p>
                  <p className="text-xs text-gray-500">Connecter votre propre numéro comme canal</p>
                </div>
              </div>
            </AppCard>
          </Link>
          <Link href="/settings/wapino" className="block">
            <AppCard className="hover:border-primary-300 transition">
              <div className="flex items-center gap-3">
                <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-primary-50">
                  <MessageSquareMore className="h-5 w-5 text-primary-600" />
                </div>
                <div>
                  <p className="text-sm font-medium">Wapino (secours)</p>
                  <p className="text-xs text-gray-500">Fallback WhatsApp si le canal personnel échoue</p>
                </div>
              </div>
            </AppCard>
          </Link>
          <Link href="/settings/system" className="block">
            <AppCard className="hover:border-primary-300 transition">
              <div className="flex items-center gap-3">
                <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-primary-50">
                  <Boxes className="h-5 w-5 text-primary-600" />
                </div>
                <div>
                  <p className="text-sm font-medium">Modules et systeme</p>
                  <p className="text-xs text-gray-500">Modules actifs, domaine, politique d&apos;update</p>
                </div>
              </div>
            </AppCard>
          </Link>
        </div>

        <AppTabs
          tabs={[
            {
              value: 'general',
              label: 'General',
              icon: <Settings className="h-4 w-4" />,
              content: <GeneralTab />,
            },
            {
              value: 'currencies',
              label: 'Devises',
              icon: <Globe className="h-4 w-4" />,
              content: <CurrenciesTab />,
            },
          ]}
        />
      </div>
    </PageTransition>
  );
}

// ── General Tab ────────────────────────────────────────────

function GeneralTab() {
  const queryClient = useQueryClient();

  const { data: configData, isLoading } = useQuery({
    queryKey: ['config'],
    queryFn: () => configApi.list(),
  });

  const configs: { id: string; key: string; value: string }[] = configData?.data || [];

  const [editedValues, setEditedValues] = useState<Record<string, string>>({});
  const [hasChanges, setHasChanges] = useState(false);

  // Initialize edited values from server data
  useEffect(() => {
    if (configs.length > 0) {
      const initial: Record<string, string> = {};
      configs.forEach((c) => {
        initial[c.key] = c.value;
      });
      setEditedValues(initial);
      setHasChanges(false);
    }
  }, [configData]);

  const updateMutation = useMutation({
    mutationFn: async (changes: Record<string, string>) => {
      const promises = Object.entries(changes).map(([key, value]) =>
        configApi.update(key, value),
      );
      return Promise.all(promises);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['config'] });
      toast.success('Configuration mise a jour');
      setHasChanges(false);
    },
    onError: () => {
      toast.error('Erreur lors de la mise a jour');
    },
  });

  const handleChange = (key: string, value: string) => {
    setEditedValues((prev) => ({ ...prev, [key]: value }));
    setHasChanges(true);
  };

  const handleSave = () => {
    // Only send changed values
    const changed: Record<string, string> = {};
    configs.forEach((c) => {
      if (editedValues[c.key] !== c.value) {
        changed[c.key] = editedValues[c.key];
      }
    });

    // Also include new keys that exist in CONFIG_LABELS but not in configs
    Object.keys(CONFIG_LABELS).forEach((key) => {
      if (!configs.find((c) => c.key === key) && editedValues[key]) {
        changed[key] = editedValues[key];
      }
    });

    if (Object.keys(changed).length === 0) {
      toast.info('Aucune modification detectee');
      return;
    }

    updateMutation.mutate(changed);
  };

  if (isLoading) {
    return (
      <AppCard>
        <div className="animate-pulse space-y-4">
          {[1, 2, 3].map((i) => (
            <div key={i} className="h-11 bg-gray-100 rounded-xl" />
          ))}
        </div>
      </AppCard>
    );
  }

  // Build display: show known config keys + any extra from server
  const displayKeys = new Set([
    ...Object.keys(CONFIG_LABELS),
    ...configs.map((c) => c.key),
  ]);

  return (
    <AppCard>
      <AppCardHeader
        title="Configuration generale"
        description="Parametres systeme modifiables"
      />
      <div className="space-y-4">
        {Array.from(displayKeys).map((key) => (
          <AppInput
            key={key}
            label={CONFIG_LABELS[key] || key}
            type={key.includes('rate') || key.includes('days') || key.includes('divisor') ? 'number' : 'text'}
            value={editedValues[key] || ''}
            onChange={(e) => handleChange(key, e.target.value)}
          />
        ))}

        <div className="flex justify-end pt-2">
          <AppButton
            onClick={handleSave}
            loading={updateMutation.isPending}
            disabled={!hasChanges}
          >
            <Save className="h-4 w-4" />
            Enregistrer
          </AppButton>
        </div>
      </div>
    </AppCard>
  );
}

// ── Currencies Tab ─────────────────────────────────────────

function CurrenciesTab() {
  const queryClient = useQueryClient();
  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);

  const [formData, setFormData] = useState<CurrencyInput>({
    code: '',
    name: '',
    symbol: '',
    exchangeRate: 1,
    isBase: false,
  });

  const { data: currenciesData, isLoading } = useQuery({
    queryKey: ['currencies'],
    queryFn: () => currenciesApi.list(),
  });

  const currencies: any[] = currenciesData?.data || [];

  const createMutation = useMutation({
    mutationFn: (data: CurrencyInput) => currenciesApi.create(data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['currencies'] });
      toast.success('Devise creee');
      resetForm();
    },
    onError: () => toast.error('Erreur lors de la creation'),
  });

  const updateMutation = useMutation({
    mutationFn: ({ id, data }: { id: string; data: Partial<CurrencyInput> }) =>
      currenciesApi.update(id, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['currencies'] });
      toast.success('Devise mise a jour');
      resetForm();
    },
    onError: () => toast.error('Erreur lors de la mise a jour'),
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => currenciesApi.delete(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['currencies'] });
      toast.success('Devise supprimee');
    },
    onError: (err: any) => {
      const msg = err?.response?.data?.message || 'Erreur lors de la suppression';
      toast.error(msg);
    },
  });

  const resetForm = () => {
    setShowForm(false);
    setEditingId(null);
    setFormData({ code: '', name: '', symbol: '', exchangeRate: 1, isBase: false });
  };

  const handleEdit = (currency: any) => {
    setEditingId(currency.id);
    setFormData({
      code: currency.code,
      name: currency.name,
      symbol: currency.symbol,
      exchangeRate: currency.exchangeRate,
      isBase: currency.isBase,
    });
    setShowForm(true);
  };

  const handleSubmit = () => {
    if (!formData.code || !formData.name || !formData.symbol) {
      toast.error('Veuillez remplir tous les champs obligatoires');
      return;
    }

    if (editingId) {
      updateMutation.mutate({ id: editingId, data: formData });
    } else {
      createMutation.mutate(formData);
    }
  };

  const handleDelete = (id: string) => {
    if (confirm('Confirmer la suppression de cette devise ?')) {
      deleteMutation.mutate(id);
    }
  };

  const isSaving = createMutation.isPending || updateMutation.isPending;

  const columns = [
    { key: 'code', label: 'Code' },
    { key: 'name', label: 'Nom' },
    { key: 'symbol', label: 'Symbole' },
    {
      key: 'exchangeRate',
      label: 'Taux de change',
      render: (row: any) => row.exchangeRate,
    },
    {
      key: 'isBase',
      label: 'Base',
      render: (row: any) =>
        row.isBase ? (
          <AppBadge variant="success">Base</AppBadge>
        ) : (
          <AppBadge variant="outline">--</AppBadge>
        ),
    },
    {
      key: 'actions',
      label: '',
      render: (row: any) => (
        <div className="flex gap-1 justify-end">
          <AppButton
            size="sm"
            variant="ghost"
            onClick={(e) => {
              e.stopPropagation();
              handleEdit(row);
            }}
          >
            Modifier
          </AppButton>
          {!row.isBase && (
            <AppButton
              size="sm"
              variant="ghost"
              onClick={(e) => {
                e.stopPropagation();
                handleDelete(row.id);
              }}
            >
              <Trash2 className="h-3.5 w-3.5 text-red-500" />
            </AppButton>
          )}
        </div>
      ),
    },
  ];

  return (
    <div className="space-y-4">
      <AppCard>
        <AppCardHeader
          title="Devises"
          description="Gerez les devises et taux de change"
          action={
            !showForm ? (
              <AppButton size="sm" onClick={() => setShowForm(true)}>
                <Plus className="h-4 w-4" />
                Ajouter
              </AppButton>
            ) : undefined
          }
        />

        {showForm && (
          <div className="border border-gray-200 rounded-xl p-4 mb-4 space-y-3">
            <p className="text-sm font-medium text-gray-700">
              {editingId ? 'Modifier la devise' : 'Nouvelle devise'}
            </p>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
              <AppInput
                label="Code"
                placeholder="XAF"
                value={formData.code}
                onChange={(e) => setFormData({ ...formData, code: e.target.value.toUpperCase() })}
              />
              <AppInput
                label="Nom"
                placeholder="Franc CFA"
                value={formData.name}
                onChange={(e) => setFormData({ ...formData, name: e.target.value })}
              />
              <AppInput
                label="Symbole"
                placeholder="FCFA"
                value={formData.symbol}
                onChange={(e) => setFormData({ ...formData, symbol: e.target.value })}
              />
              <AppInput
                label="Taux de change"
                type="number"
                step="0.0001"
                value={formData.exchangeRate}
                onChange={(e) =>
                  setFormData({ ...formData, exchangeRate: parseFloat(e.target.value) || 0 })
                }
              />
            </div>
            <div className="flex items-center gap-3">
              <label className="flex items-center gap-2 text-sm text-gray-700 cursor-pointer">
                <input
                  type="checkbox"
                  checked={formData.isBase}
                  onChange={(e) => setFormData({ ...formData, isBase: e.target.checked })}
                  className="h-4 w-4 rounded text-primary-500"
                />
                Devise de base
              </label>
            </div>
            <div className="flex gap-2 pt-1">
              <AppButton onClick={handleSubmit} loading={isSaving}>
                <Save className="h-4 w-4" />
                {editingId ? 'Mettre a jour' : 'Creer'}
              </AppButton>
              <AppButton variant="outline" onClick={resetForm}>
                Annuler
              </AppButton>
            </div>
          </div>
        )}

        <AppDataTable
          columns={columns}
          data={currencies}
          isLoading={isLoading}
          emptyMessage="Aucune devise configuree"
        />
      </AppCard>
    </div>
  );
}
