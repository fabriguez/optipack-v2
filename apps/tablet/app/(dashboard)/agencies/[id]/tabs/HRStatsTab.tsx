import { useState } from 'react';
import { View, Text, TextInput } from 'react-native';
import { formatAmount } from '@transitsoftservices/shared';
import { AppDataTable, type Column } from '@/components/data/AppDataTable';
import { SectionCard, StatCard } from '../_components';
import { useAgencyHrStats } from '@/lib/hooks/useAgencyDetail';
import { colors } from '@/lib/theme/colors';
import { radius, spacing } from '@/lib/theme/spacing';

function currentMonth(): string {
  return new Date().toISOString().slice(0, 7);
}

export function HRStatsTab({ agencyId }: { agencyId: string }) {
  const [month, setMonth] = useState(currentMonth());
  const { data } = useAgencyHrStats(agencyId, month);
  const s = data?.data ?? data;

  const att = s?.attendance ?? {};
  const leaves = s?.leaves ?? {};
  const payroll = s?.payroll ?? {};

  const employeeColumns: Column<any>[] = [
    { key: 'fullName', label: 'Employe', width: 200 },
    { key: 'present', label: 'Present', width: 90, align: 'center' },
    { key: 'late', label: 'Retards', width: 90, align: 'center' },
    { key: 'absent', label: 'Absences', width: 100, align: 'center' },
    { key: 'onLeave', label: 'Conges', width: 90, align: 'center' },
    { key: 'lateMinutes', label: 'Min. retard', width: 110, align: 'center' },
    { key: 'overtimeMinutes', label: 'Heures sup (min)', width: 130, align: 'center' },
  ];

  return (
    <View style={{ gap: spacing.xl }}>
      <SectionCard title="Mois">
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.md }}>
          <TextInput
            value={month}
            onChangeText={setMonth}
            placeholder="AAAA-MM"
            placeholderTextColor={colors.gray[400]}
            style={{ width: 130, height: 40, borderWidth: 1, borderColor: colors.gray[300], borderRadius: radius.md, paddingHorizontal: spacing.md, fontSize: 14, color: colors.gray[900] }}
          />
          <Text style={{ fontSize: 13, color: colors.gray[400] }}>Periode : {s?.period ?? month}</Text>
        </View>
      </SectionCard>

      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: spacing.md }}>
        <StatCard label="Employes" value={String(s?.totalEmployees ?? 0)} />
        <StatCard label="Chefs" value={String(s?.managersCount ?? 0)} color={colors.primary[700]} />
        <StatCard label="Sanctions" value={String(s?.sanctionsCount ?? 0)} color={colors.error} />
        <StatCard label="Conges en attente" value={String(leaves?.pending ?? 0)} color={colors.warning} />
      </View>

      <SectionCard title="Pointage du mois">
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: spacing.md }}>
          <StatCard label="Presents" value={String(att?.present ?? 0)} color={colors.primary[600]} />
          <StatCard label="Retards" value={String(att?.late ?? 0)} color={colors.warning} />
          <StatCard label="Absents" value={String(att?.absent ?? 0)} color={colors.error} />
          <StatCard label="En conge" value={String(att?.onLeave ?? 0)} />
        </View>
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: spacing.md, marginTop: spacing.md }}>
          <StatCard label="Total retard (min)" value={String(att?.totalLateMinutes ?? 0)} />
          <StatCard label="Depart anticipe (min)" value={String(att?.totalEarlyDepartureMinutes ?? 0)} />
          <StatCard label="Heures sup (min)" value={String(att?.totalOvertimeMinutes ?? 0)} />
          <StatCard label="Sous-temps (min)" value={String(att?.totalUndertimeMinutes ?? 0)} />
        </View>
      </SectionCard>

      <SectionCard title="Masse salariale">
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: spacing.md }}>
          <StatCard label="Theorique" value={formatAmount(Number(payroll?.theoreticalMass ?? 0))} />
          <StatCard label="Paye" value={formatAmount(Number(payroll?.paid ?? 0))} color={colors.primary[600]} />
          <StatCard label="En attente" value={formatAmount(Number(payroll?.pending ?? 0))} color={colors.warning} />
        </View>
      </SectionCard>

      <SectionCard title="Par employe">
        <AppDataTable columns={employeeColumns} data={s?.byEmployee ?? []} emptyMessage="Aucune donnee" />
      </SectionCard>
    </View>
  );
}
