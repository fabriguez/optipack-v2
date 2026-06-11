import { useEffect, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { apiClient } from '@/lib/api/client';
import { AppDialog } from '@/components/ui/AppDialog';
import { AppInput } from '@/components/ui/AppInput';
import { AppSelect } from '@/components/ui/AppSelect';
import { AppButton } from '@/components/ui/AppButton';
import { AppBadge } from '@/components/ui/AppBadge';
import { MonthYearPicker } from '@/components/ui/MonthYearPicker';
import { formatAmount, formatDate } from '@transitsoftservices/shared';
import { Plus, X } from 'lucide-react';
import { toast } from 'sonner';

interface Props {
  open: boolean;
  onClose: () => void;
  employee: { id: string; fullName: string } | null;
}

interface Deduction {
  id: string;
  amount: string | number;
  reason: string;
  period: string | null;
  status: 'PENDING' | 'APPLIED' | 'CANCELLED';
  createdAt: string;
  appliedAt: string | null;
  cancelledAt: string | null;
  cancelledReason: string | null;
}

/**
 * Liste + creation + annulation des retenues sur salaire d'un employe.
 * Une retenue PENDING est appliquee automatiquement au prochain PayEmployee
 * (ou peut etre choisie a la main dans le dialog de paiement).
 */
export function SalaryDeductionDialog({ open, onClose, employee }: Props) {
  const qc = useQueryClient();
  const [amount, setAmount] = useState<string>('');
  const [reason, setReason] = useState<string>('');
  const [period, setPeriod] = useState<string>('');

  useEffect(() => {
    if (!open) return;
    setAmount('');
    setReason('');
    setPeriod('');
    setSelectedSanctionId('__custom__');
  }, [open]);

  const { data } = useQuery({
    queryKey: ['employees', employee?.id, 'deductions'],
    queryFn: () => apiClient.get(`/employees/${employee!.id}/deductions`).then((r) => r.data),
    enabled: open && !!employee?.id,
  });
  const items = (data?.data as Deduction[]) ?? [];

  // Sanctions de l'employe : utilisees pour proposer le motif de retenue.
  // Une sanction non resolue peut justifier un prelevement (gel, casse,
  // suspension partielle, ...). On filtre celles pouvant impliquer une
  // retenue financiere (toutes, l'admin trie).
  const { data: sanctionsData } = useQuery({
    queryKey: ['employees', employee?.id, 'sanctions'],
    queryFn: () => apiClient.get(`/employees/${employee!.id}/sanctions`).then((r) => r.data),
    enabled: open && !!employee?.id,
  });
  const sanctions: Array<{ id: string; type: string; reason: string; effectiveFrom: string }> =
    sanctionsData?.data ?? [];

  const SANCTION_TYPE_LABEL: Record<string, string> = {
    WARNING: 'Avertissement',
    SUSPENSION: 'Suspension',
    PAY_FREEZE: 'Gel salaire',
    DEMOTION: 'Retrogradation',
  };
  const sanctionOptions = [
    { value: '__custom__', label: '-- Motif libre (autre) --' },
    ...sanctions.map((s) => ({
      value: s.id,
      label: `[${SANCTION_TYPE_LABEL[s.type] ?? s.type}] ${s.reason}`.slice(0, 80),
    })),
  ];
  const [selectedSanctionId, setSelectedSanctionId] = useState<string>('__custom__');

  useEffect(() => {
    if (selectedSanctionId === '__custom__') return;
    const found = sanctions.find((s) => s.id === selectedSanctionId);
    if (found) setReason(`Sanction ${SANCTION_TYPE_LABEL[found.type] ?? found.type} : ${found.reason}`);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedSanctionId]);

  const createMutation = useMutation({
    mutationFn: () =>
      apiClient.post(`/employees/${employee!.id}/deductions`, {
        amount: Number(amount),
        reason,
        period: period || undefined,
      }),
    onSuccess: () => {
      toast.success('Retenue enregistree');
      setAmount('');
      setReason('');
      setPeriod('');
      qc.invalidateQueries({ queryKey: ['employees', employee?.id, 'deductions'] });
    },
    onError: (e: any) => toast.error(e?.response?.data?.message || 'Erreur'),
  });

  const cancelMutation = useMutation({
    mutationFn: ({ id, reason }: { id: string; reason: string }) =>
      apiClient.post(`/employees/deductions/${id}/cancel`, { reason }),
    onSuccess: () => {
      toast.success('Retenue annulee');
      qc.invalidateQueries({ queryKey: ['employees', employee?.id, 'deductions'] });
    },
    onError: (e: any) => toast.error(e?.response?.data?.message || 'Erreur'),
  });

  return (
    <AppDialog
      open={open}
      onClose={onClose}
      title={employee ? `Retenues sur salaire - ${employee.fullName}` : 'Retenues sur salaire'}
      size="lg"
    >
      <div className="space-y-4">
        <div className="rounded-xl border border-gray-100 bg-gray-50 p-3">
          <p className="mb-2 text-sm font-medium text-gray-700">Nouvelle retenue (ponctuelle)</p>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <AppInput
              label="Montant"
              type="number"
              step="0.01"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
            />
            <MonthYearPicker
              label="Periode cible (optionnel)"
              value={period}
              onChange={setPeriod}
              allowEmpty
            />
            <AppSelect
              label="Motif - sanction liee"
              options={sanctionOptions}
              value={selectedSanctionId}
              onValueChange={setSelectedSanctionId}
              placeholder={sanctions.length === 0 ? 'Aucune sanction enregistree' : 'Choisir une sanction'}
            />
            <AppInput
              label="Motif detaille (obligatoire)"
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder={
                selectedSanctionId === '__custom__'
                  ? 'Ex : avance, casse, materiel perdu...'
                  : 'Motif pre-rempli depuis la sanction (modifiable)'
              }
            />
          </div>
          <div className="mt-3 flex justify-end">
            <AppButton
              size="sm"
              onClick={() => createMutation.mutate()}
              loading={createMutation.isPending}
              disabled={!amount || Number(amount) <= 0 || !reason.trim()}
            >
              <Plus className="h-3.5 w-3.5" />
              Enregistrer la retenue
            </AppButton>
          </div>
        </div>

        <div>
          <p className="mb-2 text-sm font-medium text-gray-700">Historique ({items.length})</p>
          {items.length === 0 ? (
            <p className="rounded-xl bg-gray-50 p-6 text-center text-sm text-gray-400">
              Aucune retenue enregistree pour cet employe.
            </p>
          ) : (
            <ul className="divide-y divide-gray-100 rounded-xl border border-gray-100">
              {items.map((d) => (
                <li key={d.id} className="flex flex-wrap items-center gap-3 px-3 py-2 text-sm">
                  <span className="font-mono font-bold text-red-600">-{formatAmount(Number(d.amount))}</span>
                  <span className="flex-1 min-w-0 truncate" title={d.reason}>{d.reason}</span>
                  {d.period && <span className="text-xs text-gray-500">{d.period}</span>}
                  {d.status === 'PENDING' && <AppBadge variant="warning">En attente</AppBadge>}
                  {d.status === 'APPLIED' && (
                    <AppBadge variant="success">
                      Appliquee {d.appliedAt ? `le ${formatDate(d.appliedAt)}` : ''}
                    </AppBadge>
                  )}
                  {d.status === 'CANCELLED' && (
                    <span title={d.cancelledReason ?? ''}>
                      <AppBadge variant="default">Annulee</AppBadge>
                    </span>
                  )}
                  <span className="text-xs text-gray-400">{formatDate(d.createdAt)}</span>
                  {d.status === 'PENDING' && (
                    <button
                      type="button"
                      onClick={() => {
                        const motif = window.prompt('Motif de l\'annulation ?') ?? '';
                        if (!motif.trim()) return;
                        cancelMutation.mutate({ id: d.id, reason: motif.trim() });
                      }}
                      className="rounded p-1 text-red-500 hover:bg-red-50"
                      aria-label="Annuler"
                    >
                      <X className="h-3.5 w-3.5" />
                    </button>
                  )}
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </AppDialog>
  );
}
