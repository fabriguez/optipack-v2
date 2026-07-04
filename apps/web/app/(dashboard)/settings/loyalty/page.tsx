'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { ArrowLeft, Plus, Save, Trash2 } from 'lucide-react';
import { PageTransition } from '@/components/shared/PageTransition';
import { AppCard } from '@/components/ui/AppCard';
import { AppButton } from '@/components/ui/AppButton';
import { AppInput } from '@/components/ui/AppInput';
import { apiClient } from '@/lib/api/client';
import { toast } from 'sonner';

interface Tier {
  id?: string;
  name: string;
  minPoints: number;
  discountPercent: number;
  benefits?: Record<string, any> | null;
  benefitsText?: string;
}

const DEFAULT_TIERS: Tier[] = [
  { name: 'Standard', minPoints: 0, discountPercent: 0, benefitsText: '' },
  { name: 'Silver', minPoints: 500, discountPercent: 5, benefitsText: 'Priorite traitement' },
  { name: 'Gold', minPoints: 2000, discountPercent: 10, benefitsText: 'Priorite + assurance offerte' },
  { name: 'Platinum', minPoints: 5000, discountPercent: 15, benefitsText: 'Tous avantages + manager dedie' },
];

export default function LoyaltyConfigPage() {
  const qc = useQueryClient();
  const [tiers, setTiers] = useState<Tier[]>([]);
  const [saving, setSaving] = useState(false);

  const { data, isLoading } = useQuery({
    queryKey: ['loyalty', 'tiers'],
    queryFn: () => apiClient.get('/loyalty/tiers').then((r) => r.data),
  });

  useEffect(() => {
    const items = (data?.data ?? []) as Tier[];
    if (!items.length) {
      setTiers(DEFAULT_TIERS);
    } else {
      setTiers(
        items.map((t) => ({
          ...t,
          minPoints: Number(t.minPoints),
          discountPercent: Number(t.discountPercent),
          benefitsText:
            t.benefits && typeof t.benefits === 'object' && 'description' in (t.benefits as any)
              ? String((t.benefits as any).description ?? '')
              : '',
        })),
      );
    }
  }, [data]);

  const updateTier = (i: number, patch: Partial<Tier>) =>
    setTiers((prev) => prev.map((t, idx) => (idx === i ? { ...t, ...patch } : t)));

  const onSave = async () => {
    setSaving(true);
    try {
      const payload = tiers.map((t) => ({
        id: t.id,
        name: t.name.trim(),
        minPoints: Number(t.minPoints) || 0,
        discountPercent: Number(t.discountPercent) || 0,
        benefits: t.benefitsText?.trim() ? { description: t.benefitsText.trim() } : null,
      }));
      await apiClient.put('/loyalty/tiers', { tiers: payload });
      toast.success('Tiers enregistres');
      qc.invalidateQueries({ queryKey: ['loyalty', 'tiers'] });
    } catch (e: any) {
      toast.error(e?.response?.data?.message || 'Erreur');
    } finally {
      setSaving(false);
    }
  };

  return (
    <PageTransition>
      <div className="space-y-5">
        <div className="flex items-center gap-3">
          <Link href="/settings" className="rounded-xl p-2 hover:bg-gray-100">
            <ArrowLeft className="h-5 w-5 text-gray-500" />
          </Link>
          <div>
            <h1 className="text-2xl font-bold text-gray-900">Programme de fidelite</h1>
            <p className="text-sm text-gray-500 mt-0.5">
              Configurez les paliers de fidelite et leurs avantages.
            </p>
          </div>
        </div>

        <AppCard>
          {isLoading ? (
            <p className="text-sm text-gray-400">Chargement...</p>
          ) : (
            <div className="space-y-3">
              {tiers.map((t, i) => (
                <div
                  key={t.id ?? `tmp-${i}`}
                  className="grid grid-cols-1 items-end gap-3 rounded-2xl border border-gray-100 p-3 sm:grid-cols-12"
                >
                  <div className="sm:col-span-3">
                    <AppInput
                      label="Nom du palier"
                      placeholder="Silver"
                      value={t.name}
                      onChange={(e) => updateTier(i, { name: e.target.value })}
                    />
                  </div>
                  <div className="sm:col-span-2">
                    <AppInput
                      label="Points min."
                      type="number"
                      min={0}
                      value={String(t.minPoints)}
                      onChange={(e) => updateTier(i, { minPoints: Number(e.target.value) })}
                    />
                  </div>
                  <div className="sm:col-span-2">
                    <AppInput
                      label="Reduction (%)"
                      type="number"
                      min={0}
                      max={100}
                      step="0.0001"
                      value={String(t.discountPercent)}
                      onChange={(e) => updateTier(i, { discountPercent: Number(e.target.value) })}
                    />
                  </div>
                  <div className="sm:col-span-4">
                    <AppInput
                      label="Avantages (description libre)"
                      placeholder="Priorite, assurance, ..."
                      value={t.benefitsText ?? ''}
                      onChange={(e) => updateTier(i, { benefitsText: e.target.value })}
                    />
                  </div>
                  <div className="sm:col-span-1 flex justify-end">
                    <button
                      type="button"
                      onClick={() => setTiers((prev) => prev.filter((_, idx) => idx !== i))}
                      className="rounded-lg p-2 text-red-500 hover:bg-red-50"
                      aria-label="Supprimer"
                    >
                      <Trash2 className="h-4 w-4" />
                    </button>
                  </div>
                </div>
              ))}

              <div className="flex flex-wrap items-center justify-between gap-3 pt-2">
                <AppButton
                  variant="outline"
                  size="sm"
                  onClick={() =>
                    setTiers((prev) => [
                      ...prev,
                      { name: '', minPoints: 0, discountPercent: 0, benefitsText: '' },
                    ])
                  }
                >
                  <Plus className="h-3.5 w-3.5" />
                  Ajouter un palier
                </AppButton>
                <AppButton onClick={onSave} loading={saving}>
                  <Save className="h-4 w-4" />
                  Enregistrer
                </AppButton>
              </div>
            </div>
          )}
        </AppCard>
      </div>
    </PageTransition>
  );
}
