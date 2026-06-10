import { useEffect, useState } from 'react';
import { Text } from 'react-native';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { AppDialog } from '@/components/forms/AppDialog';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { debtsApi } from '@/lib/api/finance';
import { toast } from '@/lib/toast';
import { extractApiError } from '@/lib/api/errorMessage';
import { radius, spacing } from '@/lib/theme/spacing';

export function AdjustDebtDialog({ open, onClose, debtId, currentTotalAmount, currentNextDueDate, currentDueDateFinal, onDone }: { open: boolean; onClose: () => void; debtId: string; currentTotalAmount: number; currentNextDueDate?: string | null; currentDueDateFinal?: string | null; onDone?: () => void }) {
  const qc = useQueryClient();
  const [newTotal, setNewTotal] = useState('');
  const [newNext, setNewNext] = useState('');
  const [newFinal, setNewFinal] = useState('');
  const [reason, setReason] = useState('');

  useEffect(() => { if (open) { setNewTotal(String(currentTotalAmount ?? '')); setNewNext((currentNextDueDate ?? '').slice(0, 10)); setNewFinal((currentDueDateFinal ?? '').slice(0, 10)); setReason(''); } }, [open, currentTotalAmount, currentNextDueDate, currentDueDateFinal]);

  const adjust = useMutation({
    mutationFn: () => debtsApi.adjust(debtId, { newTotalAmount: Number(newTotal) || 0, reason, newNextDueDate: newNext || undefined, newDueDateFinal: newFinal || undefined }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['debts', debtId] }); qc.invalidateQueries({ queryKey: ['debts'] }); toast.success('Dette ajustee'); onDone?.(); onClose(); },
    onError: (e) => toast.error(extractApiError(e, 'Erreur')),
  });

  return (
    <AppDialog open={open} onClose={onClose} title="Ajuster la dette" width={460}
      footer={<><Button variant="ghost" onPress={onClose}>Annuler</Button><Button loading={adjust.isPending} disabled={reason.trim().length < 5} onPress={() => adjust.mutate()}>Appliquer</Button></>}>
      <Text style={{ fontSize: 12, color: '#8D6E00', backgroundColor: '#FFF8E1', borderRadius: radius.md, padding: spacing.md }}>Le delta est trace dans l'historique. Refus si nouveau montant inferieur au deja paye.</Text>
      <Input label="Nouveau montant total" value={newTotal} onChangeText={setNewTotal} keyboardType="decimal-pad" />
      <Input label="Nouvelle prochaine echeance (AAAA-MM-JJ)" value={newNext} onChangeText={setNewNext} placeholder="2026-12-31" />
      <Input label="Nouvelle echeance finale (AAAA-MM-JJ)" value={newFinal} onChangeText={setNewFinal} placeholder="2026-12-31" />
      <Input label="Motif (requis, min 5)" value={reason} onChangeText={setReason} multiline />
    </AppDialog>
  );
}
