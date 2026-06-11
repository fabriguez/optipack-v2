import { useEffect, useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Save } from 'lucide-react';
import { PageTransition } from '@/components/shared/PageTransition';
import { AppCard, AppCardHeader } from '@/components/ui/AppCard';
import { AppButton } from '@/components/ui/AppButton';
import { AppInput } from '@/components/ui/AppInput';
import { AppSwitch } from '@/components/ui/AppSwitch';
import { apiClient } from '@/lib/api/client';
import { toast } from 'sonner';

interface DebtBlockConfig {
  handoverEnabled: boolean;
  handoverThreshold: number;
  shipmentEnabled: boolean;
  shipmentThreshold: number;
}

export default function SettingsDebtBlockPage() {
  const qc = useQueryClient();
  const { data, isLoading } = useQuery({
    queryKey: ['config', 'debt-block'],
    queryFn: () => apiClient.get('/config/debt-block').then((r) => r.data),
  });
  const cfg: DebtBlockConfig | null = data?.data ?? null;

  const [form, setForm] = useState<DebtBlockConfig>({
    handoverEnabled: true,
    handoverThreshold: 0,
    shipmentEnabled: true,
    shipmentThreshold: 0,
  });

  useEffect(() => {
    if (cfg) setForm(cfg);
  }, [cfg]);

  const saveMutation = useMutation({
    mutationFn: (patch: Partial<DebtBlockConfig>) =>
      apiClient.patch('/config/debt-block', patch).then((r) => r.data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['config', 'debt-block'] });
      toast.success('Configuration enregistree');
    },
    onError: (e: any) => toast.error(e?.response?.data?.message || 'Echec sauvegarde'),
  });

  return (
    <PageTransition>
      <div className="space-y-5 max-w-3xl">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Blocage automatique sur dettes</h1>
          <p className="text-sm text-gray-500 mt-1">
            Empeche la remise de colis et la creation de nouvelles expeditions
            quand un client a un cumul de dettes au-dessus du seuil. Les
            valeurs par defaut sont actives, seuil 0 (toute dette active
            bloque). Mettez un seuil &gt; 0 pour tolerer des petits soldes.
          </p>
        </div>

        <AppCard>
          <AppCardHeader title="Remise de colis (handover)" />
          <div className="space-y-4">
            <label className="flex items-center justify-between gap-3 rounded-xl bg-gray-50 p-3">
              <div>
                <p className="text-sm font-medium text-gray-900">Activer le blocage a la remise</p>
                <p className="text-xs text-gray-500 mt-0.5">
                  Refuse la remise d&apos;un colis au client si son cumul de dettes &gt; seuil.
                </p>
              </div>
              <AppSwitch
                checked={form.handoverEnabled}
                onCheckedChange={(v) => setForm((f) => ({ ...f, handoverEnabled: !!v }))}
              />
            </label>
            <AppInput
              label="Seuil de cumul dettes (FCFA)"
              type="number"
              min={0}
              value={String(form.handoverThreshold)}
              onChange={(e) => setForm((f) => ({ ...f, handoverThreshold: Number(e.target.value) || 0 }))}
              disabled={!form.handoverEnabled}
            />
          </div>
        </AppCard>

        <AppCard>
          <AppCardHeader title="Nouvelle expedition (creation colis)" />
          <div className="space-y-4">
            <label className="flex items-center justify-between gap-3 rounded-xl bg-gray-50 p-3">
              <div>
                <p className="text-sm font-medium text-gray-900">Activer le blocage a la creation</p>
                <p className="text-xs text-gray-500 mt-0.5">
                  Refuse la creation d&apos;un nouveau colis pour un client endette au-dela du plafond.
                </p>
              </div>
              <AppSwitch
                checked={form.shipmentEnabled}
                onCheckedChange={(v) => setForm((f) => ({ ...f, shipmentEnabled: !!v }))}
              />
            </label>
            <AppInput
              label="Plafond cumul dettes (FCFA)"
              type="number"
              min={0}
              value={String(form.shipmentThreshold)}
              onChange={(e) => setForm((f) => ({ ...f, shipmentThreshold: Number(e.target.value) || 0 }))}
              disabled={!form.shipmentEnabled}
            />
          </div>
        </AppCard>

        <div className="flex justify-end">
          <AppButton
            onClick={() => saveMutation.mutate(form)}
            loading={saveMutation.isPending || isLoading}
            disabled={!cfg}
          >
            <Save className="h-4 w-4" />
            Enregistrer
          </AppButton>
        </div>
      </div>
    </PageTransition>
  );
}
