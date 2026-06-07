import { useState } from 'react';
import { View, Text, TextInput } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { formatAmount } from '@transitsoftservices/shared';
import { SectionCard, StatCard, EmptyState } from '../_components';
import { HeaderAction } from '@/components/data/PageHeader';
import { RowActions } from '@/components/data/RowActions';
import { AppDialog } from '@/components/forms/AppDialog';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { Badge } from '@/components/ui/Badge';
import { ConfirmDialog } from '@/components/ui/ConfirmDialog';
import { useAgencyCharges, useChargeMutations } from '@/lib/hooks/useAgencyDetail';
import { colors } from '@/lib/theme/colors';
import { radius, spacing } from '@/lib/theme/spacing';

function currentMonth(): string {
  return new Date().toISOString().slice(0, 7);
}

const STATUS_VARIANT: Record<string, 'success' | 'warning' | 'error'> = {
  PAID: 'success',
  PARTIAL: 'warning',
  UNPAID: 'error',
};

export function ChargesTab({ agencyId }: { agencyId: string }) {
  const [period, setPeriod] = useState(currentMonth());
  const { data } = useAgencyCharges(agencyId, period);
  const { create, remove, pay } = useChargeMutations(agencyId, period);

  const [showCreate, setShowCreate] = useState(false);
  const [payTarget, setPayTarget] = useState<any | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<any | null>(null);
  const [form, setForm] = useState({ type: 'OTHER', label: '', amount: '' });
  const [payAmount, setPayAmount] = useState('');

  const payload = data?.data ?? data;
  const totals = payload?.totals ?? {};
  const items: any[] = payload?.items ?? [];

  const submitCreate = () => {
    create.mutate(
      { type: form.type, label: form.label, defaultAmount: Number(form.amount) || 0 },
      { onSuccess: () => { setShowCreate(false); setForm({ type: 'OTHER', label: '', amount: '' }); } },
    );
  };

  const submitPay = () => {
    if (!payTarget) return;
    pay.mutate(
      { id: payTarget.id, data: { amount: Number(payAmount) || 0, period, description: `Paiement ${payTarget.label}` } },
      { onSuccess: () => { setPayTarget(null); setPayAmount(''); } },
    );
  };

  return (
    <View style={{ gap: spacing.xl }}>
      <SectionCard
        title="Charges"
        subtitle={`Periode ${period}`}
        action={<HeaderAction label="Ajouter" icon="add" onPress={() => setShowCreate(true)} />}
      >
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.md, marginBottom: spacing.lg }}>
          <TextInput
            value={period}
            onChangeText={setPeriod}
            placeholder="AAAA-MM"
            placeholderTextColor={colors.gray[400]}
            style={{ width: 130, height: 40, borderWidth: 1, borderColor: colors.gray[300], borderRadius: radius.md, paddingHorizontal: spacing.md, fontSize: 14, color: colors.gray[900] }}
          />
        </View>

        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: spacing.md, marginBottom: spacing.lg }}>
          <StatCard label="Attendu" value={formatAmount(Number(totals?.expected ?? 0))} />
          <StatCard label="Paye" value={formatAmount(Number(totals?.paid ?? 0))} color={colors.primary[600]} />
          <StatCard label="Solde" value={formatAmount(Number(totals?.balance ?? 0))} color={colors.error} />
        </View>

        {items.length === 0 ? (
          <EmptyState text="Aucune charge" />
        ) : (
          <View style={{ gap: spacing.sm }}>
            {items.map((c) => (
              <View key={c.id} style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.md, backgroundColor: colors.gray[50], borderRadius: radius.md, padding: spacing.lg }}>
                <View style={{ width: 36, height: 36, borderRadius: radius.sm, backgroundColor: colors.primary[50], alignItems: 'center', justifyContent: 'center' }}>
                  <Ionicons name="receipt-outline" size={18} color={colors.primary[600]} />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={{ fontSize: 14, fontWeight: '600', color: colors.gray[900] }}>{c.label}</Text>
                  <Text style={{ fontSize: 12, color: colors.gray[400] }}>
                    {formatAmount(Number(c.paidAmount ?? 0))} / {formatAmount(Number(c.defaultAmount ?? 0))}
                  </Text>
                </View>
                <Badge variant={STATUS_VARIANT[c.status] ?? 'default'}>{c.status}</Badge>
                <RowActions
                  actions={[
                    { label: 'Payer', icon: <Ionicons name="card-outline" size={18} color={colors.gray[700]} />, onPress: () => { setPayTarget(c); setPayAmount(String(c.balance ?? '')); } },
                    { label: 'Supprimer', icon: <Ionicons name="trash-outline" size={18} color={colors.error} />, onPress: () => setDeleteTarget(c), variant: 'destructive' },
                  ]}
                />
              </View>
            ))}
          </View>
        )}
      </SectionCard>

      {/* Create */}
      <AppDialog
        open={showCreate}
        onClose={() => setShowCreate(false)}
        title="Nouvelle charge"
        width={460}
        footer={
          <>
            <Button variant="ghost" onPress={() => setShowCreate(false)}>Annuler</Button>
            <Button loading={create.isPending} onPress={submitCreate}>Creer</Button>
          </>
        }
      >
        <Input label="Type" value={form.type} onChangeText={(v) => setForm((p) => ({ ...p, type: v.toUpperCase() }))} placeholder="WATER, ELECTRICITY, RENT, OTHER..." />
        <Input label="Libelle" value={form.label} onChangeText={(v) => setForm((p) => ({ ...p, label: v }))} placeholder="Ex: Loyer mensuel" />
        <Input label="Montant" value={form.amount} onChangeText={(v) => setForm((p) => ({ ...p, amount: v }))} placeholder="0" keyboardType="numeric" />
      </AppDialog>

      {/* Pay */}
      <AppDialog
        open={!!payTarget}
        onClose={() => setPayTarget(null)}
        title={`Payer : ${payTarget?.label ?? ''}`}
        width={420}
        footer={
          <>
            <Button variant="ghost" onPress={() => setPayTarget(null)}>Annuler</Button>
            <Button loading={pay.isPending} onPress={submitPay}>Payer</Button>
          </>
        }
      >
        <Input label="Montant" value={payAmount} onChangeText={setPayAmount} placeholder="0" keyboardType="numeric" />
      </AppDialog>

      <ConfirmDialog
        open={!!deleteTarget}
        onClose={() => setDeleteTarget(null)}
        onConfirm={() => deleteTarget && remove.mutate(deleteTarget.id, { onSuccess: () => setDeleteTarget(null) })}
        title="Supprimer la charge"
        message={`Supprimer "${deleteTarget?.label}" ?`}
        confirmLabel="Supprimer"
        variant="destructive"
        loading={remove.isPending}
      />
    </View>
  );
}
