import { useState } from 'react';
import { View, Text } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { formatAmount } from '@transitsoftservices/shared';
import { AppDataTable, type Column } from '@/components/data/AppDataTable';
import { RowActions } from '@/components/data/RowActions';
import { HeaderAction } from '@/components/data/PageHeader';
import { ExportButton } from '@/components/data/ExportButton';
import { SectionCard } from '../_components';
import { useAgencyEmployees, useEmployeeActions } from '@/lib/hooks/useAgencyDetail';
import { EmployeeFormDialog } from '../../../employees/EmployeeFormDialog';
import { colors } from '@/lib/theme/colors';
import { spacing } from '@/lib/theme/spacing';

const exportColumns = [
  { key: 'fullName', label: 'Nom' },
  { key: 'position', label: 'Poste' },
  { key: 'phone', label: 'Telephone' },
  { key: 'contractType', label: 'Contrat' },
  { key: 'baseSalary', label: 'Salaire' },
];

export function PersonnelTab({ agencyId }: { agencyId: string }) {
  const { data } = useAgencyEmployees(agencyId);
  const { setManagerFlag } = useEmployeeActions(agencyId);
  const [showCreate, setShowCreate] = useState(false);

  const employees = data?.data ?? [];

  const columns: Column<any>[] = [
    {
      key: 'fullName',
      label: 'Nom',
      width: 220,
      render: (r) => (
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
          <Text style={{ fontSize: 14, fontWeight: '500', color: colors.gray[900] }}>{r.fullName}</Text>
          {r.isAgencyManager && (
            <View style={{ backgroundColor: colors.primary[50], paddingHorizontal: 6, paddingVertical: 2, borderRadius: 6 }}>
              <Text style={{ fontSize: 10, fontWeight: '700', color: colors.primary[700] }}>Chef</Text>
            </View>
          )}
        </View>
      ),
    },
    { key: 'position', label: 'Poste', width: 150, render: (r) => <Text style={{ fontSize: 13 }}>{r.position ?? '-'}</Text> },
    { key: 'phone', label: 'Telephone', width: 150, render: (r) => <Text style={{ fontSize: 13 }}>{r.phone || '-'}</Text> },
    { key: 'contractType', label: 'Contrat', width: 110, render: (r) => <Text style={{ fontSize: 13 }}>{r.contractType || 'CDI'}</Text> },
    { key: 'baseSalary', label: 'Salaire', width: 140, render: (r) => <Text style={{ fontSize: 13, fontWeight: '600' }}>{formatAmount(Number(r.baseSalary ?? 0))}</Text> },
    {
      key: 'actions',
      label: '',
      width: 60,
      align: 'center',
      render: (r) => (
        <RowActions
          actions={[
            {
              label: r.isAgencyManager ? "Retirer chef d'agence" : "Promouvoir chef d'agence",
              icon: <Ionicons name="ribbon-outline" size={18} color={colors.gray[700]} />,
              onPress: () => setManagerFlag.mutate({ employeeId: r.id, value: !r.isAgencyManager }),
            },
          ]}
        />
      ),
    },
  ];

  return (
    <View style={{ gap: spacing.lg }}>
      <View style={{ flexDirection: 'row', justifyContent: 'flex-end', gap: spacing.sm }}>
        <ExportButton data={employees} columns={exportColumns} fileName="personnel" />
        <HeaderAction label="Ajouter employe" icon="add" onPress={() => setShowCreate(true)} />
      </View>

      <SectionCard title={`Employes (${employees.length})`}>
        <AppDataTable columns={columns} data={employees} emptyMessage="Aucun employe" />
      </SectionCard>

      <EmployeeFormDialog open={showCreate} onClose={() => setShowCreate(false)} />
    </View>
  );
}
