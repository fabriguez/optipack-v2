import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { apiClient } from '@/lib/api/client';
import { AppCard } from '@/components/ui/AppCard';
import { AppButton } from '@/components/ui/AppButton';
import { AppBadge } from '@/components/ui/AppBadge';
import { Check, X, LogOut } from 'lucide-react';
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

/** "HH:mm" 24h pour l'heure courante locale -- envoyee a l'API. */
function currentHHmm(): string {
  return new Date().toLocaleTimeString('fr-FR', {
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  });
}

/** YYYY-MM-DD pour la date du jour locale (pas de saisie manuelle). */
function today(): string {
  return new Date().toISOString().slice(0, 10);
}

export function EmployeeAttendanceTab({ employeeId }: { employeeId: string }) {
  const qc = useQueryClient();

  const { data } = useQuery({
    queryKey: ['employees', employeeId, 'attendance'],
    queryFn: () => apiClient.get(`/employees/${employeeId}/attendance`).then((r) => r.data),
    enabled: !!employeeId,
  });
  const items: any[] = data?.data ?? [];
  // Pointage du jour (si existe) pour activer / desactiver les boutons.
  const todayKey = today();
  const todayRow = items.find((a) => String(a.date).slice(0, 10) === todayKey);

  // Marque arrivee : on envoie PRESENT, le backend promote en LATE
  // automatiquement si l'heure depasse la plage planifiee.
  const markIn = useMutation({
    mutationFn: (status: 'PRESENT' | 'ABSENT') =>
      apiClient.post(`/employees/${employeeId}/attendance`, {
        date: todayKey,
        status,
        checkInTime: status === 'PRESENT' ? currentHHmm() : undefined,
        reason:
          status === 'ABSENT'
            ? window.prompt("Motif de l'absence (optionnel)") || undefined
            : undefined,
      }),
    onSuccess: () => {
      toast.success('Pointage enregistre');
      qc.invalidateQueries({ queryKey: ['employees', employeeId, 'attendance'] });
    },
    onError: (e: any) => toast.error(e?.response?.data?.message || 'Erreur'),
  });

  // Check-out : applique uniquement sur le pointage du jour (PRESENT/LATE).
  // L'heure est figee cote client a la seconde du clic.
  const checkOut = useMutation({
    mutationFn: () =>
      apiClient.post(`/employees/${employeeId}/attendance/check-out`, {
        date: todayKey,
        checkOutTime: currentHHmm(),
      }),
    onSuccess: () => {
      toast.success('Depart enregistre');
      qc.invalidateQueries({ queryKey: ['employees', employeeId, 'attendance'] });
    },
    onError: (e: any) => toast.error(e?.response?.data?.message || 'Erreur'),
  });

  const canCheckOut =
    todayRow &&
    (todayRow.status === 'PRESENT' || todayRow.status === 'LATE') &&
    !todayRow.checkOutTime;

  return (
    <div className="space-y-4">
      <AppCard>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h3 className="text-base font-semibold">Pointer cet employe (aujourd&apos;hui)</h3>
            <p className="text-xs text-gray-500">
              Le pointage prend automatiquement l&apos;heure courante. Le statut &laquo;&nbsp;retard&nbsp;&raquo;
              est calcule a partir de l&apos;horaire planifie. Pas de pointage retroactif.
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <AppButton
              variant="outline"
              size="sm"
              onClick={() => markIn.mutate('PRESENT')}
              loading={markIn.isPending}
              disabled={!!todayRow}
              title={todayRow ? "Deja pointe aujourd'hui" : 'Marquer arrivee maintenant'}
            >
              <Check className="h-4 w-4 text-green-600" />
              Arrivee
            </AppButton>
            <AppButton
              variant="outline"
              size="sm"
              onClick={() => checkOut.mutate()}
              loading={checkOut.isPending}
              disabled={!canCheckOut}
              title={
                !todayRow
                  ? "Pas encore de pointage d'arrivee aujourd'hui"
                  : todayRow.checkOutTime
                    ? `Depart deja pointe (${todayRow.checkOutTime})`
                    : 'Marquer depart maintenant'
              }
            >
              <LogOut className="h-4 w-4 text-primary-600" />
              Depart
            </AppButton>
            <AppButton
              variant="outline"
              size="sm"
              onClick={() => markIn.mutate('ABSENT')}
              loading={markIn.isPending}
              disabled={!!todayRow}
            >
              <X className="h-4 w-4 text-red-600" />
              Absent
            </AppButton>
          </div>
        </div>
        {todayRow && (
          <div className="mt-3 rounded-lg bg-gray-50 px-3 py-2 text-xs">
            <span className="text-gray-500">Aujourd&apos;hui :</span>{' '}
            <AppBadge variant={STATUS_VARIANT[todayRow.status] ?? 'default'}>
              {STATUS_LABEL[todayRow.status] ?? todayRow.status}
            </AppBadge>
            {todayRow.expectedStart && (
              <span className="ml-2 text-gray-500">prevu {todayRow.expectedStart}-{todayRow.expectedEnd}</span>
            )}
            {todayRow.checkInTime && (
              <span className="ml-2 font-mono text-gray-700">arrivee {todayRow.checkInTime}</span>
            )}
            {todayRow.checkOutTime && (
              <span className="ml-2 font-mono text-gray-700">depart {todayRow.checkOutTime}</span>
            )}
            {todayRow.lateMinutes ? (
              <span className="ml-2 text-amber-700">+{todayRow.lateMinutes} min retard</span>
            ) : null}
            {todayRow.earlyDepartureMinutes ? (
              <span className="ml-2 text-red-700">-{todayRow.earlyDepartureMinutes} min depart anticipe</span>
            ) : null}
            {todayRow.overtimeMinutes ? (
              <span className="ml-2 text-emerald-700">+{todayRow.overtimeMinutes} min heures sup</span>
            ) : null}
          </div>
        )}
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
                <th className="pb-2">Arrivee (prevu / pointe)</th>
                <th className="pb-2">Depart (prevu / pointe)</th>
                <th className="pb-2">Retard</th>
                <th className="pb-2">Depart anticipe</th>
                <th className="pb-2">Heures sup</th>
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
                  <td className="py-2 font-mono text-xs">
                    <span className="text-gray-400">{a.expectedStart || '--:--'}</span>
                    <span className="mx-1 text-gray-300">/</span>
                    <span className={a.lateMinutes ? 'text-amber-700 font-semibold' : 'text-gray-700'}>{a.checkInTime || '-'}</span>
                  </td>
                  <td className="py-2 font-mono text-xs">
                    <span className="text-gray-400">{a.expectedEnd || '--:--'}</span>
                    <span className="mx-1 text-gray-300">/</span>
                    <span className={
                      a.earlyDepartureMinutes ? 'text-red-700 font-semibold'
                      : a.overtimeMinutes ? 'text-emerald-700 font-semibold'
                      : 'text-gray-700'
                    }>{a.checkOutTime || '-'}</span>
                  </td>
                  <td className="py-2 text-amber-700">{a.lateMinutes ? `+${a.lateMinutes} min` : '-'}</td>
                  <td className="py-2 text-red-700">{a.earlyDepartureMinutes ? `-${a.earlyDepartureMinutes} min` : '-'}</td>
                  <td className="py-2 text-emerald-700">{a.overtimeMinutes ? `+${a.overtimeMinutes} min` : '-'}</td>
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
