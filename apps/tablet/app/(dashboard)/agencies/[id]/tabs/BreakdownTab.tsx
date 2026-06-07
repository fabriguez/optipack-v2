import { useState } from 'react';
import { View, Text, TextInput } from 'react-native';
import { formatAmount } from '@transitsoftservices/shared';
import { AppDataTable, type Column } from '@/components/data/AppDataTable';
import { SectionCard, StatCard, EmptyState } from '../_components';
import { Button } from '@/components/ui/Button';
import { useAgencyBreakdown } from '@/lib/hooks/useAgencyDetail';
import { colors } from '@/lib/theme/colors';
import { radius, spacing } from '@/lib/theme/spacing';

function isoDaysAgo(days: number): string {
  const d = new Date();
  d.setDate(d.getDate() - days);
  return d.toISOString().slice(0, 10);
}

export function BreakdownTab({ agencyId }: { agencyId: string }) {
  const [from, setFrom] = useState(isoDaysAgo(30));
  const [to, setTo] = useState(isoDaysAgo(0));
  const [applied, setApplied] = useState({ from: isoDaysAgo(30), to: isoDaysAgo(0) });

  const { data, isLoading } = useAgencyBreakdown(agencyId, applied.from, applied.to);
  const bd = data?.data ?? data;

  const quick = (days: number) => {
    const f = isoDaysAgo(days);
    const t = isoDaysAgo(0);
    setFrom(f);
    setTo(t);
    setApplied({ from: f, to: t });
  };

  const routeColumns: Column<any>[] = [
    { key: 'routeName', label: 'Route', width: 200 },
    { key: 'count', label: 'Nb', width: 80, align: 'center' },
    { key: 'total', label: 'Total', width: 150, align: 'right', render: (r) => <Text style={{ fontWeight: '700', color: colors.primary[700] }}>{formatAmount(Number(r.total))}</Text> },
  ];

  const categoryColumns: Column<any>[] = [
    { key: 'category', label: 'Categorie', width: 220 },
    { key: 'count', label: 'Nb', width: 80, align: 'center' },
    { key: 'total', label: 'Total', width: 150, align: 'right', render: (r) => <Text style={{ fontWeight: '700', color: colors.error }}>{formatAmount(Number(r.total))}</Text> },
  ];

  return (
    <View style={{ gap: spacing.xl }}>
      <SectionCard title="Periode" action={<Button size="sm" onPress={() => setApplied({ from, to })}>Appliquer</Button>}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.md, flexWrap: 'wrap' }}>
          <DateBox value={from} onChange={setFrom} />
          <Text style={{ color: colors.gray[400] }}>au</Text>
          <DateBox value={to} onChange={setTo} />
          <View style={{ flexDirection: 'row', gap: spacing.sm }}>
            <Button size="sm" variant="outline" onPress={() => quick(7)}>7j</Button>
            <Button size="sm" variant="outline" onPress={() => quick(30)}>30j</Button>
            <Button size="sm" variant="outline" onPress={() => quick(90)}>90j</Button>
          </View>
        </View>
      </SectionCard>

      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: spacing.md }}>
        <StatCard label="Total paiements" value={formatAmount(Number(bd?.paymentsTotal ?? 0))} color={colors.primary[700]} />
        <StatCard label="Total decaissements" value={formatAmount(Number(bd?.disbursementsTotal ?? 0))} color={colors.error} />
      </View>

      <SectionCard title="Paiements par route">
        {isLoading ? (
          <EmptyState text="Chargement..." />
        ) : (
          <AppDataTable columns={routeColumns} data={bd?.paymentsByRouteAndMethod ?? []} emptyMessage="Aucune donnee" />
        )}
      </SectionCard>

      <SectionCard title="Entrees par route">
        <AppDataTable columns={routeColumns} data={bd?.entriesByRoute ?? []} emptyMessage="Aucune donnee" />
      </SectionCard>

      <SectionCard title="Decaissements par categorie">
        <AppDataTable columns={categoryColumns} data={bd?.disbursementsByCategory ?? []} emptyMessage="Aucune donnee" />
      </SectionCard>
    </View>
  );
}

function DateBox({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  return (
    <TextInput
      value={value}
      onChangeText={onChange}
      placeholder="AAAA-MM-JJ"
      placeholderTextColor={colors.gray[400]}
      style={{ width: 130, height: 40, borderWidth: 1, borderColor: colors.gray[300], borderRadius: radius.md, paddingHorizontal: spacing.md, fontSize: 14, color: colors.gray[900] }}
    />
  );
}
