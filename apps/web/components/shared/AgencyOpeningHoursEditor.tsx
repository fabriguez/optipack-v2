'use client';

import { useEffect, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { apiClient } from '@/lib/api/client';
import { AppButton } from '@/components/ui/AppButton';
import { AppCheckbox } from '@/components/ui/AppCheckbox';
import { AppInput } from '@/components/ui/AppInput';
import { Save } from 'lucide-react';
import { toast } from 'sonner';

const DAYS = [
  { value: 1, label: 'Lundi' },
  { value: 2, label: 'Mardi' },
  { value: 3, label: 'Mercredi' },
  { value: 4, label: 'Jeudi' },
  { value: 5, label: 'Vendredi' },
  { value: 6, label: 'Samedi' },
  { value: 0, label: 'Dimanche' },
];

interface DayConfig {
  dayOfWeek: number;
  isOpen: boolean;
  openTime: string;
  closeTime: string;
}

const DEFAULT_DAYS: DayConfig[] = DAYS.map((d) => ({
  dayOfWeek: d.value,
  isOpen: d.value !== 0, // dimanche ferme par defaut
  openTime: '08:00',
  closeTime: '18:00',
}));

interface Props {
  agencyId: string;
}

export function AgencyOpeningHoursEditor({ agencyId }: Props) {
  const qc = useQueryClient();
  const [days, setDays] = useState<DayConfig[]>(DEFAULT_DAYS);
  const [saving, setSaving] = useState(false);

  const { data, isLoading } = useQuery({
    queryKey: ['agencies', agencyId, 'opening-hours'],
    queryFn: () => apiClient.get(`/agencies/${agencyId}/opening-hours`).then((r) => r.data),
    enabled: !!agencyId,
  });

  useEffect(() => {
    const items = (data?.data ?? []) as DayConfig[];
    if (!items.length) {
      setDays(DEFAULT_DAYS);
      return;
    }
    // Une seule plage par jour cote UI : si plusieurs lignes existent on prend la premiere.
    const byDay = new Map<number, DayConfig>();
    for (const it of items) {
      if (!byDay.has(it.dayOfWeek)) byDay.set(it.dayOfWeek, it);
    }
    setDays(
      DAYS.map((d) =>
        byDay.get(d.value) ?? {
          dayOfWeek: d.value,
          isOpen: false,
          openTime: '08:00',
          closeTime: '18:00',
        },
      ),
    );
  }, [data]);

  const updateDay = (dow: number, patch: Partial<DayConfig>) => {
    setDays((prev) => prev.map((d) => (d.dayOfWeek === dow ? { ...d, ...patch } : d)));
  };

  const onSave = async () => {
    setSaving(true);
    try {
      await apiClient.put(`/agencies/${agencyId}/opening-hours`, { hours: days });
      toast.success('Horaires enregistres');
      qc.invalidateQueries({ queryKey: ['agencies', agencyId, 'opening-hours'] });
    } catch (e: any) {
      toast.error(e?.response?.data?.message || 'Erreur lors de la sauvegarde');
    } finally {
      setSaving(false);
    }
  };

  if (isLoading) return <p className="text-sm text-gray-400">Chargement des horaires...</p>;

  return (
    <div className="space-y-3">
      <div className="rounded-2xl border border-gray-100 bg-white p-3">
        {DAYS.map((d) => {
          const cfg = days.find((x) => x.dayOfWeek === d.value)!;
          return (
            <div key={d.value} className="flex flex-wrap items-center gap-3 border-b border-gray-50 py-2 last:border-b-0">
              <label className="flex w-32 items-center gap-2 text-sm">
                <AppCheckbox
                  checked={cfg.isOpen}
                  onCheckedChange={(v) => updateDay(d.value, { isOpen: !!v })}
                />
                <span className={cfg.isOpen ? 'font-medium text-gray-900' : 'text-gray-400'}>{d.label}</span>
              </label>
              {cfg.isOpen ? (
                <div className="flex items-center gap-2">
                  <AppInput
                    type="time"
                    value={cfg.openTime}
                    onChange={(e) => updateDay(d.value, { openTime: e.target.value })}
                    className="w-32"
                  />
                  <span className="text-gray-400">a</span>
                  <AppInput
                    type="time"
                    value={cfg.closeTime}
                    onChange={(e) => updateDay(d.value, { closeTime: e.target.value })}
                    className="w-32"
                  />
                </div>
              ) : (
                <span className="text-xs text-gray-400">Ferme</span>
              )}
            </div>
          );
        })}
      </div>
      <div className="flex items-center justify-between">
        <p className="text-xs text-gray-500">
          La caisse se cloture automatiquement apres l&apos;heure de fermeture la plus tardive du jour.
        </p>
        <AppButton onClick={onSave} loading={saving}>
          <Save className="h-4 w-4" />
          Enregistrer
        </AppButton>
      </div>
    </div>
  );
}
