import { useState } from 'react';
import { View, Text } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { formatAmount } from '@transitsoftservices/shared';
import { SectionCard, EmptyState } from '@/components/data/DetailCards';
import { HeaderAction } from '@/components/data/PageHeader';
import { RowActions } from '@/components/data/RowActions';
import { AppDialog } from '@/components/forms/AppDialog';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { Badge } from '@/components/ui/Badge';
import { ConfirmDialog } from '@/components/ui/ConfirmDialog';
import { useWarehouseStorageRules, useStorageRuleMutations } from '@/lib/hooks/useWarehouses';
import { colors } from '@/lib/theme/colors';
import { spacing } from '@/lib/theme/spacing';

const emptyForm = { transitType: 'AIR', dailyRate: '', freeDays: '7', minWeight: '', maxWeight: '', minVolume: '', maxVolume: '', priority: '0' };

export function StorageRulesTab({ warehouseId }: { warehouseId: string }) {
  const { data } = useWarehouseStorageRules(warehouseId);
  const { create, update, remove } = useStorageRuleMutations(warehouseId);
  const [showForm, setShowForm] = useState(false);
  const [editId, setEditId] = useState<string | null>(null);
  const [form, setForm] = useState(emptyForm);
  const [toDelete, setToDelete] = useState<any | null>(null);

  const rules: any[] = data?.data ?? data ?? [];

  const openCreate = () => { setEditId(null); setForm(emptyForm); setShowForm(true); };
  const openEdit = (r: any) => {
    setEditId(r.id);
    setForm({
      transitType: r.transitType ?? 'AIR',
      dailyRate: String(r.dailyRate ?? ''),
      freeDays: String(r.freeDays ?? '0'),
      minWeight: r.minWeight != null ? String(r.minWeight) : '',
      maxWeight: r.maxWeight != null ? String(r.maxWeight) : '',
      minVolume: r.minVolume != null ? String(r.minVolume) : '',
      maxVolume: r.maxVolume != null ? String(r.maxVolume) : '',
      priority: String(r.priority ?? '0'),
    });
    setShowForm(true);
  };

  const submit = () => {
    const payload = {
      transitType: form.transitType.toUpperCase(),
      dailyRate: Number(form.dailyRate) || 0,
      freeDays: Number(form.freeDays) || 0,
      minWeight: form.minWeight ? Number(form.minWeight) : undefined,
      maxWeight: form.maxWeight ? Number(form.maxWeight) : undefined,
      minVolume: form.minVolume ? Number(form.minVolume) : undefined,
      maxVolume: form.maxVolume ? Number(form.maxVolume) : undefined,
      priority: Number(form.priority) || 0,
    };
    const onSuccess = () => { setShowForm(false); setEditId(null); setForm(emptyForm); };
    if (editId) update.mutate({ id: editId, data: payload }, { onSuccess });
    else create.mutate(payload, { onSuccess });
  };

  return (
    <SectionCard
      title="Frais de magasinage"
      subtitle="Tarif journalier x (jours - jours gratuits), par type de transit"
      action={<HeaderAction label="Nouvelle regle" icon="add" onPress={openCreate} />}
    >
      {rules.length === 0 ? (
        <EmptyState text="Aucune regle" />
      ) : (
        <View style={{ gap: spacing.sm }}>
          {rules.map((r) => (
            <View key={r.id} style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.md, backgroundColor: colors.gray[50], borderRadius: 12, padding: spacing.lg }}>
              <Badge>{r.transitType}</Badge>
              <View style={{ flex: 1 }}>
                <Text style={{ fontSize: 14, fontWeight: '600', color: colors.gray[900] }}>{formatAmount(Number(r.dailyRate ?? 0))} / jour</Text>
                <Text style={{ fontSize: 12, color: colors.gray[400] }}>
                  {r.freeDays ?? 0} jours gratuits
                  {r.minWeight != null || r.maxWeight != null ? ` · ${r.minWeight ?? 0}-${r.maxWeight ?? '∞'} kg` : ''}
                  {r.minVolume != null || r.maxVolume != null ? ` · ${r.minVolume ?? 0}-${r.maxVolume ?? '∞'} m³` : ''}
                </Text>
              </View>
              <RowActions actions={[
                { label: 'Modifier', icon: <Ionicons name="create-outline" size={18} color={colors.gray[700]} />, onPress: () => openEdit(r) },
                { label: 'Supprimer', icon: <Ionicons name="trash-outline" size={18} color={colors.error} />, onPress: () => setToDelete(r), variant: 'destructive' },
              ]} />
            </View>
          ))}
        </View>
      )}

      <AppDialog
        open={showForm}
        onClose={() => setShowForm(false)}
        title={editId ? 'Modifier la regle' : 'Nouvelle regle'}
        width={520}
        footer={
          <>
            <Button variant="ghost" onPress={() => setShowForm(false)}>Annuler</Button>
            <Button loading={create.isPending || update.isPending} onPress={submit}>{editId ? 'Enregistrer' : 'Creer'}</Button>
          </>
        }
      >
        <Input label="Type de transit" value={form.transitType} onChangeText={(v) => setForm((p) => ({ ...p, transitType: v.toUpperCase() }))} placeholder="AIR, SEA, LAND" />
        <View style={{ flexDirection: 'row', gap: spacing.md }}>
          <View style={{ flex: 1 }}><Input label="Tarif / jour" value={form.dailyRate} onChangeText={(v) => setForm((p) => ({ ...p, dailyRate: v }))} keyboardType="numeric" /></View>
          <View style={{ flex: 1 }}><Input label="Jours gratuits" value={form.freeDays} onChangeText={(v) => setForm((p) => ({ ...p, freeDays: v }))} keyboardType="numeric" /></View>
        </View>
        <View style={{ flexDirection: 'row', gap: spacing.md }}>
          <View style={{ flex: 1 }}><Input label="Masse min (kg)" value={form.minWeight} onChangeText={(v) => setForm((p) => ({ ...p, minWeight: v }))} keyboardType="numeric" /></View>
          <View style={{ flex: 1 }}><Input label="Masse max (kg)" value={form.maxWeight} onChangeText={(v) => setForm((p) => ({ ...p, maxWeight: v }))} keyboardType="numeric" /></View>
        </View>
        <View style={{ flexDirection: 'row', gap: spacing.md }}>
          <View style={{ flex: 1 }}><Input label="Volume min (m³)" value={form.minVolume} onChangeText={(v) => setForm((p) => ({ ...p, minVolume: v }))} keyboardType="numeric" /></View>
          <View style={{ flex: 1 }}><Input label="Volume max (m³)" value={form.maxVolume} onChangeText={(v) => setForm((p) => ({ ...p, maxVolume: v }))} keyboardType="numeric" /></View>
        </View>
      </AppDialog>

      <ConfirmDialog
        open={!!toDelete}
        onClose={() => setToDelete(null)}
        onConfirm={() => toDelete && remove.mutate(toDelete.id, { onSuccess: () => setToDelete(null) })}
        title="Supprimer la regle"
        message="Cette regle de magasinage sera supprimee."
        confirmLabel="Supprimer"
        variant="destructive"
        loading={remove.isPending}
      />
    </SectionCard>
  );
}
