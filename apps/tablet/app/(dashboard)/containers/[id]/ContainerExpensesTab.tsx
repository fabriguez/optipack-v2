import { useState } from 'react';
import { View, Text } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { formatAmount } from '@transitsoftservices/shared';
import { SectionCard, StatCard, EmptyState } from '@/components/data/DetailCards';
import { HeaderAction } from '@/components/data/PageHeader';
import { RowActions } from '@/components/data/RowActions';
import { AppDialog } from '@/components/forms/AppDialog';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { Badge } from '@/components/ui/Badge';
import { ConfirmDialog } from '@/components/ui/ConfirmDialog';
import { containersApi } from '@/lib/api/containers';
import { toast } from '@/lib/toast';
import { extractApiError } from '@/lib/api/errorMessage';
import { colors } from '@/lib/theme/colors';
import { radius, spacing } from '@/lib/theme/spacing';

const emptyForm = { title: '', reason: '', description: '', category: 'TRANSPORT', amount: '' };

export function ContainerExpensesTab({ containerId, isClosed, parcelCount }: { containerId: string; isClosed?: boolean; parcelCount?: number }) {
  const qc = useQueryClient();
  const { data } = useQuery({ queryKey: ['expenses', 'container', containerId], queryFn: () => containersApi.expenses(containerId), enabled: !!containerId });
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState(emptyForm);
  const [payTarget, setPayTarget] = useState<any | null>(null);
  const [payNote, setPayNote] = useState('');
  const [toDelete, setToDelete] = useState<any | null>(null);
  const [showClose, setShowClose] = useState(false);

  const expenses: any[] = data?.data ?? data ?? [];
  const invalidate = () => qc.invalidateQueries({ queryKey: ['expenses', 'container', containerId] });
  const toPay = expenses.filter((e) => !e.isPaid).reduce((s, e) => s + Number(e.amount ?? 0), 0);
  const paid = expenses.filter((e) => e.isPaid).reduce((s, e) => s + Number(e.amount ?? 0), 0);

  const create = useMutation({ mutationFn: () => containersApi.createExpense(containerId, { title: form.title, reason: form.reason, description: form.description || undefined, category: form.category, amount: Number(form.amount) || 0 }), onSuccess: () => { invalidate(); toast.success('Depense ajoutee'); setShowForm(false); setForm(emptyForm); }, onError: (e) => toast.error(extractApiError(e, 'Erreur')) });
  const pay = useMutation({ mutationFn: () => containersApi.payExpense(payTarget.id, { note: payNote || undefined }), onSuccess: () => { invalidate(); toast.success('Depense payee'); setPayTarget(null); setPayNote(''); }, onError: (e) => toast.error(extractApiError(e, 'Erreur')) });
  const del = useMutation({ mutationFn: () => containersApi.deleteExpense(toDelete.id), onSuccess: () => { invalidate(); toast.success('Supprimee'); setToDelete(null); }, onError: (e) => toast.error(extractApiError(e, 'Erreur')) });
  const close = useMutation({ mutationFn: () => containersApi.closeExpenses(containerId), onSuccess: () => { invalidate(); qc.invalidateQueries({ queryKey: ['containers', containerId] }); toast.success('Depenses cloturees'); setShowClose(false); }, onError: (e) => toast.error(extractApiError(e, 'Erreur')) });

  return (
    <View style={{ gap: spacing.xl }}>
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: spacing.md }}>
        <StatCard label="A payer" value={formatAmount(toPay)} color={colors.error} />
        <StatCard label="Paye" value={formatAmount(paid)} color={colors.primary[600]} />
        <StatCard label="Total" value={formatAmount(toPay + paid)} />
      </View>

      <SectionCard
        title="Depenses"
        action={
          !isClosed ? (
            <View style={{ flexDirection: 'row', gap: spacing.sm }}>
              <Button size="sm" variant="outline" disabled={(parcelCount ?? 0) > 0} onPress={() => setShowClose(true)}>Cloturer</Button>
              <HeaderAction label="Ajouter" icon="add" onPress={() => setShowForm(true)} />
            </View>
          ) : <Badge variant="success">Cloturees</Badge>
        }
      >
        {expenses.length === 0 ? (
          <EmptyState text="Aucune depense" />
        ) : (
          <View style={{ gap: spacing.sm }}>
            {expenses.map((e) => (
              <View key={e.id} style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.md, backgroundColor: colors.gray[50], borderRadius: radius.md, padding: spacing.lg }}>
                <View style={{ flex: 1 }}>
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
                    <Text style={{ fontSize: 14, fontWeight: '600', color: colors.gray[900] }}>{e.title}</Text>
                    <Badge variant={e.isPaid ? 'success' : 'warning'}>{e.isPaid ? 'Paye' : 'A payer'}</Badge>
                    {!!e.category && <Badge>{e.category}</Badge>}
                  </View>
                  {!!e.reason && <Text style={{ fontSize: 12, color: colors.gray[500] }}>{e.reason}</Text>}
                </View>
                <Text style={{ fontSize: 14, fontWeight: '700', color: colors.gray[900] }}>{formatAmount(Number(e.amount ?? 0))}</Text>
                {!e.isPaid && !e.isAutoFromForwarding && (
                  <RowActions actions={[
                    { label: 'Payer', icon: <Ionicons name="card-outline" size={18} color={colors.gray[700]} />, onPress: () => { setPayTarget(e); setPayNote(''); } },
                    { label: 'Supprimer', icon: <Ionicons name="trash-outline" size={18} color={colors.error} />, onPress: () => setToDelete(e), variant: 'destructive' },
                  ]} />
                )}
              </View>
            ))}
          </View>
        )}
      </SectionCard>

      <AppDialog open={showForm} onClose={() => setShowForm(false)} title="Nouvelle depense" width={480} footer={<><Button variant="ghost" onPress={() => setShowForm(false)}>Annuler</Button><Button loading={create.isPending} onPress={() => create.mutate()}>Enregistrer</Button></>}>
        <Input label="Titre" value={form.title} onChangeText={(v) => setForm((p) => ({ ...p, title: v }))} />
        <Input label="Motif" value={form.reason} onChangeText={(v) => setForm((p) => ({ ...p, reason: v }))} />
        <Input label="Categorie" value={form.category} onChangeText={(v) => setForm((p) => ({ ...p, category: v.toUpperCase() }))} placeholder="TRANSPORT, DOUANE..." />
        <Input label="Montant" value={form.amount} onChangeText={(v) => setForm((p) => ({ ...p, amount: v }))} keyboardType="numeric" />
        <Input label="Description" value={form.description} onChangeText={(v) => setForm((p) => ({ ...p, description: v }))} multiline />
      </AppDialog>

      <AppDialog open={!!payTarget} onClose={() => setPayTarget(null)} title={`Payer : ${payTarget?.title ?? ''}`} width={440} footer={<><Button variant="ghost" onPress={() => setPayTarget(null)}>Annuler</Button><Button loading={pay.isPending} onPress={() => pay.mutate()}>Payer depuis caisse</Button></>}>
        <Text style={{ fontSize: 14, fontWeight: '700', color: colors.gray[900] }}>{formatAmount(Number(payTarget?.amount ?? 0))}</Text>
        <Input label="Note (optionnelle)" value={payNote} onChangeText={setPayNote} />
      </AppDialog>

      <ConfirmDialog open={!!toDelete} onClose={() => setToDelete(null)} onConfirm={() => del.mutate()} title="Supprimer la depense" message={toDelete?.title ?? ''} confirmLabel="Supprimer" variant="destructive" loading={del.isPending} />
      <ConfirmDialog open={showClose} onClose={() => setShowClose(false)} onConfirm={() => close.mutate()} title="Cloturer les depenses" message="La cloture est irreversible." confirmLabel="Cloturer" loading={close.isPending} />
    </View>
  );
}
