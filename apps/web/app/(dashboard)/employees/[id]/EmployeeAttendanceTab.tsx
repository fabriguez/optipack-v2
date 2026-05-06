'use client';

import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { apiClient } from '@/lib/api/client';
import { AppCard } from '@/components/ui/AppCard';
import { AppButton } from '@/components/ui/AppButton';
import { AppInput } from '@/components/ui/AppInput';
import { AppSelect } from '@/components/ui/AppSelect';
import { AppBadge } from '@/components/ui/AppBadge';
import { formatDate } from '@transitsoftservices/shared';
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

const STATUS_OPTIONS = Object.entries(STATUS_LABEL).map(([value, label]) => ({ value, label }));

export function EmployeeAttendanceTab({ employeeId }: { employeeId: string }) {
  const qc = useQueryClient();
  const today = new Date().toISOString().slice(0, 10);
  const [date, setDate] = useState(today);
  const [status, setStatus] = useState('PRESENT');
  const [checkInTime, setCheckInTime] = useState('');
  const [reason, setReason] = useState('');

  const { data } = useQuery({
    queryKey: ['employees', employeeId, 'attendance'],
    queryFn: () => apiClient.get(`/employees/${employeeId}/attendance`).then((r) => r.data),
    enabled: !!employeeId,
  });

  const items: any[] = data?.data ?? [];

  const mutation = useMutation({
    mutationFn: () =>
      apiClient.post(`/employees/${employeeId}/attendance`, {
        date,
        status,
        checkInTime: checkInTime || undefined,
        reason: reason || undefined,
      }),
    onSuccess: () => {
      toast.success('Pointage enregistre');
      setReason('');
      setCheckInTime('');
      qc.invalidateQueries({ queryKey: ['employees', employeeId, 'attendance'] });
    },
    onError: (e: any) => toast.error(e?.response?.data?.message || 'Erreur'),
  });

  return (
    <div className="space-y-4">
      <AppCard>
        <h3 className="mb-3 text-base font-semibold">Pointer cet employe</h3>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-4">
          <AppInput type="date" label="Date" value={date} onChange={(e) => setDate(e.target.value)} />
          <AppSelect label="Statut" options={STATUS_OPTIONS} value={status} onValueChange={setStatus} />
          {(status === 'LATE' || status === 'PRESENT') && (
            <AppInput
              type="time"
              label="Arrivee"
              value={checkInTime}
              onChange={(e) => setCheckInTime(e.target.value)}
            />
          )}
          <AppInput
            label="Motif (optionnel)"
            placeholder="Raison du retard / absence..."
            value={reason}
            onChange={(e) => setReason(e.target.value)}
          />
        </div>
        <div className="mt-3 flex justify-end">
          <AppButton onClick={() => mutation.mutate()} loading={mutation.isPending}>
            Enregistrer
          </AppButton>
        </div>
      </AppCard>

      <AppCard>
        <h3 className="mb-3 text-base font-semibold">Historique de pointage</h3>
        {items.length === 0 ? (
          <p className="py-6 text-center text-sm text-gray-400">Aucun pointage.</p>
        ) : (
          <table className="w-full text-sm">
            <thead className="text-left text-xs text-gray-500">
              <tr>
                <th className="pb-2">Date</th>
                <th className="pb-2">Statut</th>
                <th className="pb-2">Arrivee</th>
                <th className="pb-2">Retard (min)</th>
                <th className="pb-2">Motif</th>
                <th className="pb-2">Source</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
              {items.map((a) => (
                <tr key={a.id}>
                  <td className="py-2">{formatDate(a.date)}</td>
                  <td className="py-2">
                    <AppBadge variant={STATUS_VARIANT[a.status] ?? 'default'}>
                      {STATUS_LABEL[a.status] ?? a.status}
                    </AppBadge>
                  </td>
                  <td className="py-2 font-mono">{a.checkInTime || '-'}</td>
                  <td className="py-2">{a.lateMinutes ?? '-'}</td>
                  <td className="py-2 text-gray-600">{a.reason || '-'}</td>
                  <td className="py-2 text-xs text-gray-400">{a.source}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </AppCard>
    </div>
  );
}
