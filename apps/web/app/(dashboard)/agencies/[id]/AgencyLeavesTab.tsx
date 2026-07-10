'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import Link from 'next/link';
import { apiClient } from '@/lib/api/client';
import { AppCard } from '@/components/ui/AppCard';
import { AppButton } from '@/components/ui/AppButton';
import { Can } from '@/lib/components/Can';
import { formatDate } from '@transitsoftservices/shared';
import { Check, X } from 'lucide-react';
import { toast } from 'sonner';

const TYPE_LABEL: Record<string, string> = {
  PAID: 'Paye',
  UNPAID: 'Sans solde',
  SICK: 'Maladie',
  MATERNITY: 'Maternite',
  PATERNITY: 'Paternite',
  EXCEPTIONAL: 'Exceptionnel',
};

export function AgencyLeavesTab({ agencyId }: { agencyId: string }) {
  const qc = useQueryClient();
  const { data, isLoading } = useQuery({
    queryKey: ['agency-leaves-pending', agencyId],
    queryFn: () =>
      apiClient.get(`/employees/agency/${agencyId}/leaves/pending`).then((r) => r.data),
    enabled: !!agencyId,
  });
  const items: any[] = data?.data ?? [];

  const validateMutation = useMutation({
    mutationFn: ({ id, decision, comment }: { id: string; decision: 'APPROVED' | 'REJECTED'; comment?: string }) =>
      apiClient.post(`/employees/leaves/${id}/validate`, { decision, comment }),
    onSuccess: () => {
      toast.success('Decision enregistree');
      qc.invalidateQueries({ queryKey: ['agency-leaves-pending', agencyId] });
    },
    onError: (e: any) => toast.error(e?.response?.data?.message || 'Erreur'),
  });

  return (
    <AppCard>
      <h3 className="mb-3 text-base font-semibold">Demandes de conge en attente ({items.length})</h3>
      {isLoading ? (
        <p className="text-sm text-gray-400">Chargement...</p>
      ) : items.length === 0 ? (
        <p className="py-6 text-center text-sm text-gray-400">Aucune demande en attente.</p>
      ) : (
        <table className="w-full text-sm">
          <thead className="text-left text-xs text-gray-500">
            <tr>
              <th className="pb-2">Employe</th>
              <th className="pb-2">Type</th>
              <th className="pb-2">Du</th>
              <th className="pb-2">Au</th>
              <th className="pb-2">Motif</th>
              <th className="pb-2">Demandeur</th>
              <th className="pb-2 text-right">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-50">
            {items.map((l) => (
              <tr key={l.id}>
                <td className="py-2">
                  <Link href={`/employees/${l.employee.id}`} className="font-medium text-primary-700 hover:underline">
                    {l.employee.fullName}
                  </Link>
                  <p className="text-xs text-gray-500">{l.employee.position}</p>
                </td>
                <td className="py-2">{TYPE_LABEL[l.type] ?? l.type}</td>
                <td className="py-2">{formatDate(l.fromDate)}</td>
                <td className="py-2">{formatDate(l.toDate)}</td>
                <td className="py-2 text-gray-600">{l.reason || '-'}</td>
                <td className="py-2 text-xs text-gray-500">
                  {l.requestedBy ? `${l.requestedBy.firstName} ${l.requestedBy.lastName}` : '-'}
                </td>
                <td className="py-2 text-right">
                  <Can permission="leave.validate">
                  <div className="flex justify-end gap-1">
                    <AppButton
                      size="sm"
                      variant="outline"
                      onClick={() => {
                        const c = window.prompt('Commentaire (optionnel) ?') ?? '';
                        validateMutation.mutate({ id: l.id, decision: 'APPROVED', comment: c });
                      }}
                    >
                      <Check className="h-3.5 w-3.5" />
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
                      <X className="h-3.5 w-3.5" />
                      Refuser
                    </AppButton>
                  </div>
                  </Can>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </AppCard>
  );
}
