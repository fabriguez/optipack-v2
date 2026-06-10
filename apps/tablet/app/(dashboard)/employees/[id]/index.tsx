import { useCallback, useEffect, useState } from 'react';
import { View, Text, ScrollView, Pressable, ActivityIndicator, RefreshControl, Switch, TextInput } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useLocalSearchParams, useRouter, useFocusEffect } from 'expo-router';
import { useMutation, useQuery } from '@tanstack/react-query';
import { formatAmount, formatDate } from '@transitsoftservices/shared';
import { AppTabs, type TabItem } from '@/components/ui/AppTabs';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { HeaderAction } from '@/components/data/PageHeader';
import { SectionCard, InfoCard } from '@/components/data/DetailCards';
import { ConfirmDialog } from '@/components/ui/ConfirmDialog';
import { usePullRefresh } from '@/lib/hooks/usePullRefresh';
import { employeesApi } from '@/lib/api/employees';
import { toast } from '@/lib/toast';
import { extractApiError } from '@/lib/api/errorMessage';
import { colors } from '@/lib/theme/colors';
import { spacing, radius } from '@/lib/theme/spacing';
import { EmployeeFormDialog } from '../EmployeeFormDialog';
import { AttendanceTab, LeavesTab, PayslipsTab, DocumentsTab, DisciplineTab } from './EmployeeTabs';

const ic = (n: keyof typeof Ionicons.glyphMap) => <Ionicons name={n} size={15} color={colors.gray[500]} />;

function Row({ label, value }: { label: string; value?: string | null }) {
  return (
    <View style={{ flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 8, borderBottomWidth: 1, borderBottomColor: colors.gray[50] }}>
      <Text style={{ fontSize: 13, color: colors.gray[500] }}>{label}</Text>
      <Text style={{ fontSize: 13, color: colors.gray[900], fontWeight: '500' }}>{value || '-'}</Text>
    </View>
  );
}

function ProfileTab({ e }: { e: any }) {
  return (
    <View style={{ gap: spacing.xl }}>
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: spacing.md }}>
        <InfoCard icon="briefcase-outline" label="Poste" value={`${e.position ?? '-'}${e.contractType ? ` · ${e.contractType}` : ''}`} />
        <InfoCard icon="card-outline" label="Salaire de base" value={formatAmount(Number(e.baseSalary ?? 0))} />
        <InfoCard icon="business-outline" label="Agence" value={e.agency?.name ?? '-'} />
      </View>
      <SectionCard title="Informations">
        <Row label="Nom complet" value={e.fullName} />
        <Row label="Telephone" value={e.phone} />
        <Row label="Matricule" value={e.idNumber} />
        <Row label="Date d'entree" value={e.startDate ? formatDate(e.startDate) : undefined} />
        <Row label="Niveau d'etude" value={e.educationLevel} />
        <Row label="Specialite" value={e.specialty} />
        <Row label="Superieur" value={e.manager?.fullName} />
      </SectionCard>
      {(e.emergencyContactName || e.emergencyContactPhone) && (
        <SectionCard title="Contact d'urgence">
          <Row label="Nom" value={e.emergencyContactName} />
          <Row label="Telephone" value={e.emergencyContactPhone} />
          <Row label="Lien" value={e.emergencyContactRelation} />
        </SectionCard>
      )}
    </View>
  );
}

const DAYS = ['Dim', 'Lun', 'Mar', 'Mer', 'Jeu', 'Ven', 'Sam'];

function ShiftsTab({ id }: { id: string }) {
  const { data } = useQuery({ queryKey: ['employees', id, 'shifts'], queryFn: () => employeesApi.shifts(id), enabled: !!id });
  const [shifts, setShifts] = useState<any[]>([]);
  const save = useMutation({ mutationFn: () => employeesApi.saveShifts(id, shifts), onSuccess: () => toast.success('Planning enregistre'), onError: (e) => toast.error(extractApiError(e, 'Erreur')) });
  useEffect(() => {
    const raw: any[] = data?.data ?? [];
    setShifts(Array.from({ length: 7 }, (_, d) => {
      const f = raw.find((s) => Number(s.dayOfWeek) === d);
      return f ? { dayOfWeek: d, isWorking: !!f.isWorking, startTime: f.startTime ?? '08:00', endTime: f.endTime ?? '17:00' } : { dayOfWeek: d, isWorking: d >= 1 && d <= 5, startTime: '08:00', endTime: '17:00' };
    }));
  }, [data]);
  const upd = (i: number, p: any) => setShifts((prev) => prev.map((s, idx) => (idx === i ? { ...s, ...p } : s)));

  return (
    <SectionCard title="Planning hebdomadaire" subtitle="Surcharge les horaires de l'agence" action={<Button size="sm" loading={save.isPending} onPress={() => save.mutate()}>Enregistrer</Button>}>
      {shifts.map((s, i) => (
        <View key={i} style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.md, paddingVertical: spacing.sm, borderBottomWidth: i < 6 ? 1 : 0, borderBottomColor: colors.gray[100] }}>
          <Text style={{ width: 50, fontSize: 14, fontWeight: '500', color: colors.gray[800] }}>{DAYS[s.dayOfWeek]}</Text>
          <Switch value={s.isWorking} onValueChange={(v) => upd(i, { isWorking: v })} trackColor={{ true: colors.primary[400], false: colors.gray[300] }} thumbColor={colors.white} />
          {s.isWorking ? (
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.sm, flex: 1 }}>
              <TimeBox value={s.startTime} onChange={(v) => upd(i, { startTime: v })} /><Text style={{ color: colors.gray[400] }}>-</Text><TimeBox value={s.endTime} onChange={(v) => upd(i, { endTime: v })} />
            </View>
          ) : <Text style={{ flex: 1, fontSize: 13, color: colors.gray[400] }}>Repos</Text>}
        </View>
      ))}
    </SectionCard>
  );
}

function TimeBox({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  return <TextInput value={value} onChangeText={onChange} placeholder="08:00" placeholderTextColor={colors.gray[400]} style={{ width: 80, height: 38, borderWidth: 1, borderColor: colors.gray[300], borderRadius: radius.md, paddingHorizontal: spacing.md, fontSize: 14, color: colors.gray[900], textAlign: 'center' }} />;
}

export default function EmployeeDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const empId = String(id);
  const router = useRouter();
  const { data, isLoading, refetch } = useQuery({ queryKey: ['employees', empId], queryFn: () => employeesApi.getById(empId), enabled: !!empId });
  const { refreshing, onRefresh } = usePullRefresh(refetch);
  const [showEdit, setShowEdit] = useState(false);
  const [showResend, setShowResend] = useState(false);
  const [tabKey, setTabKey] = useState(0);
  useFocusEffect(useCallback(() => { setTabKey((k) => k + 1); }, []));

  const e = data?.data;
  const resend = useMutation({ mutationFn: () => employeesApi.resendCredentials(empId), onSuccess: () => { toast.success('Identifiants envoyes'); setShowResend(false); }, onError: (err) => toast.error(extractApiError(err, 'Erreur')) });

  if (isLoading) return <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}><ActivityIndicator size="large" color={colors.primary[500]} /></View>;
  if (!e) return <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', padding: spacing['3xl'] }}><Text style={{ color: colors.gray[500] }}>Employe introuvable</Text></View>;

  const active = e.isActive !== false;
  const tabs: TabItem[] = [
    { value: 'profile', label: 'Profil', icon: ic('person-circle-outline'), content: <ProfileTab e={e} /> },
    { value: 'documents', label: 'Documents', icon: ic('document-text-outline'), content: <DocumentsTab id={empId} /> },
    { value: 'shifts', label: 'Planning', icon: ic('time-outline'), content: <ShiftsTab id={empId} /> },
    { value: 'attendance', label: 'Pointage', icon: ic('list-outline'), content: <AttendanceTab id={empId} /> },
    { value: 'leaves', label: 'Conges', icon: ic('airplane-outline'), content: <LeavesTab id={empId} /> },
    { value: 'discipline', label: 'Discipline', icon: ic('alert-circle-outline'), content: <DisciplineTab id={empId} isActive={active} /> },
    { value: 'payslips', label: 'Bulletins', icon: ic('receipt-outline'), content: <PayslipsTab id={empId} name={e.fullName} /> },
  ];

  return (
    <View style={{ flex: 1, backgroundColor: 'transparent' }}>
      <ScrollView style={{ flex: 1 }} contentContainerStyle={{ padding: spacing['2xl'], gap: spacing.xl }} keyboardShouldPersistTaps="handled" refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.primary[500]} />}>
        <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: spacing.lg }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.lg, flex: 1 }}>
            <Pressable onPress={() => router.navigate('/employees')} style={({ pressed }) => ({ width: 40, height: 40, borderRadius: 12, alignItems: 'center', justifyContent: 'center', backgroundColor: pressed ? colors.gray[100] : 'transparent' })}>
              <Ionicons name="arrow-back" size={22} color={colors.gray[600]} />
            </Pressable>
            <View style={{ flex: 1 }}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.sm, flexWrap: 'wrap' }}>
                <Text style={{ fontSize: 22, fontWeight: '700', color: colors.gray[900] }}>{e.fullName}</Text>
                <Badge variant={active ? 'success' : 'error'}>{active ? 'Actif' : 'Inactif'}</Badge>
                {e.isAgencyManager && <Badge variant="info">Chef d'agence</Badge>}
              </View>
              <Text style={{ fontSize: 13, color: colors.gray[500], marginTop: 2 }}>{e.position ?? ''}</Text>
            </View>
          </View>
          {active && (
            <View style={{ flexDirection: 'row', gap: spacing.sm }}>
              <HeaderAction label="Identifiants" icon="mail-outline" variant="outline" onPress={() => setShowResend(true)} />
              <HeaderAction label="Modifier" icon="create-outline" variant="outline" onPress={() => setShowEdit(true)} />
            </View>
          )}
        </View>

        {!active && (
          <View style={{ backgroundColor: '#FFEBEE', borderWidth: 1, borderColor: '#FFCDD2', borderRadius: radius.md, padding: spacing.lg }}>
            <Text style={{ fontSize: 14, fontWeight: '600', color: colors.error }}>Contrat rompu</Text>
            {!!e.termination?.reason && <Text style={{ fontSize: 13, color: colors.error, marginTop: 4 }}>Motif: {e.termination.reason}</Text>}
          </View>
        )}

        <AppTabs key={tabKey} tabs={tabs} />
      </ScrollView>

      <EmployeeFormDialog open={showEdit} onClose={() => setShowEdit(false)} employee={e} />
      <ConfirmDialog open={showResend} onClose={() => setShowResend(false)} onConfirm={() => resend.mutate()} title="Envoyer les identifiants" message="Un nouveau mot de passe sera genere et envoye a l'employe." confirmLabel="Envoyer" loading={resend.isPending} />
    </View>
  );
}
