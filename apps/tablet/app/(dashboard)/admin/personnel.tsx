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
import { employeesApi } from '@/lib/api/employees';
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

function ExceptionsTab() {
  const qc = useQueryClient();
  const [search, setSearch] = useState('');
  const [selected, setSelected] = useState<any | null>(null);
  const [addKey, setAddKey] = useState('');
  const [addGranted, setAddGranted] = useState(true);
  const [addReason, setAddReason] = useState('');
  const [showAdd, setShowAdd] = useState(false);
  const [toRemove, setToRemove] = useState<{ userId: string; key: string } | null>(null);

  const { data: empData } = useQuery({ queryKey: ['employees', 'exceptions'], queryFn: () => employeesApi.list({ limit: 200 } as never) });
  const { data: permCatalog } = useQuery({ queryKey: ['permissions'], queryFn: () => permissionsApi.list() });
  const { data: userPerms } = useQuery({ queryKey: ['hr', 'permissions', 'user', selected?.id], queryFn: () => permissionsApi.forUser(selected!.id), enabled: !!selected?.id });

  const allEmployees: any[] = empData?.data?.data ?? empData?.data ?? [];
  const employees = search.trim()
    ? allEmployees.filter((e: any) => (e.fullName ?? '').toLowerCase().includes(search.toLowerCase()) || (e.idNumber ?? '').toLowerCase().includes(search.toLowerCase()))
    : allEmployees;
  const allPerms: any[] = permCatalog?.data ?? permCatalog ?? [];
  const overrides: any[] = userPerms?.data?.overrides ?? [];
  const effectiveKeys: string[] = userPerms?.data?.keys ?? [];

  const allPermKeys: string[] = allPerms.flatMap((g: any) => g.permissions ? g.permissions.map((p: any) => p.key) : (g.key ? [g.key] : []));

  const setOverride = useMutation({
    mutationFn: () => permissionsApi.setOverride(selected.id, addKey, addGranted, addReason || undefined),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['hr', 'permissions', 'user', selected?.id] }); setShowAdd(false); setAddKey(''); setAddReason(''); toast.success('Exception enregistree'); },
    onError: (e: any) => toast.error(extractApiError(e, 'Erreur')),
  });
  const removeOverride = useMutation({
    mutationFn: () => permissionsApi.removeOverride(toRemove!.userId, toRemove!.key),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['hr', 'permissions', 'user', selected?.id] }); setToRemove(null); toast.success('Exception supprimee'); },
    onError: (e: any) => toast.error(extractApiError(e, 'Erreur')),
  });

  return (
    <View style={{ gap: spacing.xl }}>
      <SectionCard title="Rechercher un employe">
        <Input label="Nom ou matricule" value={search} onChangeText={(t) => { setSearch(t); setSelected(null); }} placeholder="Tapez pour rechercher..." />
        {employees.length > 0 && !selected && (
          <View style={{ marginTop: spacing.sm, gap: 2 }}>
            {employees.slice(0, 8).map((emp) => (
              <Pressable key={emp.id} onPress={() => setSelected(emp)} style={({ pressed }) => ({ paddingVertical: 10, paddingHorizontal: spacing.sm, borderRadius: 8, backgroundColor: pressed ? colors.gray[50] : 'transparent', borderBottomWidth: 1, borderBottomColor: colors.gray[50] })}>
                <Text style={{ fontSize: 14, fontWeight: '500', color: colors.gray[900] }}>{emp.fullName}</Text>
                <Text style={{ fontSize: 12, color: colors.gray[400] }}>{emp.position ?? ''}</Text>
              </Pressable>
            ))}
          </View>
        )}
      </SectionCard>

      {!!selected && (
        <SectionCard
          title={`Exceptions — ${selected.fullName}`}
          subtitle={selected.position ?? ''}
          action={<Button size="sm" onPress={() => { setAddKey(''); setAddReason(''); setAddGranted(true); setShowAdd(true); }}>Ajouter</Button>}
        >
          {overrides.length === 0
            ? <EmptyState text="Aucune exception pour cet employe" />
            : overrides.map((ov: any) => (
              <View key={ov.permissionKey} style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.sm, paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: colors.gray[50] }}>
                <Ionicons name={ov.granted ? 'add-circle-outline' : 'remove-circle-outline'} size={18} color={ov.granted ? colors.primary[600] : colors.error} />
                <View style={{ flex: 1 }}>
                  <Text style={{ fontSize: 13, fontWeight: '500', color: colors.gray[900] }}>{ov.permissionKey}</Text>
                  {!!ov.reason && <Text style={{ fontSize: 12, color: colors.gray[400] }}>{ov.reason}</Text>}
                </View>
                <Badge variant={ov.granted ? 'success' : 'error'}>{ov.granted ? 'Accorde' : 'Refuse'}</Badge>
                <Pressable onPress={() => setToRemove({ userId: selected.id, key: ov.permissionKey })} hitSlop={6}>
                  <Ionicons name="trash-outline" size={18} color={colors.error} />
                </Pressable>
              </View>
            ))
          }

          {effectiveKeys.length > 0 && (
            <View style={{ marginTop: spacing.lg }}>
              <Text style={{ fontSize: 12, fontWeight: '700', color: colors.gray[500], textTransform: 'uppercase', marginBottom: spacing.sm }}>Permissions effectives</Text>
              <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: spacing.xs ?? 4 }}>
                {effectiveKeys.map((k) => <Badge key={k} variant="info">{k}</Badge>)}
              </View>
            </View>
          )}
        </SectionCard>
      )}

      <AppDialog open={showAdd} onClose={() => setShowAdd(false)} title="Ajouter une exception" width={480}
        footer={<><Button variant="ghost" onPress={() => setShowAdd(false)}>Annuler</Button><Button loading={setOverride.isPending} disabled={!addKey} onPress={() => setOverride.mutate()}>Enregistrer</Button></>}>
        <View style={{ gap: spacing.md }}>
          <Text style={{ fontSize: 13, color: colors.gray[600] }}>Choisissez une permission et si elle est accordee ou refusee pour {selected?.fullName}.</Text>
          <View>
            <Text style={{ fontSize: 12, color: colors.gray[500], marginBottom: 4 }}>Permission</Text>
            <View style={{ borderWidth: 1, borderColor: colors.gray[300], borderRadius: 8, maxHeight: 200 }}>
              <ScrollView>
                {allPermKeys.map((k) => (
                  <Pressable key={k} onPress={() => setAddKey(k)} style={({ pressed }) => ({ flexDirection: 'row', alignItems: 'center', gap: spacing.sm, paddingVertical: 10, paddingHorizontal: spacing.sm, backgroundColor: addKey === k ? colors.primary[50] : pressed ? colors.gray[50] : 'transparent', borderBottomWidth: 1, borderBottomColor: colors.gray[50] })}>
                    <Ionicons name={addKey === k ? 'radio-button-on' : 'radio-button-off'} size={16} color={addKey === k ? colors.primary[600] : colors.gray[400]} />
                    <Text style={{ fontSize: 13, color: colors.gray[900] }}>{k}</Text>
                  </Pressable>
                ))}
              </ScrollView>
            </View>
          </View>
          <View style={{ flexDirection: 'row', gap: spacing.sm }}>
            <Pressable onPress={() => setAddGranted(true)} style={{ flex: 1, flexDirection: 'row', alignItems: 'center', gap: spacing.sm, padding: spacing.sm, borderRadius: 8, borderWidth: 1, borderColor: addGranted ? colors.primary[500] : colors.gray[200], backgroundColor: addGranted ? colors.primary[50] : 'transparent' }}>
              <Ionicons name={addGranted ? 'checkbox' : 'square-outline'} size={18} color={addGranted ? colors.primary[600] : colors.gray[400]} />
              <Text style={{ fontSize: 13, color: addGranted ? colors.primary[700] : colors.gray[600] }}>Accorder</Text>
            </Pressable>
            <Pressable onPress={() => setAddGranted(false)} style={{ flex: 1, flexDirection: 'row', alignItems: 'center', gap: spacing.sm, padding: spacing.sm, borderRadius: 8, borderWidth: 1, borderColor: !addGranted ? colors.error : colors.gray[200], backgroundColor: !addGranted ? '#FFEBEE' : 'transparent' }}>
              <Ionicons name={!addGranted ? 'checkbox' : 'square-outline'} size={18} color={!addGranted ? colors.error : colors.gray[400]} />
              <Text style={{ fontSize: 13, color: !addGranted ? colors.error : colors.gray[600] }}>Refuser</Text>
            </Pressable>
          </View>
          <Input label="Raison (optionnel)" value={addReason} onChangeText={setAddReason} multiline />
        </View>
      </AppDialog>

      <ConfirmDialog open={!!toRemove} onClose={() => setToRemove(null)} onConfirm={() => removeOverride.mutate()} title="Supprimer l'exception" message={`Supprimer l'exception "${toRemove?.key}" pour cet employe ?`} confirmLabel="Supprimer" variant="destructive" loading={removeOverride.isPending} />
    </View>
  );
}

export default function AdminPersonnelScreen() {
  const router = useRouter();
  const tabs: TabItem[] = [
    { value: 'positions', label: 'Postes', icon: ic('briefcase-outline'), content: <PositionsTab /> },
    { value: 'schedules', label: 'Plannings', icon: ic('calendar-outline'), content: <SchedulesTab /> },
    { value: 'holidays', label: 'Jours non ouvres', icon: ic('close-circle-outline'), content: <HolidaysTab /> },
    { value: 'exceptions', label: 'Exceptions', icon: ic('key-outline'), content: <ExceptionsTab /> },
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
