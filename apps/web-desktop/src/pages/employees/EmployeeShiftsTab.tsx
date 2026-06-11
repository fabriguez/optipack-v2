import { useEffect, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { apiClient } from '@/lib/api/client';
import { AppCard } from '@/components/ui/AppCard';
import { AppButton } from '@/components/ui/AppButton';
import { AppCheckbox } from '@/components/ui/AppCheckbox';
import { AppInput } from '@/components/ui/AppInput';
import { AppTimePicker } from '@/components/ui/AppTimePicker';
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

interface ShiftConfig {
  dayOfWeek: number;
  isWorking: boolean;
  startTime: string;
  endTime: string;
}

const DEFAULTS: ShiftConfig[] = DAYS.map((d) => ({
  dayOfWeek: d.value,
  isWorking: d.value !== 0,
  startTime: '08:00',
  endTime: '18:00',
}));

export function EmployeeShiftsTab({ employeeId }: { employeeId: string }) {
  const qc = useQueryClient();
  const [shifts, setShifts] = useState<ShiftConfig[]>(DEFAULTS);
  const [saving, setSaving] = useState(false);

  const { data, isLoading } = useQuery({
    queryKey: ['employees', employeeId, 'shifts'],
    queryFn: () => apiClient.get(`/employees/${employeeId}/shifts`).then((r) => r.data),
    enabled: !!employeeId,
  });

  useEffect(() => {
    const items = (data?.data ?? []) as ShiftConfig[];
    if (!items.length) {
      setShifts(DEFAULTS);
      return;
    }
    const byDay = new Map<number, ShiftConfig>();
    for (const it of items) if (!byDay.has(it.dayOfWeek)) byDay.set(it.dayOfWeek, it);
    setShifts(
      DAYS.map(
        (d) =>
          byDay.get(d.value) ?? {
            dayOfWeek: d.value,
            isWorking: false,
            startTime: '08:00',
            endTime: '18:00',
          },
      ),
    );
  }, [data]);

  const updateDay = (dow: number, patch: Partial<ShiftConfig>) =>
    setShifts((prev) => prev.map((s) => (s.dayOfWeek === dow ? { ...s, ...patch } : s)));

  const onSave = async () => {
    setSaving(true);
    try {
      await apiClient.put(`/employees/${employeeId}/shifts`, { shifts });
      toast.success('Planning enregistre');
      qc.invalidateQueries({ queryKey: ['employees', employeeId, 'shifts'] });
    } catch (e: any) {
      toast.error(e?.response?.data?.message || 'Erreur');
    } finally {
      setSaving(false);
    }
  };

  if (isLoading) return <p className="text-sm text-gray-400">Chargement...</p>;

  return (
    <AppCard>
      <h3 className="mb-3 text-base font-semibold">Planning hebdomadaire</h3>
      <p className="mb-3 text-xs text-gray-500">
        Surcharge les horaires d&apos;ouverture de l&apos;agence pour cet employe (rotation, mi-temps, jour de repos).
      </p>
      {DAYS.map((d) => {
        const cfg = shifts.find((s) => s.dayOfWeek === d.value)!;
        return (
          <div key={d.value} className="flex flex-wrap items-center gap-3 border-b border-gray-50 py-2 last:border-b-0">
            <label className="flex w-32 items-center gap-2 text-sm">
              <AppCheckbox checked={cfg.isWorking} onCheckedChange={(v) => updateDay(d.value, { isWorking: !!v })} />
              <span className={cfg.isWorking ? 'font-medium' : 'text-gray-400'}>{d.label}</span>
            </label>
            {cfg.isWorking ? (
              <div className="flex items-center gap-2">
                <AppTimePicker
                  value={cfg.startTime}
                  onChange={(v) => updateDay(d.value, { startTime: v })}
                />
                <span className="text-gray-400">a</span>
                <AppTimePicker
                  value={cfg.endTime}
                  onChange={(v) => updateDay(d.value, { endTime: v })}
                />
              </div>
            ) : (
              <span className="text-xs text-gray-400">Repos</span>
            )}
          </div>
        );
      })}
      <div className="mt-3 flex justify-end">
        <AppButton onClick={onSave} loading={saving}>
          <Save className="h-4 w-4" />
          Enregistrer
        </AppButton>
      </div>
    </AppCard>
  );
}
