import { useEffect, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { apiClient } from '@/lib/api/client';
import { AppCard } from '@/components/ui/AppCard';
import { AppButton } from '@/components/ui/AppButton';
import { AppInput } from '@/components/ui/AppInput';
import { AppSelect } from '@/components/ui/AppSelect';
import { Plus, Save, Trash2, Wand2, Lock } from 'lucide-react';
import { toast } from 'sonner';
import { AUTO_CRITERIA, AUTO_CRITERIA_BY_KEY, type Criterion } from '@/lib/reviews/autoCriteria';

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
  const [autoPick, setAutoPick] = useState<string>('');

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

  const addAutoCriterion = (autoKey: string) => {
    const def = AUTO_CRITERIA_BY_KEY[autoKey];
    if (!def) return;
    if (criteria.some((c) => c.auto && c.autoKey === autoKey)) {
      toast.info('Ce critere auto est deja dans la grille.');
      return;
    }
    setCriteria((prev) => [...prev, {
      key: def.key,
      label: def.label,
      max: def.defaultMax,
      auto: true,
      autoKey: def.key,
    }]);
    setAutoPick('');
  };

  // Filtre catalogue : exclut deja ajoutes pour eviter doublons.
  const usedAutoKeys = new Set(criteria.filter((c) => c.auto).map((c) => c.autoKey));
  const autoOptions = [
    { value: '', label: '-- Choisir un critere auto --' },
    ...AUTO_CRITERIA.filter((c) => !usedAutoKeys.has(c.key)).map((c) => ({
      value: c.key,
      label: `${c.label} (${c.unit})`,
    })),
  ];

  if (isLoading) return <p className="text-sm text-gray-400">Chargement...</p>;

  return (
    <div className="space-y-4">
      <AppCard>
        <h3 className="mb-1 text-base font-semibold">Grille d&apos;evaluation</h3>
        <p className="mb-4 text-xs text-gray-500">
          Definissez les criteres (libelle + note max) utilises pour evaluer le personnel de cette agence.
          Vous pouvez ajouter des criteres <strong>manuels</strong> (note saisie par l&apos;evaluateur) ou
          <strong> auto-calcules</strong> depuis les pointages / sanctions de la periode.
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
            <div
              key={i}
              className={`grid grid-cols-1 items-end gap-2 rounded-xl border p-2 sm:grid-cols-12 ${
                c.auto ? 'border-primary-200 bg-primary-50/30' : 'border-gray-100'
              }`}
            >
              <div className="sm:col-span-3">
                <AppInput
                  label={c.auto ? 'Cle (auto)' : 'Cle'}
                  placeholder="ponctualite"
                  value={c.key}
                  onChange={(e) => updateCrit(i, { key: e.target.value.replace(/\s/g, '_') })}
                  disabled={c.auto}
                />
              </div>
              <div className="sm:col-span-6">
                <AppInput
                  label={c.auto ? 'Libelle (auto-calcule)' : 'Libelle'}
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
              {c.auto && c.autoKey && AUTO_CRITERIA_BY_KEY[c.autoKey] && (
                <p className="sm:col-span-12 mt-1 inline-flex items-start gap-1 text-[11px] text-primary-800">
                  <Lock className="mt-0.5 h-3 w-3 shrink-0" />
                  Calcul auto : {AUTO_CRITERIA_BY_KEY[c.autoKey].description}
                </p>
              )}
            </div>
          ))}
        </div>

        <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-2">
          <div className="rounded-xl border border-gray-100 p-3">
            <p className="mb-2 text-xs font-semibold text-gray-700">Ajouter un critere manuel</p>
            <AppButton
              variant="outline"
              size="sm"
              onClick={() =>
                setCriteria((prev) => [...prev, { key: `critere_${prev.length + 1}`, label: '', max: 20 }])
              }
            >
              <Plus className="h-3.5 w-3.5" />
              Ajouter manuel
            </AppButton>
          </div>
          <div className="rounded-xl border border-primary-100 bg-primary-50/30 p-3">
            <p className="mb-2 inline-flex items-center gap-1 text-xs font-semibold text-primary-900">
              <Wand2 className="h-3 w-3" />
              Ajouter un critere auto-calcule
            </p>
            <div className="flex items-end gap-2">
              <div className="flex-1">
                <AppSelect
                  options={autoOptions}
                  value={autoPick}
                  onValueChange={(v) => { setAutoPick(v); if (v) addAutoCriterion(v); }}
                />
              </div>
            </div>
            <p className="mt-2 text-[11px] text-gray-500">
              Valeurs recuperees automatiquement depuis les pointages / sanctions de la periode au moment de l&apos;evaluation.
            </p>
          </div>
        </div>

        <div className="mt-4 flex justify-end">
          <AppButton onClick={onSave} loading={saving}>
            <Save className="h-4 w-4" />
            Enregistrer
          </AppButton>
        </div>
      </AppCard>
    </div>
  );
}
