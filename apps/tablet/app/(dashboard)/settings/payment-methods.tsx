import { useState } from 'react';
import { View, Text, ScrollView, Pressable } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { PageHeader, HeaderAction } from '@/components/data/PageHeader';
import { SectionCard } from '@/components/data/DetailCards';
import { AppDialog } from '@/components/forms/AppDialog';
import { ConfirmDialog } from '@/components/ui/ConfirmDialog';
import { usePaymentMethods, useCreatePaymentMethod, useUpdatePaymentMethod, useDeletePaymentMethod } from '@/lib/hooks/usePaymentMethods';
import { colors } from '@/lib/theme/colors';
import { spacing } from '@/lib/theme/spacing';

export default function PaymentMethodsScreen() {
  const router = useRouter();
  const { data } = usePaymentMethods();
  const create = useCreatePaymentMethod();
  const update = useUpdatePaymentMethod();
  const del = useDeletePaymentMethod();
  const methods: any[] = data?.data ?? data ?? [];
  const [showForm, setShowForm] = useState(false);
  const [edit, setEdit] = useState<any | null>(null);
  const [label, setLabel] = useState('');
  const [sortOrder, setSortOrder] = useState('0');
  const [toDelete, setToDelete] = useState<any | null>(null);

  const openCreate = () => { setEdit(null); setLabel(''); setSortOrder('0'); setShowForm(true); };
  const openEdit = (m: any) => { setEdit(m); setLabel(m.label); setSortOrder(String(m.sortOrder ?? 0)); setShowForm(true); };
  const submit = () => {
    const code = edit ? edit.code : label.trim().toUpperCase().replace(/[^A-Z0-9]+/g, '_');
    const payload = { label: label.trim(), code, sortOrder: Number(sortOrder) || 0 } as never;
    const onSuccess = () => setShowForm(false);
    if (edit) update.mutate({ id: edit.id, data: payload } as never, { onSuccess });
    else create.mutate(payload, { onSuccess });
  };

  return (
    <View style={{ flex: 1, backgroundColor: 'transparent' }}>
      <ScrollView style={{ flex: 1 }} contentContainerStyle={{ padding: spacing['2xl'], gap: spacing.xl }}>
        <PageHeader title="Methodes de paiement" subtitle="Modes acceptes" left={<Pressable onPress={() => router.navigate('/settings')}><Ionicons name="arrow-back" size={22} color={colors.gray[600]} /></Pressable>} actions={<HeaderAction label="Nouvelle methode" icon="add" onPress={openCreate} />} />
        <SectionCard title={`Methodes (${methods.length})`}>
          {methods.map((m) => (
            <View key={m.id} style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.sm, paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: colors.gray[50] }}>
              <View style={{ flex: 1 }}>
                <Text style={{ fontSize: 14, fontWeight: '600', color: colors.gray[900] }}>{m.label}</Text>
                <Text style={{ fontFamily: 'monospace', fontSize: 11, color: colors.gray[400] }}>{m.code}</Text>
              </View>
              <Badge variant={m.isActive === false ? 'default' : 'success'}>{m.isActive === false ? 'Inactif' : 'Actif'}</Badge>
              {m.isSystem && <Badge variant="info">Systeme</Badge>}
              <Pressable onPress={() => openEdit(m)} hitSlop={6}><Ionicons name="create-outline" size={18} color={colors.gray[600]} /></Pressable>
              <Pressable onPress={() => update.mutate({ id: m.id, data: { isActive: !(m.isActive !== false) } } as never)} hitSlop={6}><Ionicons name={m.isActive === false ? 'power-outline' : 'power'} size={18} color={m.isActive === false ? colors.gray[400] : colors.primary[600]} /></Pressable>
              {!m.isSystem && <Pressable onPress={() => setToDelete(m)} hitSlop={6}><Ionicons name="trash-outline" size={18} color={colors.error} /></Pressable>}
            </View>
          ))}
        </SectionCard>
      </ScrollView>

      <AppDialog open={showForm} onClose={() => setShowForm(false)} title={edit ? 'Modifier la methode' : 'Nouvelle methode'} width={420}
        footer={<><Button variant="ghost" onPress={() => setShowForm(false)}>Annuler</Button><Button loading={create.isPending || update.isPending} onPress={submit}>{edit ? 'Enregistrer' : 'Creer'}</Button></>}>
        <Input label="Libelle" value={label} onChangeText={setLabel} placeholder="Ex: Orange Money" />
        <Input label="Ordre" value={sortOrder} onChangeText={setSortOrder} keyboardType="numeric" />
      </AppDialog>
      <ConfirmDialog open={!!toDelete} onClose={() => setToDelete(null)} onConfirm={() => toDelete && del.mutate(toDelete.id as never, { onSuccess: () => setToDelete(null) })} title="Supprimer" message={`Supprimer ${toDelete?.label} ?`} confirmLabel="Supprimer" variant="destructive" />
    </View>
  );
}
