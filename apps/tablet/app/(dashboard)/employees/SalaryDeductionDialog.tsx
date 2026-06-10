import { useState } from 'react';
import { View, Text, Pressable } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { formatAmount } from '@transitsoftservices/shared';
import { AppDialog } from '@/components/forms/AppDialog';
import { Button } from '@/components/ui/Button';
import { Badge } from '@/components/ui/Badge';
import { Input } from '@/components/ui/Input';
import { employeesApi } from '@/lib/api/employees';
import { toast } from '@/lib/toast';
import { extractApiError } from '@/lib/api/errorMessage';
import { colors } from '@/lib/theme/colors';
import { radius, spacing } from '@/lib/theme/spacing';

const DED_VARIANT: Record<string, 'warning' | 'success' | 'default'> = { PENDING: 'warning', APPLIED: 'success', CANCELLED: 'default' };

export function SalaryDeductionDialog({ open, onClose, employee }: { open: boolean; onClose: () => void; employee: any | null }) {
  const qc = useQueryClient();
  const [amount, setAmount] = useState('');
  const [period, setPeriod] = useState('');
  const [reason, setReason] = useState('');

  const { data } = useQuery({ queryKey: ['employees', employee?.id, 'deductions'], queryFn: () => employeesApi.deductions(employee.id), enabled: open && !!employee?.id });
  const deductions: any[] = data?.data ?? [];

  const create = useMutation({
    mutationFn: () => employeesApi.createDeduction(employee.id, { amount: Number(amount) || 0, reason, period: period || undefined }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['employees', employee.id, 'deductions'] }); toast.success('Retenue creee'); setAmount(''); setPeriod(''); setReason(''); },
    onError: (e) => toast.error(extractApiError(e, 'Erreur')),
  });
  const cancel = useMutation({
    mutationFn: (dId: string) => employeesApi.cancelDeduction(dId, 'Annulation'),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['employees', employee.id, 'deductions'] }); toast.success('Retenue annulee'); },
    onError: (e) => toast.error(extractApiError(e, 'Erreur')),
  });

  if (!employee) return null;
  return (
    <AppDialog open={open} onClose={onClose} title={`Retenues - ${employee.fullName}`} width={520}
      footer={<Button variant="ghost" onPress={onClose}>Fermer</Button>}>
      <View style={{ flexDirection: 'row', gap: spacing.md }}>
        <View style={{ flex: 1 }}><Input label="Montant" value={amount} onChangeText={setAmount} keyboardType="decimal-pad" /></View>
        <View style={{ flex: 1 }}><Input label="Periode (AAAA-MM, opt)" value={period} onChangeText={setPeriod} /></View>
      </View>
      <Input label="Motif" value={reason} onChangeText={setReason} multiline />
      <Button loading={create.isPending} disabled={!(Number(amount) > 0) || reason.trim().length < 2} onPress={() => create.mutate()}>Ajouter la retenue</Button>

      <Text style={{ fontSize: 13, fontWeight: '600', color: colors.gray[700], marginTop: spacing.sm }}>Historique ({deductions.length})</Text>
      {deductions.map((d) => (
        <View key={d.id} style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.sm, backgroundColor: colors.gray[50], borderRadius: radius.md, padding: spacing.md }}>
          <View style={{ flex: 1 }}>
            <Text style={{ fontSize: 13, fontWeight: '600', color: colors.gray[900] }}>{formatAmount(Number(d.amount ?? 0))}</Text>
            <Text style={{ fontSize: 12, color: colors.gray[500] }}>{d.reason}</Text>
          </View>
          <Badge variant={DED_VARIANT[d.status] ?? 'default'}>{d.status}</Badge>
          {d.status === 'PENDING' && <Pressable onPress={() => cancel.mutate(d.id)} hitSlop={6}><Ionicons name="close-circle" size={18} color={colors.error} /></Pressable>}
        </View>
      ))}
    </AppDialog>
  );
}
