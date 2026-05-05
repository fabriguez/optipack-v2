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

  useEffect(() => {
    if (!open) return;
    setPeriod(currentPeriod());
    setAmount(employee?.baseSalary != null ? String(employee.baseSalary) : '');
    setCashRegisterId(defaultCashRegisterId ?? '');
    setDescription('');
  }, [open, employee, defaultCashRegisterId]);

  const mutation = useMutation({
    mutationFn: () =>
      apiClient.post(`/employees/${employee!.id}/pay`, {
        period,
        amount: Number(amount),
        cashRegisterId: cashRegisterId || undefined,
        description: description || undefined,
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
          Le paiement debite la caisse selectionnee, cree une depense (Expense) et marque le bulletin (Payslip) comme paye.
        </p>
        <AppInput
          label="Periode (YYYY-MM)"
          value={period}
          onChange={(e) => setPeriod(e.target.value)}
          placeholder="2026-05"
        />
        <AppInput
          label="Montant"
          type="number"
          step="0.01"
          value={amount}
          onChange={(e) => setAmount(e.target.value)}
        />
        <AppSelect
          label="Caisse a debiter"
          options={cashOptions}
          value={cashRegisterId}
          onValueChange={setCashRegisterId}
          placeholder="Caisse du jour de l'agence de l'employe (defaut)"
        />
        <AppInput
          label="Description (optionnel)"
          value={description}
          onChange={(e) => setDescription(e.target.value)}
        />
      </div>
    </AppDialog>
  );
}
