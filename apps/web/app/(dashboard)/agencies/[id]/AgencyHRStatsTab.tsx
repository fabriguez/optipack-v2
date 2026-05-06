'use client';

import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { apiClient } from '@/lib/api/client';
import { AppCard } from '@/components/ui/AppCard';
import { AppButton } from '@/components/ui/AppButton';
import { AppInput } from '@/components/ui/AppInput';
import { formatAmount } from '@transitsoftservices/shared';
import { Download } from 'lucide-react';
import { toast } from 'sonner';

function defaultMonth(): string {
  return new Date().toISOString().slice(0, 7);
}

export function AgencyHRStatsTab({ agencyId }: { agencyId: string }) {
  const [month, setMonth] = useState(defaultMonth());
  const [downloading, setDownloading] = useState(false);

  const { data, isLoading } = useQuery({
    queryKey: ['agency-hr-stats', agencyId, month],
    queryFn: () =>
      apiClient.get(`/employees/agency/${agencyId}/hr-stats`, { params: { month } }).then((r) => r.data),
    enabled: !!agencyId,
  });
  const stats = data?.data;

  const downloadReport = async () => {
    setDownloading(true);
    try {
      const res = await apiClient.get(`/employees/agency/${agencyId}/hr-report.xlsx`, {
        params: { month },
        responseType: 'blob',
      });
      const blob = new Blob([res.data], {
        type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `rh-${month}.xlsx`;
      a.click();
      URL.revokeObjectURL(url);
    } catch (e: any) {
      toast.error(e?.response?.data?.message || 'Echec export');
    } finally {
      setDownloading(false);
    }
  };

  return (
    <div className="space-y-4">
      <AppCard>
        <div className="flex flex-wrap items-end gap-3">
          <div>
            <p className="mb-1 text-xs text-gray-500">Periode</p>
            <AppInput type="month" value={month} onChange={(e) => setMonth(e.target.value)} />
          </div>
          <AppButton variant="outline" size="sm" onClick={() => setMonth(defaultMonth())}>
            Mois courant
          </AppButton>
          <div className="ml-auto">
            <AppButton variant="outline" onClick={downloadReport} loading={downloading}>
              <Download className="h-4 w-4" />
              Rapport mensuel (XLSX)
            </AppButton>
          </div>
        </div>
      </AppCard>

      {isLoading || !stats ? (
        <p className="text-sm text-gray-400">Chargement...</p>
      ) : (
        <>
          <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
            <KPI label="Effectifs actifs" value={stats.totalEmployees} />
            <KPI label="Chefs d'agence" value={stats.managersCount} />
            <KPI label="Sanctions du mois" value={stats.sanctionsCount} accent="warning" />
            <KPI label="Conges en attente" value={stats.leaves.pending} accent="warning" />
          </div>

          <AppCard>
            <h3 className="mb-3 text-base font-semibold">Pointage du mois</h3>
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-5">
              <Stat label="Presents" value={stats.attendance.present} accent="success" />
              <Stat label="Retards" value={stats.attendance.late} accent="warning" />
              <Stat label="Absents" value={stats.attendance.absent} accent="error" />
              <Stat label="Conges" value={stats.attendance.onLeave} />
              <Stat label="Min retard" value={stats.attendance.totalLateMinutes} />
            </div>
          </AppCard>

          <AppCard>
            <h3 className="mb-3 text-base font-semibold">Conges</h3>
            <div className="grid grid-cols-3 gap-3">
              <Stat label="Approuves" value={stats.leaves.approved} accent="success" />
              <Stat label="En attente" value={stats.leaves.pending} accent="warning" />
              <Stat label="Refuses" value={stats.leaves.rejected} accent="error" />
            </div>
          </AppCard>

          <AppCard>
            <h3 className="mb-3 text-base font-semibold">Masse salariale</h3>
            <div className="grid grid-cols-3 gap-3">
              <Stat label="Payee" value={formatAmount(stats.payroll.paid)} accent="success" raw />
              <Stat label="En attente" value={formatAmount(stats.payroll.pending)} accent="warning" raw />
              <Stat label="Total" value={formatAmount(stats.payroll.total)} raw />
            </div>
          </AppCard>

          {stats.byEmployee?.length > 0 && (
            <AppCard>
              <h3 className="mb-3 text-base font-semibold">Vue par employe</h3>
              <table className="w-full text-sm">
                <thead className="text-left text-xs text-gray-500">
                  <tr>
                    <th className="pb-2">Employe</th>
                    <th className="pb-2 text-right">Presents</th>
                    <th className="pb-2 text-right">Retards</th>
                    <th className="pb-2 text-right">Absents</th>
                    <th className="pb-2 text-right">Conges</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-50">
                  {stats.byEmployee.map((e: any) => (
                    <tr key={e.id}>
                      <td className="py-2 font-medium">{e.fullName}</td>
                      <td className="py-2 text-right text-green-600">{e.present}</td>
                      <td className="py-2 text-right text-amber-600">{e.late}</td>
                      <td className="py-2 text-right text-red-600">{e.absent}</td>
                      <td className="py-2 text-right text-gray-500">{e.onLeave}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </AppCard>
          )}
        </>
      )}
    </div>
  );
}

function KPI({ label, value, accent }: { label: string; value: any; accent?: 'success' | 'warning' | 'error' }) {
  const color =
    accent === 'success' ? 'text-green-600' : accent === 'warning' ? 'text-amber-600' : accent === 'error' ? 'text-red-600' : 'text-gray-900';
  return (
    <AppCard>
      <p className="text-xs uppercase tracking-wider text-gray-400">{label}</p>
      <p className={`mt-1 text-2xl font-bold ${color}`}>{value}</p>
    </AppCard>
  );
}

function Stat({ label, value, accent, raw }: { label: string; value: any; accent?: 'success' | 'warning' | 'error'; raw?: boolean }) {
  const color =
    accent === 'success' ? 'text-green-600' : accent === 'warning' ? 'text-amber-600' : accent === 'error' ? 'text-red-600' : 'text-gray-900';
  return (
    <div className="rounded-xl bg-gray-50 p-3">
      <p className="text-[10px] uppercase tracking-wider text-gray-400">{label}</p>
      <p className={`mt-1 text-base font-bold ${color}`}>{raw ? value : value}</p>
    </div>
  );
}
