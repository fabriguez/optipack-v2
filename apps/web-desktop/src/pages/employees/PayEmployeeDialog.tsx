import { useEffect, useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { apiClient } from '@/lib/api/client';
import { AppDialog } from '@/components/ui/AppDialog';
import { AppButton } from '@/components/ui/AppButton';
import { AppInput } from '@/components/ui/AppInput';
import { AppSelect } from '@/components/ui/AppSelect';
import { MonthYearPicker } from '@/components/ui/MonthYearPicker';
import { fetchPdfAuthed } from '@/lib/api/pdfDownload';
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
    isActive?: boolean;
  } | null;
  /** Si fourni : pre-selection de la caisse. */
  defaultCashRegisterId?: string;
}

const currentPeriod = () => {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
};

type PayslipSummary = {
  id: string;
  period: string;
  netSalary: string | number;
  paidAmount: string | number;
  isPaid: boolean;
  paidAt?: string | null;
  deductionsTotal?: string | number | null;
  payments?: Array<{ id: string; amount: string | number; paidAt: string; note?: string | null }>;
};

export function PayEmployeeDialog({ open, onClose, employee, defaultCashRegisterId }: Props) {
  const qc = useQueryClient();
  const [period, setPeriod] = useState(currentPeriod());
  const [amount, setAmount] = useState<string>('');
  const [bonuses, setBonuses] = useState<string>('');
  const [benefitsInKind, setBenefitsInKind] = useState<string>('');
  const [bonusesLabel, setBonusesLabel] = useState<string>('');
  const [installmentAmount, setInstallmentAmount] = useState<string>('');
  const [cashRegisterId, setCashRegisterId] = useState<string>('');
  const [description, setDescription] = useState<string>('');

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
  const [paymentMethod, setPaymentMethod] = useState<string>('CASH');
  const [applyDeductionIds, setApplyDeductionIds] = useState<string[]>([]);

  const { data: deductionsData } = useQuery({
    queryKey: ['employees', employee?.id, 'deductions'],
    queryFn: () => apiClient.get(`/employees/${employee!.id}/deductions`).then((r) => r.data),
    enabled: open && !!employee?.id,
  });
  const pendingDeductions: Array<{ id: string; amount: string | number; reason: string; period: string | null }> =
    (deductionsData?.data ?? []).filter((d: any) => d.status === 'PENDING');

  // Payslips existants : pour afficher le solde restant si paiement partiel
  // deja entame sur la periode.
  const { data: payslipsData } = useQuery({
    queryKey: ['employees', employee?.id, 'payslips'],
    queryFn: () => apiClient.get(`/employees/${employee!.id}/payslips`).then((r) => r.data),
    enabled: open && !!employee?.id,
  });
  const allPayslips: PayslipSummary[] = payslipsData?.data ?? [];
  const currentPayslip = allPayslips.find((p) => p.period === period);

  useEffect(() => {
    if (!open) return;
    setPeriod(currentPeriod());
    setAmount(employee?.baseSalary != null ? String(employee.baseSalary) : '');
    setBonuses('');
    setBenefitsInKind('');
    setBonusesLabel('');
    setInstallmentAmount('');
    setCashRegisterId(defaultCashRegisterId ?? '');
    setDescription('');
    setNote('');
    setApplyDeductionIds([]);
  }, [open, employee, defaultCashRegisterId]);

  useEffect(() => {
    if (open) setApplyDeductionIds(pendingDeductions.map((d) => d.id));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, deductionsData]);

  const baseNumber = Number(amount) || 0;
  const bonusesNumber = Number(bonuses) || 0;
  const benefitsNumber = Number(benefitsInKind) || 0;
  // Brut = base + primes + avantages. Aligne sur la regle backend.
  const grossNumber = baseNumber + bonusesNumber + benefitsNumber;
  const deductionsTotal = pendingDeductions
    .filter((d) => applyDeductionIds.includes(d.id))
    .reduce((sum, d) => sum + Number(d.amount), 0);

  // Si payslip deja existant pour la periode, le net est fige et les retenues
  // ont deja ete appliquees au 1er versement -- on affiche le reste a payer.
  const isInstallmentMode = !!currentPayslip;
  const fixedNet = currentPayslip ? Number(currentPayslip.netSalary) : 0;
  const alreadyPaid = currentPayslip ? Number(currentPayslip.paidAmount) : 0;
  const remaining = isInstallmentMode
    ? Math.max(0, fixedNet - alreadyPaid)
    : Math.max(0, grossNumber - deductionsTotal);

  const installmentNumber = installmentAmount ? Number(installmentAmount) : remaining;
  const willBeFullyPaid = isInstallmentMode
    ? alreadyPaid + installmentNumber >= fixedNet
    : installmentNumber >= grossNumber - deductionsTotal;

  const mutation = useMutation({
    mutationFn: () =>
      apiClient.post(`/employees/${employee!.id}/pay`, {
        period,
        amount: Number(amount),
        bonuses: bonusesNumber || undefined,
        benefitsInKind: benefitsNumber || undefined,
        bonusesLabel: bonusesLabel || undefined,
        installmentAmount: installmentAmount ? Number(installmentAmount) : undefined,
        cashRegisterId: cashRegisterId || undefined,
        description: description || undefined,
        note: note || undefined,
        paymentMethod,
        applyDeductionIds,
      }),
    onSuccess: (res: any) => {
      const data = res?.data?.data;
      if (data?.isFullyPaid) {
        toast.success('Salaire integralement paye');
      } else {
        toast.success(`Versement ${formatAmount(data?.installmentAmount ?? 0)} enregistre. Reste : ${formatAmount(data?.remainingAmount ?? 0)}`);
      }
      qc.invalidateQueries({ queryKey: ['employees'] });
      qc.invalidateQueries({ queryKey: ['cash-register'] });
      qc.invalidateQueries({ queryKey: ['employees', employee?.id, 'payslips'] });
      // Ouvre automatiquement le bulletin de paie genere/mis a jour pour
      // que l'utilisateur puisse l'imprimer / l'envoyer a l'employe.
      const payslipId = data?.payslip?.id;
      if (payslipId) {
        fetchPdfAuthed(`/employees/payslips/${payslipId}/pdf`, { mode: 'open' }).catch(() => {});
      }
      onClose();
    },
    onError: (e: any) => toast.error(e?.response?.data?.message || 'Echec du paiement'),
  });

  const cashOptions = (cashRegisters ?? []).map((cr) => ({
    value: cr.id,
    label: `${cr.agency?.name ?? 'Agence'} - ${formatDate(cr.date)} (${formatAmount(Number(cr.isClosed ? cr.closingBalance ?? cr.currentBalance : cr.currentBalance))})${cr.isClosed ? ' [fermee]' : ''}`,
  }));

  const isInactive = employee?.isActive === false;

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
            disabled={
              isInactive ||
              installmentNumber <= 0 ||
              installmentNumber > remaining ||
              (!isInstallmentMode && grossNumber <= 0)
            }
          >
            {willBeFullyPaid ? 'Confirmer (solde)' : 'Verser tranche'}
          </AppButton>
        </>
      }
    >
      <div className="space-y-3">
        {isInactive && (
          <div className="rounded-xl border border-red-200 bg-red-50 p-3 text-xs text-red-700">
            Employe inactif (contrat rompu). Paiement impossible.
          </div>
        )}

        <p className="text-xs text-gray-500">
          Chaque versement debite la caisse choisie, cree une depense + un bon de decaissement et
          alimente le payslip de la periode. Plusieurs versements possibles jusqu&apos;au solde
          (avance avant date de salaire, fractionnement si caisse insuffisante).
        </p>

        <div className="grid grid-cols-2 gap-3">
          <MonthYearPicker label="Periode" value={period} onChange={setPeriod} />
          <AppInput
            label={isInstallmentMode ? 'Salaire base (fige)' : 'Salaire base'}
            type="number"
            step="0.01"
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            disabled={isInstallmentMode}
          />
        </div>

        {!isInstallmentMode && (
          <div className="grid grid-cols-2 gap-3">
            <AppInput
              label="Primes / bonus (optionnel)"
              type="number"
              step="0.01"
              value={bonuses}
              onChange={(e) => setBonuses(e.target.value)}
              placeholder="0"
            />
            <AppInput
              label="Avantages en nature (optionnel)"
              type="number"
              step="0.01"
              value={benefitsInKind}
              onChange={(e) => setBenefitsInKind(e.target.value)}
              placeholder="0"
            />
            {bonusesNumber > 0 && (
              <div className="col-span-2">
                <AppInput
                  label="Libelle prime (pour bulletin)"
                  value={bonusesLabel}
                  onChange={(e) => setBonusesLabel(e.target.value)}
                  placeholder="Ex: prime productivite, anciennete..."
                />
              </div>
            )}
          </div>
        )}

        {isInstallmentMode && currentPayslip && (
          <div className="rounded-xl border border-primary-100 bg-primary-50/50 p-3 text-sm">
            <p className="mb-2 text-xs font-semibold text-primary-900">
              Payslip {period} deja existant ({currentPayslip.payments?.length ?? 0} versement(s))
            </p>
            <div className="flex justify-between"><span>Net total</span><span className="font-mono">{formatAmount(fixedNet)}</span></div>
            <div className="flex justify-between text-green-700"><span>Deja paye</span><span className="font-mono">{formatAmount(alreadyPaid)}</span></div>
            <div className="mt-1 flex justify-between border-t border-primary-100 pt-1 font-bold text-primary-900">
              <span>Reste a payer</span><span className="font-mono">{formatAmount(remaining)}</span>
            </div>
          </div>
        )}

        {!isInstallmentMode && pendingDeductions.length > 0 && (
          <div className="rounded-xl border border-amber-200 bg-amber-50 p-3">
            <p className="mb-2 text-xs font-medium text-amber-900">
              Retenues a appliquer ({pendingDeductions.length}) -- appliquees au 1er versement
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

        {!isInstallmentMode && (
          <div className="rounded-xl bg-primary-50 p-3 text-sm">
            <div className="flex items-center justify-between">
              <span className="text-gray-600">Salaire base</span>
              <span className="font-mono">{formatAmount(baseNumber)}</span>
            </div>
            {bonusesNumber > 0 && (
              <div className="flex items-center justify-between text-green-700">
                <span>+ Primes {bonusesLabel ? `(${bonusesLabel})` : ''}</span>
                <span className="font-mono">+{formatAmount(bonusesNumber)}</span>
              </div>
            )}
            {benefitsNumber > 0 && (
              <div className="flex items-center justify-between text-green-700">
                <span>+ Avantages</span>
                <span className="font-mono">+{formatAmount(benefitsNumber)}</span>
              </div>
            )}
            <div className="flex items-center justify-between border-t border-primary-100 pt-1">
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
              <span>Net total a payer</span>
              <span className="font-mono">{formatAmount(remaining)}</span>
            </div>
          </div>
        )}

        <AppInput
          label={`Tranche a verser maintenant (max ${formatAmount(remaining)})`}
          type="number"
          step="0.01"
          value={installmentAmount}
          onChange={(e) => setInstallmentAmount(e.target.value)}
          placeholder={`Laisser vide pour solder (${formatAmount(remaining)})`}
        />
        {installmentNumber > 0 && installmentNumber < remaining && (
          <p className="text-xs text-amber-700">
            Paiement partiel : reste {formatAmount(remaining - installmentNumber)} a verser plus tard.
          </p>
        )}

        <AppSelect
          label="Caisse a debiter"
          options={cashOptions}
          value={cashRegisterId}
          onValueChange={setCashRegisterId}
          placeholder="Caisse du jour de l'agence de l'employe (defaut)"
        />
        <AppSelect
          label="Mode de paiement"
          value={paymentMethod}
          onValueChange={setPaymentMethod}
          options={[
            { value: 'CASH', label: 'Especes' },
            { value: 'BANK_TRANSFER', label: 'Virement bancaire' },
            { value: 'MOBILE_MONEY', label: 'Mobile Money' },
            { value: 'CARD', label: 'Carte' },
            { value: 'CHECK', label: 'Cheque' },
          ]}
        />
        <AppInput
          label="Note (motif, contexte) - sera trace sur le versement"
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
