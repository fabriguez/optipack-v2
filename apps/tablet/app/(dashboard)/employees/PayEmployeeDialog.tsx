import { useEffect, useState } from 'react';
import { View, Text, Pressable } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { formatAmount } from '@transitsoftservices/shared';
import { AppDialog } from '@/components/forms/AppDialog';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { employeesApi } from '@/lib/api/employees';
import { toast } from '@/lib/toast';
import { extractApiError } from '@/lib/api/errorMessage';
import { colors } from '@/lib/theme/colors';
import { radius, spacing } from '@/lib/theme/spacing';

const METHODS = [{ v: 'CASH', l: 'Especes' }, { v: 'BANK_TRANSFER', l: 'Virement' }, { v: 'MOBILE_MONEY', l: 'Mobile Money' }, { v: 'CARD', l: 'Carte' }, { v: 'CHECK', l: 'Cheque' }];
const curMonth = () => new Date().toISOString().slice(0, 7);

export function PayEmployeeDialog({ open, onClose, employee }: { open: boolean; onClose: () => void; employee: any | null }) {
  const qc = useQueryClient();
  const [period, setPeriod] = useState(curMonth());
  const [amount, setAmount] = useState('');
  const [bonuses, setBonuses] = useState('');
  const [benefits, setBenefits] = useState('');
  const [method, setMethod] = useState('CASH');
  const [note, setNote] = useState('');
  const [installment, setInstallment] = useState('');
  const [selectedDed, setSelectedDed] = useState<Set<string>>(new Set());

  const { data: dedData } = useQuery({ queryKey: ['employees', employee?.id, 'deductions'], queryFn: () => employeesApi.deductions(employee.id), enabled: open && !!employee?.id });
  const pendingDed: any[] = (dedData?.data ?? []).filter((d: any) => d.status === 'PENDING');

  useEffect(() => {
    if (open && employee) { setPeriod(curMonth()); setAmount(String(employee.baseSalary ?? '')); setBonuses(''); setBenefits(''); setMethod('CASH'); setNote(''); setInstallment(''); setSelectedDed(new Set(pendingDed.map((d) => d.id))); }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, employee]);

  const pay = useMutation({
    mutationFn: () => employeesApi.pay(employee.id, { period, amount: Number(amount) || 0, bonuses: Number(bonuses) || undefined, benefitsInKind: Number(benefits) || undefined, installmentAmount: installment ? Number(installment) : undefined, paymentMethod: method, note: note || undefined, applyDeductionIds: Array.from(selectedDed) }),
    onSuccess: (res: any) => { qc.invalidateQueries({ queryKey: ['employees'] }); const r = res?.data ?? res; toast.success(r?.isFullyPaid ? 'Salaire integralement paye' : 'Versement enregistre'); onClose(); },
    onError: (e) => toast.error(extractApiError(e, 'Erreur')),
  });

  const gross = (Number(amount) || 0) + (Number(bonuses) || 0) + (Number(benefits) || 0);
  const dedTotal = pendingDed.filter((d) => selectedDed.has(d.id)).reduce((s, d) => s + Number(d.amount ?? 0), 0);
  const net = gross - dedTotal;

  if (!employee) return null;
  return (
    <AppDialog open={open} onClose={onClose} title={`Payer ${employee.fullName}`} width={520}
      footer={<><Button variant="ghost" onPress={onClose}>Annuler</Button><Button loading={pay.isPending} disabled={!(gross > 0) || employee.isActive === false} onPress={() => pay.mutate()}>Verser</Button></>}>
      <View style={{ flexDirection: 'row', gap: spacing.md }}>
        <View style={{ flex: 1 }}><Input label="Periode (AAAA-MM)" value={period} onChangeText={setPeriod} /></View>
        <View style={{ flex: 1 }}><Input label="Salaire de base" value={amount} onChangeText={setAmount} keyboardType="decimal-pad" /></View>
      </View>
      <View style={{ flexDirection: 'row', gap: spacing.md }}>
        <View style={{ flex: 1 }}><Input label="Primes" value={bonuses} onChangeText={setBonuses} keyboardType="decimal-pad" /></View>
        <View style={{ flex: 1 }}><Input label="Avantages" value={benefits} onChangeText={setBenefits} keyboardType="decimal-pad" /></View>
      </View>
      <Input label="Tranche a verser (vide = solder)" value={installment} onChangeText={setInstallment} keyboardType="decimal-pad" />

      {pendingDed.length > 0 && (
        <View style={{ gap: spacing.sm }}>
          <Text style={{ fontSize: 13, fontWeight: '500', color: colors.gray[700] }}>Retenues a appliquer</Text>
          {pendingDed.map((d) => {
            const on = selectedDed.has(d.id);
            return (
              <Pressable key={d.id} onPress={() => setSelectedDed((prev) => { const n = new Set(prev); on ? n.delete(d.id) : n.add(d.id); return n; })} style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.sm }}>
                <Ionicons name={on ? 'checkbox' : 'square-outline'} size={20} color={on ? colors.primary[600] : colors.gray[400]} />
                <Text style={{ flex: 1, fontSize: 13, color: colors.gray[700] }}>{d.reason}</Text>
                <Text style={{ fontSize: 13, color: colors.error }}>-{formatAmount(Number(d.amount ?? 0))}</Text>
              </Pressable>
            );
          })}
        </View>
      )}

      <Text style={{ fontSize: 13, fontWeight: '500', color: colors.gray[700] }}>Mode</Text>
      <View style={{ flexDirection: 'row', gap: spacing.sm, flexWrap: 'wrap' }}>
        {METHODS.map((m) => <Pressable key={m.v} onPress={() => setMethod(m.v)} style={{ paddingVertical: 7, paddingHorizontal: spacing.lg, borderRadius: radius.full, borderWidth: 1, borderColor: method === m.v ? colors.primary[400] : colors.gray[300], backgroundColor: method === m.v ? colors.primary[50] : colors.white }}><Text style={{ fontSize: 13, fontWeight: '600', color: method === m.v ? colors.primary[700] : colors.gray[600] }}>{m.l}</Text></Pressable>)}
      </View>
      <Input label="Note (optionnel)" value={note} onChangeText={setNote} multiline />

      <View style={{ backgroundColor: colors.gray[50], borderRadius: radius.md, padding: spacing.md, gap: 2 }}>
        <Text style={{ fontSize: 12, color: colors.gray[500] }}>Brut: {formatAmount(gross)}{dedTotal > 0 ? ` · Retenues: -${formatAmount(dedTotal)}` : ''}</Text>
        <Text style={{ fontSize: 16, fontWeight: '700', color: colors.gray[900] }}>Net a payer: {formatAmount(net)}</Text>
      </View>
    </AppDialog>
  );
}
