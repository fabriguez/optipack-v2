import { useState } from 'react';
import { View, Text, ScrollView, RefreshControl, Pressable } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { useQuery } from '@tanstack/react-query';
import { formatAmount } from '@transitsoftservices/shared';
import { Card } from '@/components/ui/Card';
import { Badge } from '@/components/ui/Badge';
import { PageHeader, HeaderAction } from '@/components/data/PageHeader';
import { SearchBar } from '@/components/data/SearchBar';
import { ExportButton } from '@/components/data/ExportButton';
import { AgencyPicker } from '@/components/data/AgencyPicker';
import { AppDataTable, type Column } from '@/components/data/AppDataTable';
import { RowActions } from '@/components/data/RowActions';
import { ConfirmDialog } from '@/components/ui/ConfirmDialog';
import { Can } from '@/components/auth/Can';
import { useServerPagination } from '@/lib/hooks/useServerPagination';
import { employeesApi } from '@/lib/api/employees';
import { toast } from '@/lib/toast';
import { extractApiError } from '@/lib/api/errorMessage';
import { colors } from '@/lib/theme/colors';
import { spacing, radius } from '@/lib/theme/spacing';
import { EmployeeFormDialog } from './EmployeeFormDialog';
import { PayEmployeeDialog } from './PayEmployeeDialog';
import { SalaryDeductionDialog } from './SalaryDeductionDialog';

const exportColumns = [{ key: 'fullName', label: 'Nom' }, { key: 'position', label: 'Poste' }, { key: 'phone', label: 'Telephone' }, { key: 'baseSalary', label: 'Salaire' }];

export default function EmployeesScreen() {
  const router = useRouter();
  const { page, limit, search, setPage, setSearch, queryParams } = useServerPagination();
  const [status, setStatus] = useState<'active' | 'former'>('active');
  const [agency, setAgency] = useState({ id: '', name: '' });
  const [showCreate, setShowCreate] = useState(false);
  const [edit, setEdit] = useState<any | null>(null);
  const [pay, setPay] = useState<any | null>(null);
  const [deduct, setDeduct] = useState<any | null>(null);
  const [toDelete, setToDelete] = useState<any | null>(null);
  const [refreshing, setRefreshing] = useState(false);

  const { data, isLoading, refetch } = useQuery({ queryKey: ['employees', { ...queryParams, status, agencyId: agency.id }], queryFn: () => employeesApi.list({ ...queryParams, status, agencyId: agency.id || undefined } as any) });
  const rows: any[] = data?.data ?? [];
  const meta = data?.meta;
  const onRefresh = async () => { setRefreshing(true); await refetch(); setRefreshing(false); };

  const doDelete = async () => { if (!toDelete) return; try { await employeesApi.delete(toDelete.id); toast.success('Employe supprime'); refetch(); } catch (e) { toast.error(extractApiError(e, 'Erreur')); } setToDelete(null); };

  const columns: Column<any>[] = [
    { key: 'fullName', label: 'Nom complet', width: 200, render: (r) => <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}><Text style={{ fontSize: 14, fontWeight: '600', color: colors.primary[700] }}>{r.fullName}</Text>{r.isAgencyManager && <View style={{ backgroundColor: colors.primary[50], paddingHorizontal: 6, paddingVertical: 2, borderRadius: 6 }}><Text style={{ fontSize: 10, fontWeight: '700', color: colors.primary[700] }}>Chef</Text></View>}</View> },
    { key: 'agency', label: 'Agence', width: 140, render: (r) => <Text style={{ fontSize: 13 }}>{r.agency?.name ?? '-'}</Text> },
    { key: 'position', label: 'Poste', width: 140, render: (r) => <Text style={{ fontSize: 13 }}>{r.position ?? '-'}</Text> },
    { key: 'phone', label: 'Telephone', width: 140, render: (r) => <Text style={{ fontSize: 13 }}>{r.phone || '-'}</Text> },
    { key: 'baseSalary', label: 'Salaire', width: 140, align: 'right', render: (r) => <Text style={{ fontSize: 13, fontWeight: '600' }}>{formatAmount(Number(r.baseSalary ?? 0))}</Text> },
    { key: 'isActive', label: 'Statut', width: 100, render: (r) => <Badge variant={r.isActive === false ? 'error' : 'success'}>{r.isActive === false ? 'Inactif' : 'Actif'}</Badge> },
    { key: 'actions', label: '', width: 60, align: 'center', render: (r) => (
      <RowActions actions={[
        { label: 'Voir details', icon: <Ionicons name="eye-outline" size={18} color={colors.gray[700]} />, onPress: () => router.push(`/employees/${r.id}`) },
        { label: 'Modifier', icon: <Ionicons name="create-outline" size={18} color={colors.gray[700]} />, onPress: () => setEdit(r) },
        ...(r.isActive !== false ? [
          { label: 'Payer salaire', icon: <Ionicons name="card-outline" size={18} color={colors.gray[700]} />, onPress: () => setPay(r) },
          { label: 'Retenues', icon: <Ionicons name="remove-circle-outline" size={18} color={colors.gray[700]} />, onPress: () => setDeduct(r) },
          { label: 'Supprimer', icon: <Ionicons name="trash-outline" size={18} color={colors.error} />, onPress: () => setToDelete(r), variant: 'destructive' as const },
        ] : []),
      ]} />
    ) },
  ];

  return (
    <View style={{ flex: 1, backgroundColor: 'transparent' }}>
      <ScrollView style={{ flex: 1 }} contentContainerStyle={{ padding: spacing['2xl'], gap: spacing.xl }} keyboardShouldPersistTaps="handled" refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.primary[500]} />}>
        <PageHeader title="Personnel" subtitle={`${meta?.total ?? rows.length} employes`} actions={<Can permission="employee.manage"><HeaderAction label="Nouvel employe" icon="add" onPress={() => setShowCreate(true)} /></Can>} />
        <View style={{ flexDirection: 'row', gap: spacing.sm }}>
          {(['active', 'former'] as const).map((s) => <Pressable key={s} onPress={() => { setStatus(s); setPage(1); }} style={{ paddingVertical: 8, paddingHorizontal: spacing.lg, borderRadius: radius.md, backgroundColor: status === s ? colors.primary[50] : colors.gray[100] }}><Text style={{ fontSize: 13, fontWeight: '600', color: status === s ? colors.primary[700] : colors.gray[600] }}>{s === 'active' ? 'Actifs' : 'Anciens'}</Text></Pressable>)}
        </View>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.md }}>
          <View style={{ flex: 1 }}><SearchBar value={search} onChange={setSearch} placeholder="Rechercher un employe..." /></View>
          <ExportButton data={rows} columns={exportColumns} fileName="personnel" />
          <AgencyPicker value={agency.id} name={agency.name} onChange={(id, nm) => { setAgency({ id, name: nm }); setPage(1); }} />
        </View>
        <Card padding="sm">
          <AppDataTable columns={columns} data={rows} isLoading={isLoading} page={page} totalPages={meta?.totalPages ?? 1} total={meta?.total} limit={limit} onPageChange={setPage} onRowClick={(r) => router.push(`/employees/${r.id}`)} emptyMessage="Aucun employe" />
        </Card>
      </ScrollView>
      <EmployeeFormDialog open={showCreate} onClose={() => setShowCreate(false)} />
      <EmployeeFormDialog open={!!edit} onClose={() => setEdit(null)} employee={edit ?? undefined} />
      <PayEmployeeDialog open={!!pay} onClose={() => setPay(null)} employee={pay} />
      <SalaryDeductionDialog open={!!deduct} onClose={() => setDeduct(null)} employee={deduct} />
      <ConfirmDialog open={!!toDelete} onClose={() => setToDelete(null)} onConfirm={doDelete} title="Supprimer l'employe" message={`${toDelete?.fullName} sera supprime.`} confirmLabel="Supprimer" variant="destructive" />
    </View>
  );
}
