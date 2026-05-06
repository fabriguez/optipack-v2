'use client';

import { useEffect, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { apiClient } from '@/lib/api/client';
import { AppCard } from '@/components/ui/AppCard';
import { AppButton } from '@/components/ui/AppButton';
import { AppInput } from '@/components/ui/AppInput';
import { AppSelect } from '@/components/ui/AppSelect';
import { Plus, Save, Trash2 } from 'lucide-react';
import { toast } from 'sonner';

interface Criterion {
  key: string;
  label: string;
  max: number;
}

const CADENCE_OPTIONS = [
  { value: 'MONTHLY', label: 'Mensuelle' },
  { value: 'QUARTERLY', label: 'Trimestrielle' },
  { value: 'YEARLY', label: 'Annuelle' },
];

export function AgencyReviewConfigTab({ agencyId }: { agencyId: string }) {
  const qc = useQueryClient();
  const [criteria, setCriteria] = useState<Criterion[]>([]);
  const [cadence, setCadence] = useState<string>('QUARTERLY');
  const [saving, setSaving] = useState(false);

  const { data, isLoading } = useQuery({
    queryKey: ['agency-review-config', agencyId],
    queryFn: () =>
      apiClient.get(`/employees/agency/${agencyId}/review-config`).then((r) => r.data),
    enabled: !!agencyId,
  });

  useEffect(() => {
    const cfg = data?.data;
    if (cfg) {
      setCriteria(Array.isArray(cfg.criteria) ? cfg.criteria : []);
      setCadence(cfg.cadence ?? 'QUARTERLY');
    } else {
      setCriteria([]);
      setCadence('QUARTERLY');
    }
  }, [data]);

  const onSave = async () => {
    setSaving(true);
    try {
      await apiClient.put(`/employees/agency/${agencyId}/review-config`, {
        criteria,
        cadence,
      });
      toast.success('Grille enregistree');
      qc.invalidateQueries({ queryKey: ['agency-review-config', agencyId] });
    } catch (e: any) {
      toast.error(e?.response?.data?.message || 'Erreur');
    } finally {
      setSaving(false);
    }
  };

  const updateCrit = (i: number, patch: Partial<Criterion>) =>
    setCriteria((prev) => prev.map((c, idx) => (idx === i ? { ...c, ...patch } : c)));

  if (isLoading) return <p className="text-sm text-gray-400">Chargement...</p>;

  return (
    <AppCard>
      <h3 className="mb-1 text-base font-semibold">Grille d&apos;evaluation</h3>
      <p className="mb-4 text-xs text-gray-500">
        Definissez les criteres (cles unique, libelle, note max) utilises pour evaluer le personnel de cette agence.
      </p>

      <div className="mb-4 max-w-xs">
        <AppSelect label="Cadence" options={CADENCE_OPTIONS} value={cadence} onValueChange={setCadence} />
      </div>

      <div className="space-y-2">
        {criteria.length === 0 && (
          <p className="rounded-xl bg-gray-50 p-4 text-center text-sm text-gray-400">
            Aucun critere defini. Ajoutez-en un ci-dessous.
          </p>
        )}
        {criteria.map((c, i) => (
          <div key={i} className="grid grid-cols-1 items-end gap-2 rounded-xl border border-gray-100 p-2 sm:grid-cols-12">
            <div className="sm:col-span-3">
              <AppInput
                label="Cle"
                placeholder="ponctualite"
                value={c.key}
                onChange={(e) => updateCrit(i, { key: e.target.value.replace(/\s/g, '_') })}
              />
            </div>
            <div className="sm:col-span-6">
              <AppInput
                label="Libelle"
                placeholder="Ponctualite"
                value={c.label}
                onChange={(e) => updateCrit(i, { label: e.target.value })}
              />
            </div>
            <div className="sm:col-span-2">
              <AppInput
                label="Note max"
                type="number"
                min={1}
                value={String(c.max)}
                onChange={(e) => updateCrit(i, { max: Number(e.target.value) })}
              />
            </div>
            <div className="sm:col-span-1 flex justify-end">
              <button
                type="button"
                onClick={() => setCriteria((prev) => prev.filter((_, idx) => idx !== i))}
                className="rounded-lg p-2 text-red-500 hover:bg-red-50"
                aria-label="Supprimer"
              >
                <Trash2 className="h-4 w-4" />
              </button>
            </div>
          </div>
        ))}
      </div>

      <div className="mt-3 flex items-center justify-between">
        <AppButton
          variant="outline"
          size="sm"
          onClick={() =>
            setCriteria((prev) => [...prev, { key: `critere_${prev.length + 1}`, label: '', max: 20 }])
          }
        >
          <Plus className="h-3.5 w-3.5" />
          Ajouter un critere
        </AppButton>
        <AppButton onClick={onSave} loading={saving}>
          <Save className="h-4 w-4" />
          Enregistrer
        </AppButton>
      </div>
    </AppCard>
  );
}
