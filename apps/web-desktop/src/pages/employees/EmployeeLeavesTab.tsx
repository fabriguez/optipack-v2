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

const TYPE_OPTIONS = [
  { value: 'PAID', label: 'Conge paye' },
  { value: 'UNPAID', label: 'Sans solde' },
  { value: 'SICK', label: 'Maladie' },
  { value: 'MATERNITY', label: 'Maternite' },
  { value: 'PATERNITY', label: 'Paternite' },
  { value: 'EXCEPTIONAL', label: 'Exceptionnel' },
];

export function EmployeeLeavesTab({ employeeId }: { employeeId: string }) {
  const qc = useQueryClient();
  const [type, setType] = useState('PAID');
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [reason, setReason] = useState('');

  const { data } = useQuery({
    queryKey: ['employees', employeeId, 'leaves'],
    queryFn: () => apiClient.get(`/employees/${employeeId}/leaves`).then((r) => r.data),
    enabled: !!employeeId,
  });
  const items: any[] = data?.data ?? [];

  const requestMutation = useMutation({
    mutationFn: () =>
      apiClient.post(`/employees/${employeeId}/leaves`, {
        type,
        fromDate: from,
        toDate: to,
        reason: reason || undefined,
      }),
    onSuccess: () => {
      toast.success('Demande creee');
      setFrom('');
      setTo('');
      setReason('');
      qc.invalidateQueries({ queryKey: ['employees', employeeId, 'leaves'] });
    },
    onError: (e: any) => toast.error(e?.response?.data?.message || 'Erreur'),
  });

  const validateMutation = useMutation({
    mutationFn: ({ id, decision, comment }: { id: string; decision: 'APPROVED' | 'REJECTED'; comment?: string }) =>
      apiClient.post(`/employees/leaves/${id}/validate`, { decision, comment }),
    onSuccess: () => {
      toast.success('Decision enregistree');
      qc.invalidateQueries({ queryKey: ['employees', employeeId, 'leaves'] });
    },
    onError: (e: any) => toast.error(e?.response?.data?.message || 'Erreur'),
  });

  return (
    <div className="space-y-4">
      <AppCard>
        <h3 className="mb-3 text-base font-semibold">Nouvelle demande</h3>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-4">
          <AppSelect label="Type" options={TYPE_OPTIONS} value={type} onValueChange={setType} />
          <AppInput label="Du" type="date" value={from} onChange={(e) => setFrom(e.target.value)} />
          <AppInput label="Au" type="date" value={to} onChange={(e) => setTo(e.target.value)} />
          <AppInput label="Motif (optionnel)" value={reason} onChange={(e) => setReason(e.target.value)} />
        </div>
        <div className="mt-3 flex justify-end">
          <AppButton
            onClick={() => requestMutation.mutate()}
            loading={requestMutation.isPending}
            disabled={!from || !to}
          >
            Demander
          </AppButton>
        </div>
      </AppCard>

      <AppCard>
        <h3 className="mb-3 text-base font-semibold">Historique des conges</h3>
        {items.length === 0 ? (
          <p className="py-6 text-center text-sm text-gray-400">Aucune demande.</p>
        ) : (
          <table className="w-full text-sm">
            <thead className="text-left text-xs text-gray-500">
              <tr>
                <th className="pb-2">Type</th>
                <th className="pb-2">Du</th>
                <th className="pb-2">Au</th>
                <th className="pb-2">Motif</th>
                <th className="pb-2">Statut</th>
                <th className="pb-2"></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
              {items.map((l) => (
                <tr key={l.id}>
                  <td className="py-2">{l.type}</td>
                  <td className="py-2">{formatDate(l.fromDate)}</td>
                  <td className="py-2">{formatDate(l.toDate)}</td>
                  <td className="py-2 text-gray-600">{l.reason || '-'}</td>
                  <td className="py-2">
                    <AppBadge
                      variant={
                        l.status === 'APPROVED'
                          ? 'success'
                          : l.status === 'REJECTED'
                            ? 'error'
                            : l.status === 'PENDING'
                              ? 'warning'
                              : 'default'
                      }
                    >
                      {l.status}
                    </AppBadge>
                  </td>
                  <td className="py-2 text-right">
                    {l.status === 'PENDING' && (
                      <div className="flex gap-1">
                        <AppButton
                          size="sm"
                          variant="outline"
                          onClick={() => {
                            const c = window.prompt('Commentaire (optionnel) ?') ?? '';
                            validateMutation.mutate({ id: l.id, decision: 'APPROVED', comment: c });
                          }}
                        >
                          Approuver
                        </AppButton>
                        <AppButton
                          size="sm"
                          variant="outline"
                          onClick={() => {
                            const c = window.prompt('Motif du refus ?') ?? '';
                            if (!c.trim()) return;
                            validateMutation.mutate({ id: l.id, decision: 'REJECTED', comment: c.trim() });
                          }}
                        >
                          Refuser
                        </AppButton>
                      </div>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </AppCard>
    </div>
  );
}
