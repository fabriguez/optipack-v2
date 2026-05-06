'use client';

import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { apiClient } from '@/lib/api/client';
import { AppCard } from '@/components/ui/AppCard';
import { AppButton } from '@/components/ui/AppButton';
import { AppInput } from '@/components/ui/AppInput';
import { AppBadge } from '@/components/ui/AppBadge';
import { formatDate } from '@transitsoftservices/shared';
import { Check, Clock, X, ListChecks } from 'lucide-react';
import { toast } from 'sonner';

const STATUS_LABEL: Record<string, string> = {
  PRESENT: 'Present',
  LATE: 'Retard',
  ABSENT: 'Absent',
  ON_LEAVE: 'Conge',
  HOLIDAY: 'Ferie',
};
const STATUS_VARIANT: Record<string, 'success' | 'warning' | 'error' | 'default'> = {
  PRESENT: 'success',
  LATE: 'warning',
  ABSENT: 'error',
  ON_LEAVE: 'default',
  HOLIDAY: 'default',
};

interface EmployeeRow {
  id: string;
  fullName: string;
  position: string;
  shifts: Array<{ dayOfWeek: number; startTime: string; endTime: string; isWorking: boolean }>;
  attendances: Array<{
    id: string;
    status: keyof typeof STATUS_LABEL;
    checkInTime: string | null;
    lateMinutes: number | null;
    reason: string | null;
  }>;
}

export function AgencyAttendanceTab({ agencyId }: { agencyId: string }) {
  const qc = useQueryClient();
  const today = new Date().toISOString().slice(0, 10);
  const [date, setDate] = useState(today);

  const { data, isLoading } = useQuery({
    queryKey: ['agency-attendance', agencyId, date],
    queryFn: () =>
      apiClient
        .get(`/employees/agency/${agencyId}/attendance/today`, { params: { date } })
        .then((r) => r.data),
    enabled: !!agencyId,
  });

  const employees: EmployeeRow[] = data?.data?.employees ?? [];

  const markMutation = useMutation({
    mutationFn: ({ employeeId, status, checkInTime, reason }: any) =>
      apiClient.post(`/employees/${employeeId}/attendance`, {
        date,
        status,
        checkInTime,
        reason,
      }),
    onSuccess: () => {
      toast.success('Pointage enregistre');
      qc.invalidateQueries({ queryKey: ['agency-attendance', agencyId, date] });
    },
    onError: (e: any) => toast.error(e?.response?.data?.message || 'Erreur'),
  });

  const quickMark = (employeeId: string, status: string) => {
    const checkInTime =
      status === 'PRESENT' || status === 'LATE'
        ? new Date().toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit', hour12: false })
        : undefined;
    let reason: string | undefined;
    if (status === 'ABSENT' || status === 'LATE') {
      reason = window.prompt(status === 'LATE' ? 'Motif du retard (optionnel)' : 'Motif de l\'absence (optionnel)') ?? undefined;
    }
    markMutation.mutate({ employeeId, status, checkInTime, reason });
  };

  return (
    <div className="space-y-4">
      <AppCard>
        <div className="flex items-end gap-3">
          <div>
            <p className="text-xs text-gray-500 mb-1">Date</p>
            <AppInput type="date" value={date} onChange={(e) => setDate(e.target.value)} />
          </div>
          <AppButton variant="outline" size="sm" onClick={() => setDate(today)}>
            Aujourd&apos;hui
          </AppButton>
          <p className="ml-auto text-xs text-gray-500">
            <ListChecks className="inline h-3 w-3 mr-1" />
            {formatDate(date)}
          </p>
        </div>
      </AppCard>

      <AppCard>
        {isLoading ? (
          <p className="text-sm text-gray-400">Chargement...</p>
        ) : employees.length === 0 ? (
          <p className="py-6 text-center text-sm text-gray-400">Aucun employe actif.</p>
        ) : (
          <table className="w-full text-sm">
            <thead className="text-left text-xs text-gray-500">
              <tr>
                <th className="pb-2">Employe</th>
                <th className="pb-2">Poste</th>
                <th className="pb-2">Plage planifiee</th>
                <th className="pb-2">Statut</th>
                <th className="pb-2">Arrivee</th>
                <th className="pb-2">Retard</th>
                <th className="pb-2 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
              {employees.map((e) => {
                const att = e.attendances[0];
                const shift = e.shifts[0];
                return (
                  <tr key={e.id}>
                    <td className="py-2 font-medium">{e.fullName}</td>
                    <td className="py-2 text-gray-600">{e.position}</td>
                    <td className="py-2 font-mono text-xs">
                      {shift?.isWorking ? `${shift.startTime} - ${shift.endTime}` : <span className="text-gray-400">Repos</span>}
                    </td>
                    <td className="py-2">
                      {att ? (
                        <AppBadge variant={STATUS_VARIANT[att.status] ?? 'default'}>
                          {STATUS_LABEL[att.status] ?? att.status}
                        </AppBadge>
                      ) : (
                        <span className="text-xs text-gray-400">Non pointe</span>
                      )}
                    </td>
                    <td className="py-2 font-mono">{att?.checkInTime || '-'}</td>
                    <td className="py-2">{att?.lateMinutes != null ? `${att.lateMinutes} min` : '-'}</td>
                    <td className="py-2 text-right">
                      <div className="flex justify-end gap-1">
                        <button
                          type="button"
                          className="rounded-lg p-1.5 hover:bg-green-50"
                          title="Marquer present"
                          onClick={() => quickMark(e.id, 'PRESENT')}
                        >
                          <Check className="h-4 w-4 text-green-600" />
                        </button>
                        <button
                          type="button"
                          className="rounded-lg p-1.5 hover:bg-amber-50"
                          title="Marquer en retard"
                          onClick={() => quickMark(e.id, 'LATE')}
                        >
                          <Clock className="h-4 w-4 text-amber-600" />
                        </button>
                        <button
                          type="button"
                          className="rounded-lg p-1.5 hover:bg-red-50"
                          title="Marquer absent"
                          onClick={() => quickMark(e.id, 'ABSENT')}
                        >
                          <X className="h-4 w-4 text-red-600" />
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </AppCard>
    </div>
  );
}
