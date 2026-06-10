import { useEffect, useState } from 'react';
import { View, Text, Pressable } from 'react-native';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { formatAmount } from '@transitsoftservices/shared';
import { AppDialog } from '@/components/forms/AppDialog';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { EntityPicker } from '@/components/data/EntityPicker';
import { debtsApi } from '@/lib/api/finance';
import { searchers } from '@/lib/api/searchers';
import { toast } from '@/lib/toast';
import { extractApiError } from '@/lib/api/errorMessage';
import { colors } from '@/lib/theme/colors';
import { radius, spacing } from '@/lib/theme/spacing';

const METHODS = [{ v: 'CASH', l: 'Especes' }, { v: 'MOBILE_MONEY', l: 'Mobile Money' }, { v: 'BANK_TRANSFER', l: 'Virement' }, { v: 'CARD', l: 'Carte' }, { v: 'CHECK', l: 'Cheque' }];

export function DebtPaymentDialog({ open, onClose, debtId, remainingAmount, defaultAgencyId, onDone }: { open: boolean; onClose: () => void; debtId: string; remainingAmount: number; defaultAgencyId?: string; onDone?: () => void }) {
  const qc = useQueryClient();
  const [amount, setAmount] = useState('');
  const [method, setMethod] = useState('CASH');
  const [agency, setAgency] = useState({ id: '', name: '' });
  const [txRef, setTxRef] = useState('');
  const [comment, setComment] = useState('');

  useEffect(() => { if (open) { setAmount(''); setMethod('CASH'); setAgency({ id: defaultAgencyId ?? '', name: '' }); setTxRef(''); setComment(''); } }, [open, defaultAgencyId]);

  const record = useMutation({
    mutationFn: () => debtsApi.recordPayment(debtId, { amount: Number(amount) || 0, paymentMethod: method, agencyId: agency.id, transactionReference: txRef || undefined, comment: comment || undefined }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['debts', debtId] }); qc.invalidateQueries({ queryKey: ['debts'] }); toast.success('Paiement enregistre'); onDone?.(); onClose(); },
    onError: (e) => toast.error(extractApiError(e, 'Erreur')),
  });

  return (
    <AppDialog open={open} onClose={onClose} title="Enregistrer un paiement" width={480}
      footer={<><Button variant="ghost" onPress={onClose}>Annuler</Button><Button loading={record.isPending} disabled={!agency.id || !(Number(amount) > 0)} onPress={() => record.mutate()}>Enregistrer</Button></>}>
      <View style={{ backgroundColor: colors.gray[50], borderRadius: radius.md, padding: spacing.md }}>
        <Text style={{ fontSize: 13, color: colors.gray[500] }}>Solde restant: <Text style={{ fontWeight: '700', color: colors.error }}>{formatAmount(remainingAmount)}</Text></Text>
      </View>
      <Input label="Montant *" value={amount} onChangeText={setAmount} keyboardType="decimal-pad" placeholder={`Max ${remainingAmount}`} />
      <Text style={{ fontSize: 13, fontWeight: '500', color: colors.gray[700] }}>Mode de paiement *</Text>
      <View style={{ flexDirection: 'row', gap: spacing.sm, flexWrap: 'wrap' }}>
        {METHODS.map((m) => <Pressable key={m.v} onPress={() => setMethod(m.v)} style={{ paddingVertical: 7, paddingHorizontal: spacing.lg, borderRadius: radius.full, borderWidth: 1, borderColor: method === m.v ? colors.primary[400] : colors.gray[300], backgroundColor: method === m.v ? colors.primary[50] : colors.white }}><Text style={{ fontSize: 13, fontWeight: '600', color: method === m.v ? colors.primary[700] : colors.gray[600] }}>{m.l}</Text></Pressable>)}
      </View>
      <View style={{ gap: 4 }}><Text style={{ fontSize: 13, fontWeight: '500', color: colors.gray[700] }}>Agence encaisseuse *</Text><EntityPicker value={agency.id} name={agency.name} onChange={(id, name) => setAgency({ id, name })} searcher={searchers.agencies} queryKey="agencies" placeholder="Agence..." /></View>
      <Input label="Reference transaction (optionnel)" value={txRef} onChangeText={setTxRef} />
      <Input label="Commentaire (optionnel)" value={comment} onChangeText={setComment} multiline />
    </AppDialog>
  );
}
