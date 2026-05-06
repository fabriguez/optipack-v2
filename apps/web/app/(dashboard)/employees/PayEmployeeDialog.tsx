'use client';

import { useEffect, useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { apiClient } from '@/lib/api/client';
import { AppDialog } from '@/components/ui/AppDialog';
import { AppButton } from '@/components/ui/AppButton';
import { AppInput } from '@/components/ui/AppInput';
import { AppSelect } from '@/components/ui/AppSelect';
import { formatAmount, formatDate } from '@transitsoftservices/shared';
import { toast } from 'sonner';

interface CashRegister {
  id: string;
  agencyId: string;
  date: string;
  isClosed: boolean;
  currentBalance: string | number;
  closingBalance?: string | number | null;
  agency?: { id: string; name: string };
}

interface Props {
  open: boolean;
  onClose: () => void;
  employee: {
    id: string;
    fullName: string;
    agencyId: string;
    baseSalary: number | string | null;
  } | null;
  /** Si fourni : pre-selection de la caisse. */
  defaultCashRegisterId?: string;
}

const currentPeriod = () => {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
};

export function PayEmployeeDialog({ open, onClose, employee, defaultCashRegisterId }: Props) {
  const qc = useQueryClient();
  const [period, setPeriod] = useState(currentPeriod());
  const [amount, setAmount] = useState<string>('');
  const [cashRegisterId, setCashRegisterId] = useState<string>('');
  const [description, setDescription] = useState<string>('');

  // Pour selectionner la caisse, on liste les caisses du jour de toutes les agences accessibles.
  // On utilise /agencies + /cash-registers/:agencyId pour chaque agence.
  const { data: agencies } = useQuery({
    queryKey: ['agencies', 'all'],
    queryFn: () => apiClient.get('/agencies', { params: { limit: 50 } }).then((r) => r.data),
    enabled: open,
  });

  const agencyIds: string[] = (agencies?.data ?? []).map((a: any) => a.id);

  const { data: cashRegisters } = useQuery({
    queryKey: ['cash-registers-for-pay', agencyIds.join(',')],
    queryFn: async () => {
      const results = await Promise.all(
        agencyIds.map(async (id) => {
          try {
            const res = await apiClient.get(`/cash-registers/${id}`);
            const cr = res.data?.data;
            const agency = (agencies?.data ?? []).find((a: any) => a.id === id);
            return { ...cr, agency } as CashRegister;
          } catch {
            return null;
          }
        }),
      );
      return results.filter(Boolean) as CashRegister[];
    },
    enabled: open && agencyIds.length > 0,
  });

  const [note, setNote] = useState<string>('');
  const [applyDeductionIds, setApplyDeductionIds] = useState<string[]>([]);

  // Liste des retenues PENDING de l'employe
  const { data: deductionsData } = useQuery({
    queryKey: ['employees', employee?.id, 'deductions'],
    queryFn: () => apiClient.get(`/employees/${employee!.id}/deductions`).then((r) => r.data),
    enabled: open && !!employee?.id,
  });
  const pendingDeductions: Array<{ id: string; amount: string | number; reason: string; period: string | null }> =
    (deductionsData?.data ?? []).filter((d: any) => d.status === 'PENDING');

  useEffect(() => {
    if (!open) return;
    setPeriod(currentPeriod());
    setAmount(employee?.baseSalary != null ? String(employee.baseSalary) : '');
    setCashRegisterId(defaultCashRegisterId ?? '');
    setDescription('');
    setNote('');
    setApplyDeductionIds([]);
  }, [open, employee, defaultCashRegisterId]);

  // Quand la liste des retenues change, on coche tout par defaut.
  useEffect(() => {
    if (open) setApplyDeductionIds(pendingDeductions.map((d) => d.id));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, deductionsData]);

  const grossNumber = Number(amount) || 0;
  const deductionsTotal = pendingDeductions
    .filter((d) => applyDeductionIds.includes(d.id))
    .reduce((sum, d) => sum + Number(d.amount), 0);
  const netNumber = Math.max(0, grossNumber - deductionsTotal);

  const mutation = useMutation({
    mutationFn: () =>
      apiClient.post(`/employees/${employee!.id}/pay`, {
        period,
        amount: Number(amount),
        cashRegisterId: cashRegisterId || undefined,
        description: description || undefined,
        note: note || undefined,
        applyDeductionIds,
      }),
    onSuccess: () => {
      toast.success('Salaire paye');
      qc.invalidateQueries({ queryKey: ['employees'] });
      qc.invalidateQueries({ queryKey: ['cash-register'] });
      onClose();
    },
    onError: (e: any) => toast.error(e?.response?.data?.message || 'Echec du paiement'),
  });

  const cashOptions = (cashRegisters ?? []).map((cr) => ({
    value: cr.id,
    label: `${cr.agency?.name ?? 'Agence'} - ${formatDate(cr.date)} (${formatAmount(Number(cr.isClosed ? cr.closingBalance ?? cr.currentBalance : cr.currentBalance))})${cr.isClosed ? ' [fermee]' : ''}`,
  }));

  return (
    <AppDialog
      open={open}
      onClose={onClose}
      title={employee ? `Payer ${employee.fullName}` : 'Payer un employe'}
      size="md"
      footer={
        <>
          <AppButton variant="ghost" onClick={onClose}>Annuler</AppButton>
          <AppButton
            onClick={() => mutation.mutate()}
            loading={mutation.isPending}
            disabled={!amount || Number(amount) <= 0}
          >
            Confirmer le paiement
          </AppButton>
        </>
      }
    >
      <div className="space-y-3">
        <p className="text-xs text-gray-500">
          Le paiement debite la caisse selectionnee, cree une depense (Expense), un bon de
          decaissement (DisbursementVoucher) et marque le bulletin (Payslip) comme paye.
        </p>
        <div className="grid grid-cols-2 gap-3">
          <AppInput
            label="Periode (YYYY-MM)"
            value={period}
            onChange={(e) => setPeriod(e.target.value)}
            placeholder="2026-05"
          />
          <AppInput
            label="Montant brut"
            type="number"
            step="0.01"
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
          />
        </div>

        {pendingDeductions.length > 0 && (
          <div className="rounded-xl border border-amber-200 bg-amber-50 p-3">
            <p className="mb-2 text-xs font-medium text-amber-900">
              Retenues a appliquer ({pendingDeductions.length})
            </p>
            <ul className="space-y-1 text-sm">
              {pendingDeductions.map((d) => (
                <li key={d.id} className="flex items-center gap-2">
                  <input
                    type="checkbox"
                    checked={applyDeductionIds.includes(d.id)}
                    onChange={(e) => {
                      if (e.target.checked) setApplyDeductionIds((s) => [...s, d.id]);
                      else setApplyDeductionIds((s) => s.filter((x) => x !== d.id));
                    }}
                    className="h-4 w-4 rounded border-gray-300"
                  />
                  <span className="flex-1 truncate" title={d.reason}>
                    {d.reason}
                    {d.period ? <span className="text-gray-500"> ({d.period})</span> : null}
                  </span>
                  <span className="font-mono text-red-600">-{formatAmount(Number(d.amount))}</span>
                </li>
              ))}
            </ul>
          </div>
        )}

        <div className="rounded-xl bg-primary-50 p-3 text-sm">
          <div className="flex items-center justify-between">
            <span className="text-gray-600">Brut</span>
            <span className="font-mono">{formatAmount(grossNumber)}</span>
          </div>
          {deductionsTotal > 0 && (
            <div className="flex items-center justify-between text-red-700">
              <span>Retenues</span>
              <span className="font-mono">-{formatAmount(deductionsTotal)}</span>
            </div>
          )}
          <div className="mt-1 flex items-center justify-between border-t border-primary-100 pt-1 font-bold text-primary-900">
            <span>Net a payer</span>
            <span className="font-mono">{formatAmount(netNumber)}</span>
          </div>
        </div>

        <AppSelect
          label="Caisse a debiter"
          options={cashOptions}
          value={cashRegisterId}
          onValueChange={setCashRegisterId}
          placeholder="Caisse du jour de l'agence de l'employe (defaut)"
        />
        <AppInput
          label="Note (motif, contexte) - sera trace sur le payslip"
          value={note}
          onChange={(e) => setNote(e.target.value)}
          placeholder="Ex: Avance sur salaire, prime fin d'annee..."
        />
        <AppInput
          label="Description interne (optionnel)"
          value={description}
          onChange={(e) => setDescription(e.target.value)}
        />
      </div>
    </AppDialog>
  );
}
