import { useEffect, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { apiClient } from '@/lib/api/client';
import { AppCard } from '@/components/ui/AppCard';
import { AppButton } from '@/components/ui/AppButton';
import { AppInput } from '@/components/ui/AppInput';
import { DateRangePicker, type DateRange } from '@/components/ui/DateRangePicker';
import { Can } from '@/lib/components/Can';
import { Wand2 } from 'lucide-react';
import { formatDate } from '@transitsoftservices/shared';
import { toast } from 'sonner';
import { AUTO_CRITERIA_BY_KEY, type AttendanceStatsLike, type Criterion } from '@/lib/reviews/autoCriteria';

type AttendanceStats = AttendanceStatsLike & {
  from: string;
  to: string;
  totalDays: number;
};

/** Defaut : mois courant. */
function defaultRange(): DateRange {
  const today = new Date();
  const y = today.getFullYear();
  const m = today.getMonth() + 1;
  const last = new Date(y, m, 0).getDate();
  const pad = (n: number) => String(n).padStart(2, '0');
  return { from: `${y}-${pad(m)}-01`, to: `${y}-${pad(m)}-${pad(last)}` };
}

export function EmployeeReviewsTab({ employeeId, agencyId }: { employeeId: string; agencyId?: string }) {
  const qc = useQueryClient();
  const [range, setRange] = useState<DateRange>(defaultRange);
  const [summary, setSummary] = useState('');
  // Notes manuelles : Record<critereKey, number>
  const [manualScores, setManualScores] = useState<Record<string, string>>({});

  // Libelle period stocke = "YYYY-MM-DD -> YYYY-MM-DD" (libellement libre cote
  // backend, voir EmployeeReview.period). Vide si dates incompletes.
  const period = range.from && range.to ? `${range.from} -> ${range.to}` : '';
  const rangeReady = Boolean(range.from && range.to);

  const { data: cfgData } = useQuery({
    queryKey: ['agency-review-config', agencyId],
    queryFn: () => apiClient.get(`/employees/agency/${agencyId}/review-config`).then((r) => r.data),
    enabled: !!agencyId,
  });
  const grid: Criterion[] = Array.isArray(cfgData?.data?.criteria) ? cfgData.data.criteria : [];

  const { data: statsData } = useQuery({
    queryKey: ['employees', employeeId, 'attendance', 'stats', range.from, range.to],
    queryFn: () =>
      apiClient
        .get(`/employees/${employeeId}/attendance/stats`, { params: { from: range.from, to: range.to } })
        .then((r) => r.data),
    enabled: !!employeeId && rangeReady,
  });
  const stats: AttendanceStats | undefined = statsData?.data;

  const { data: sanctionsData } = useQuery({
    queryKey: ['employees', employeeId, 'sanctions'],
    queryFn: () => apiClient.get(`/employees/${employeeId}/sanctions`).then((r) => r.data),
    enabled: !!employeeId,
  });
  // Filtre sanctions sur intervalle [from, to].
  const sanctionsInRange: any[] = (sanctionsData?.data ?? []).filter((s: any) => {
    const d = new Date(s.createdAt).toISOString().slice(0, 10);
    return d >= range.from && d <= range.to;
  });
  const extraStats = { sanctionsCount: sanctionsInRange.length };

  const { data } = useQuery({
    queryKey: ['employees', employeeId, 'reviews'],
    queryFn: () => apiClient.get(`/employees/${employeeId}/reviews`).then((r) => r.data),
    enabled: !!employeeId,
  });
  const items: any[] = data?.data ?? [];

  // Reset manual scores quand la grille change.
  useEffect(() => {
    setManualScores({});
  }, [cfgData]);

  // Calcul des valeurs auto pour chaque critere auto de la grille.
  const autoValues: Record<string, number> = {};
  if (stats) {
    for (const c of grid) {
      if (c.auto && c.autoKey) {
        const def = AUTO_CRITERIA_BY_KEY[c.autoKey];
        if (def) autoValues[c.key] = def.compute(stats, extraStats);
      }
    }
  }

  // Score total = somme(notes/maxNote) ramene sur 100. Auto values sont
  // normalises selon higherIsBetter.
  const totalScore = grid.length > 0
    ? Math.round(
        grid.reduce((sum, c) => {
          let pct = 0;
          if (c.auto && c.autoKey) {
            const def = AUTO_CRITERIA_BY_KEY[c.autoKey];
            const v = autoValues[c.key] ?? 0;
            if (def) {
              const ratio = Math.min(1, Math.max(0, v / Math.max(1, c.max)));
              pct = def.higherIsBetter ? ratio : 1 - ratio;
            }
          } else {
            const raw = Number(manualScores[c.key] ?? 0);
            pct = Math.min(1, Math.max(0, raw / Math.max(1, c.max)));
          }
          return sum + pct;
        }, 0) / grid.length * 100,
      )
    : 0;

  const mutation = useMutation({
    mutationFn: () =>
      apiClient.post(`/employees/${employeeId}/reviews`, {
        period,
        score: grid.length > 0 ? totalScore : undefined,
        summary: summary || undefined,
        criteria: {
          // Snapshot complet : definitions + valeurs (manuel et auto) +
          // intervalle utilise. Tout est fige pour l'historique.
          grid,
          range,
          manualScores: Object.fromEntries(
            Object.entries(manualScores).map(([k, v]) => [k, Number(v) || 0]),
          ),
          autoValues,
          totalScore: grid.length > 0 ? totalScore : null,
          punctuality: stats
            ? {
                from: stats.from,
                to: stats.to,
                presentDays: stats.presentDays,
                lateDays: stats.lateDays,
                absentDays: stats.absentDays,
                onLeaveDays: stats.onLeaveDays,
                totalLateMinutes: stats.totalLateMinutes,
                totalEarlyDepartureMinutes: stats.totalEarlyDepartureMinutes,
                totalOvertimeMinutes: stats.totalOvertimeMinutes,
                totalUndertimeMinutes: stats.totalUndertimeMinutes,
                attendanceRate: stats.attendanceRate,
              }
            : undefined,
          sanctionsCount: extraStats.sanctionsCount,
        },
      }),
    onSuccess: () => {
      toast.success('Evaluation enregistree');
      setRange(defaultRange());
      setSummary('');
      setManualScores({});
      qc.invalidateQueries({ queryKey: ['employees', employeeId, 'reviews'] });
    },
    onError: (e: any) => toast.error(e?.response?.data?.message || 'Erreur'),
  });

  return (
    <div className="space-y-4">
      {/* POST /employees/:id/reviews exige review.manage */}
      <Can permission="review.manage">
      <AppCard>
        <h3 className="mb-3 text-base font-semibold">Nouvelle evaluation</h3>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <DateRangePicker label="Periode evaluee" value={range} onChange={setRange} required />
          <AppInput label="Synthese" value={summary} onChange={(e) => setSummary(e.target.value)} />
        </div>

        {grid.length === 0 ? (
          <p className="mt-4 rounded-xl bg-amber-50 p-3 text-xs text-amber-800">
            Aucune grille d&apos;evaluation definie pour l&apos;agence. Configurez-la dans l&apos;onglet
            "Config evaluations" de l&apos;agence pour structurer les criteres.
          </p>
        ) : (
          <div className="mt-4 space-y-2">
            <div className="flex items-center justify-between">
              <p className="text-xs font-semibold text-gray-700">Grille d&apos;agence ({grid.length} critere{grid.length > 1 ? 's' : ''})</p>
              <p className="text-xs text-gray-500">Score total : <span className="font-bold text-primary-700">{totalScore}/100</span></p>
            </div>
            {grid.map((c) => {
              const def = c.auto && c.autoKey ? AUTO_CRITERIA_BY_KEY[c.autoKey] : null;
              const autoVal = autoValues[c.key];
              return (
                <div
                  key={c.key}
                  className={`grid grid-cols-1 items-center gap-2 rounded-xl border p-2 text-sm sm:grid-cols-12 ${
                    c.auto ? 'border-primary-100 bg-primary-50/30' : 'border-gray-100'
                  }`}
                >
                  <div className="sm:col-span-6">
                    <p className="font-medium text-gray-800">
                      {c.auto && <Wand2 className="mr-1 inline h-3 w-3 text-primary-600" />}
                      {c.label || c.key}
                    </p>
                    {def && (
                      <p className="text-[11px] text-gray-500">
                        Auto : {def.description}
                        {def.higherIsBetter ? ' (plus haut = mieux)' : ' (plus bas = mieux)'}
                      </p>
                    )}
                  </div>
                  <div className="sm:col-span-3">
                    {c.auto ? (
                      <div className="rounded-lg bg-white px-3 py-2 text-center">
                        <p className="text-[10px] uppercase tracking-wider text-gray-400">Valeur auto</p>
                        <p className="font-mono text-base font-bold text-primary-700">
                          {autoVal ?? '-'}{def ? ` ${def.unit === 'count' ? '' : def.unit}` : ''}
                        </p>
                      </div>
                    ) : (
                      <AppInput
                        label={`Note (max ${c.max})`}
                        type="number"
                        min={0}
                        max={c.max}
                        value={manualScores[c.key] ?? ''}
                        onChange={(e) => setManualScores((p) => ({ ...p, [c.key]: e.target.value }))}
                      />
                    )}
                  </div>
                  <div className="sm:col-span-3 text-right text-xs text-gray-500">
                    Max : <span className="font-mono">{c.max}</span>
                  </div>
                </div>
              );
            })}
          </div>
        )}

        <div className="mt-4 flex justify-end">
          <AppButton onClick={() => mutation.mutate()} loading={mutation.isPending} disabled={!rangeReady}>
            Enregistrer
          </AppButton>
        </div>
      </AppCard>
      </Can>

      <AppCard>
        <h3 className="mb-3 text-base font-semibold">Historique</h3>
        {items.length === 0 ? (
          <p className="py-6 text-center text-sm text-gray-400">Aucune evaluation.</p>
        ) : (
          <ul className="divide-y divide-gray-100">
            {items.map((r) => {
              const c = r.criteria || {};
              const p = c.punctuality;
              const histGrid: Criterion[] = Array.isArray(c.grid) ? c.grid : [];
              return (
                <li key={r.id} className="py-3 text-sm">
                  <div className="flex items-center gap-2">
                    <span className="font-medium">{r.period}</span>
                    {r.score != null && (
                      <span className="rounded-full bg-primary-100 px-2 py-0.5 font-mono text-xs text-primary-800">
                        {Number(r.score)}/100
                      </span>
                    )}
                    <span className="text-xs text-gray-400">{formatDate(r.createdAt)}</span>
                  </div>
                  {r.summary && <p className="mt-1 text-gray-700">{r.summary}</p>}
                  {histGrid.length > 0 && (
                    <table className="mt-2 w-full text-xs">
                      <tbody className="divide-y divide-gray-50">
                        {histGrid.map((g) => {
                          const value = g.auto
                            ? c.autoValues?.[g.key]
                            : c.manualScores?.[g.key];
                          return (
                            <tr key={g.key}>
                              <td className="py-1 text-gray-700">
                                {g.auto && <Wand2 className="mr-1 inline h-3 w-3 text-primary-600" />}
                                {g.label || g.key}
                              </td>
                              <td className="py-1 text-right font-mono text-gray-900">
                                {value != null ? value : '-'} / {g.max}
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  )}
                  {p && (
                    <div className="mt-2 rounded-lg bg-gray-50 px-3 py-2 text-[11px] text-gray-700">
                      <span className="font-semibold">Ponctualite ({p.from} → {p.to}) :</span>{' '}
                      presence {p.attendanceRate}%, retards {p.lateDays}j (+{p.totalLateMinutes} min),
                      depart anticipe {p.totalEarlyDepartureMinutes} min, heures sup {p.totalOvertimeMinutes} min,
                      absences {p.absentDays}j.
                    </div>
                  )}
                  {r.reviewer && (
                    <p className="mt-1 text-xs text-gray-400">
                      Evalue par {r.reviewer.firstName} {r.reviewer.lastName}
                    </p>
                  )}
                </li>
              );
            })}
          </ul>
        )}
      </AppCard>
    </div>
  );
}
