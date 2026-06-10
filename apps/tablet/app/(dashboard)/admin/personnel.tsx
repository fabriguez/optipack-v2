import { useState } from 'react';
import { View, Text, ScrollView, Pressable } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { formatDate } from '@transitsoftservices/shared';
import { AppTabs, type TabItem } from '@/components/ui/AppTabs';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { PageHeader } from '@/components/data/PageHeader';
import { SectionCard, EmptyState } from '@/components/data/DetailCards';
import { AppDialog } from '@/components/forms/AppDialog';
import { ConfirmDialog } from '@/components/ui/ConfirmDialog';
import { positionsApi, permissionsApi, workSchedulesApi, holidaysApi } from '@/lib/api/hr';
import { toast } from '@/lib/toast';
import { extractApiError } from '@/lib/api/errorMessage';
import { colors } from '@/lib/theme/colors';
import { spacing } from '@/lib/theme/spacing';

const ic = (n: keyof typeof Ionicons.glyphMap) => <Ionicons name={n} size={15} color={colors.gray[500]} />;

function PositionsTab() {
  const qc = useQueryClient();
  const { data } = useQuery({ queryKey: ['positions'], queryFn: () => positionsApi.list() });
  const { data: permData } = useQuery({ queryKey: ['permissions'], queryFn: () => permissionsApi.list() });
  const positions: any[] = data?.data ?? [];
  const allPerms: any[] = permData?.data ?? permData ?? [];
  const inv = () => qc.invalidateQueries({ queryKey: ['positions'] });

  const [showForm, setShowForm] = useState(false);
  const [edit, setEdit] = useState<any | null>(null);
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [permTarget, setPermTarget] = useState<any | null>(null);
  const [permKeys, setPermKeys] = useState<Set<string>>(new Set());
  const [toDelete, setToDelete] = useState<any | null>(null);

  const create = useMutation({ mutationFn: () => positionsApi.create({ name, description } as never), onSuccess: () => { inv(); setShowForm(false); toast.success('Poste cree'); }, onError: (e) => toast.error(extractApiError(e, 'Erreur')) });
  const update = useMutation({ mutationFn: () => positionsApi.update(edit.id, { name, description } as never), onSuccess: () => { inv(); setShowForm(false); toast.success('Poste mis a jour'); }, onError: (e) => toast.error(extractApiError(e, 'Erreur')) });
  const del = useMutation({ mutationFn: (id: string) => positionsApi.delete(id), onSuccess: () => { inv(); setToDelete(null); toast.success('Supprime'); }, onError: (e) => toast.error(extractApiError(e, 'Erreur')) });
  const savePerms = useMutation({ mutationFn: () => positionsApi.setPermissions(permTarget.id, Array.from(permKeys)), onSuccess: () => { inv(); setPermTarget(null); toast.success('Permissions enregistrees'); }, onError: (e) => toast.error(extractApiError(e, 'Erreur')) });

  const openCreate = () => { setEdit(null); setName(''); setDescription(''); setShowForm(true); };
  const openEdit = (p: any) => { setEdit(p); setName(p.name ?? ''); setDescription(p.description ?? ''); setShowForm(true); };
  const openPerms = (p: any) => { setPermTarget(p); setPermKeys(new Set((p.permissions ?? []).map((x: any) => x.key ?? x))); };

  return (
    <SectionCard title={`Postes (${positions.length})`} action={<Button size="sm" onPress={openCreate}>Nouveau poste</Button>}>
      {positions.length === 0 ? <EmptyState text="Aucun poste" /> : positions.map((p) => (
        <View key={p.id} style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.sm, paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: colors.gray[50] }}>
          <View style={{ flex: 1 }}>
            <Text style={{ fontSize: 14, fontWeight: '600', color: colors.gray[900] }}>{p.name}</Text>
            {!!p.description && <Text style={{ fontSize: 12, color: colors.gray[400] }}>{p.description}</Text>}
          </View>
          <Pressable onPress={() => openPerms(p)} hitSlop={6}><Ionicons name="key-outline" size={18} color={colors.gray[600]} /></Pressable>
          <Pressable onPress={() => openEdit(p)} hitSlop={6}><Ionicons name="create-outline" size={18} color={colors.gray[600]} /></Pressable>
          <Pressable onPress={() => setToDelete(p)} hitSlop={6}><Ionicons name="trash-outline" size={18} color={colors.error} /></Pressable>
        </View>
      ))}

      <AppDialog open={showForm} onClose={() => setShowForm(false)} title={edit ? 'Modifier le poste' : 'Nouveau poste'} width={440}
        footer={<><Button variant="ghost" onPress={() => setShowForm(false)}>Annuler</Button><Button loading={create.isPending || update.isPending} onPress={() => (edit ? update : create).mutate()}>{edit ? 'Enregistrer' : 'Creer'}</Button></>}>
        <Input label="Nom" value={name} onChangeText={setName} />
        <Input label="Description" value={description} onChangeText={setDescription} multiline />
      </AppDialog>

      <AppDialog open={!!permTarget} onClose={() => setPermTarget(null)} title={`Permissions - ${permTarget?.name ?? ''}`} width={520}
        footer={<><Button variant="ghost" onPress={() => setPermTarget(null)}>Annuler</Button><Button loading={savePerms.isPending} onPress={() => savePerms.mutate()}>Enregistrer</Button></>}>
        {allPerms.map((grp: any) => {
          const perms = grp.permissions ?? (grp.key ? [grp] : []);
          return (
            <View key={grp.group ?? grp.key} style={{ gap: 4, marginBottom: spacing.sm }}>
              {!!grp.group && <Text style={{ fontSize: 12, fontWeight: '700', color: colors.gray[500], textTransform: 'uppercase' }}>{grp.group}</Text>}
              {perms.map((pm: any) => {
                const on = permKeys.has(pm.key);
                return (
                  <Pressable key={pm.key} onPress={() => setPermKeys((prev) => { const n = new Set(prev); on ? n.delete(pm.key) : n.add(pm.key); return n; })} style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.sm, paddingVertical: 6 }}>
                    <Ionicons name={on ? 'checkbox' : 'square-outline'} size={20} color={on ? colors.primary[600] : colors.gray[400]} />
                    <Text style={{ flex: 1, fontSize: 13, color: colors.gray[700] }}>{pm.label ?? pm.key}</Text>
                  </Pressable>
                );
              })}
            </View>
          );
        })}
      </AppDialog>

      <ConfirmDialog open={!!toDelete} onClose={() => setToDelete(null)} onConfirm={() => toDelete && del.mutate(toDelete.id)} title="Supprimer le poste" message={`${toDelete?.name} sera supprime.`} confirmLabel="Supprimer" variant="destructive" />
    </SectionCard>
  );
}

function SchedulesTab() {
  const qc = useQueryClient();
  const { data } = useQuery({ queryKey: ['work-schedules'], queryFn: () => workSchedulesApi.list() });
  const schedules: any[] = data?.data ?? [];
  const [showForm, setShowForm] = useState(false);
  const [name, setName] = useState('');
  const create = useMutation({ mutationFn: () => workSchedulesApi.create({ name }), onSuccess: () => { qc.invalidateQueries({ queryKey: ['work-schedules'] }); setShowForm(false); setName(''); toast.success('Planning cree'); }, onError: (e) => toast.error(extractApiError(e, 'Erreur')) });
  const del = useMutation({ mutationFn: (id: string) => workSchedulesApi.delete(id), onSuccess: () => qc.invalidateQueries({ queryKey: ['work-schedules'] }) });

  return (
    <SectionCard title={`Plannings (${schedules.length})`} action={<Button size="sm" onPress={() => { setName(''); setShowForm(true); }}>Nouveau planning</Button>}>
      {schedules.length === 0 ? <EmptyState text="Aucun planning" /> : schedules.map((s) => (
        <View key={s.id} style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.sm, paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: colors.gray[50] }}>
          <View style={{ flex: 1 }}><Text style={{ fontSize: 14, fontWeight: '600', color: colors.gray[900] }}>{s.name}</Text>{!!s.description && <Text style={{ fontSize: 12, color: colors.gray[400] }}>{s.description}</Text>}</View>
          <Pressable onPress={() => del.mutate(s.id)} hitSlop={6}><Ionicons name="trash-outline" size={18} color={colors.error} /></Pressable>
        </View>
      ))}
      <AppDialog open={showForm} onClose={() => setShowForm(false)} title="Nouveau planning" width={420}
        footer={<><Button variant="ghost" onPress={() => setShowForm(false)}>Annuler</Button><Button loading={create.isPending} onPress={() => create.mutate()}>Creer</Button></>}>
        <Input label="Nom" value={name} onChangeText={setName} />
      </AppDialog>
    </SectionCard>
  );
}

function HolidaysTab() {
  const qc = useQueryClient();
  const { data } = useQuery({ queryKey: ['holidays'], queryFn: () => holidaysApi.list({ scope: 'ORG' as never }) });
  const holidays: any[] = data?.data ?? [];
  const [showForm, setShowForm] = useState(false);
  const [date, setDate] = useState('');
  const [label, setLabel] = useState('');
  const create = useMutation({ mutationFn: () => holidaysApi.create({ date, label, scope: 'ORG' } as never), onSuccess: () => { qc.invalidateQueries({ queryKey: ['holidays'] }); setShowForm(false); setDate(''); setLabel(''); toast.success('Jour ajoute'); }, onError: (e) => toast.error(extractApiError(e, 'Erreur')) });
  const del = useMutation({ mutationFn: (id: string) => holidaysApi.delete(id), onSuccess: () => qc.invalidateQueries({ queryKey: ['holidays'] }) });

  return (
    <SectionCard title={`Jours non ouvres (${holidays.length})`} action={<Button size="sm" onPress={() => { setDate(''); setLabel(''); setShowForm(true); }}>Ajouter</Button>}>
      {holidays.length === 0 ? <EmptyState text="Aucun jour" /> : holidays.map((h) => (
        <View key={h.id} style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.sm, paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: colors.gray[50] }}>
          <Badge>{h.date ? formatDate(h.date) : '-'}</Badge>
          <Text style={{ flex: 1, fontSize: 14, color: colors.gray[900] }}>{h.label}</Text>
          <Pressable onPress={() => del.mutate(h.id)} hitSlop={6}><Ionicons name="trash-outline" size={18} color={colors.error} /></Pressable>
        </View>
      ))}
      <AppDialog open={showForm} onClose={() => setShowForm(false)} title="Jour non ouvre" width={420}
        footer={<><Button variant="ghost" onPress={() => setShowForm(false)}>Annuler</Button><Button loading={create.isPending} disabled={!date || !label} onPress={() => create.mutate()}>Ajouter</Button></>}>
        <Input label="Date (AAAA-MM-JJ)" value={date} onChangeText={setDate} placeholder="2026-12-25" />
        <Input label="Libelle" value={label} onChangeText={setLabel} placeholder="Noel" />
      </AppDialog>
    </SectionCard>
  );
}

export default function AdminPersonnelScreen() {
  const router = useRouter();
  const tabs: TabItem[] = [
    { value: 'positions', label: 'Postes', icon: ic('briefcase-outline'), content: <PositionsTab /> },
    { value: 'schedules', label: 'Plannings', icon: ic('calendar-outline'), content: <SchedulesTab /> },
    { value: 'holidays', label: 'Jours non ouvres', icon: ic('close-circle-outline'), content: <HolidaysTab /> },
  ];
  return (
    <View style={{ flex: 1, backgroundColor: 'transparent' }}>
      <ScrollView style={{ flex: 1 }} contentContainerStyle={{ padding: spacing['2xl'], gap: spacing.xl }} keyboardShouldPersistTaps="handled">
        <PageHeader title="Administration RH" subtitle="Postes, plannings, jours non ouvres" left={<Pressable onPress={() => router.navigate('/admin')}><Ionicons name="arrow-back" size={22} color={colors.gray[600]} /></Pressable>} />
        <AppTabs tabs={tabs} />
      </ScrollView>
    </View>
  );
}
