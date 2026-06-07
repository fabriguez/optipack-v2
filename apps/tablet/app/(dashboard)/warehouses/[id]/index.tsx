import { useCallback, useState } from 'react';
import { View, Text, ScrollView, Pressable, ActivityIndicator, RefreshControl } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useLocalSearchParams, useRouter, useFocusEffect } from 'expo-router';
import { useQueryClient } from '@tanstack/react-query';
import { formatAmount, formatDate } from '@transitsoftservices/shared';
import { AppTabs, type TabItem } from '@/components/ui/AppTabs';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { HeaderAction } from '@/components/data/PageHeader';
import { AppDataTable, type Column } from '@/components/data/AppDataTable';
import { SectionCard, StatCard } from '@/components/data/DetailCards';
import { useWarehouse, useWarehouseSummary, useWarehouseInventories, useStartInventory } from '@/lib/hooks/useWarehouses';
import { colors } from '@/lib/theme/colors';
import { spacing, radius } from '@/lib/theme/spacing';
import { WarehouseFormDialog } from '../WarehouseFormDialog';
import { SpacesTab } from './SpacesTab';
import { StorageRulesTab } from './StorageRulesTab';
import { WarehouseParcelsTab } from './WarehouseParcelsTab';

const ic = (name: keyof typeof Ionicons.glyphMap) => <Ionicons name={name} size={15} color={colors.gray[500]} />;

const INV_VARIANT: Record<string, 'warning' | 'success' | 'error'> = { IN_PROGRESS: 'warning', CLOSED: 'success', CANCELLED: 'error' };

export default function WarehouseDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const warehouseId = String(id);
  const router = useRouter();
  const qc = useQueryClient();
  const { data, isLoading, refetch } = useWarehouse(warehouseId);
  const { data: summaryData } = useWarehouseSummary(warehouseId);
  const [showEdit, setShowEdit] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [tabKey, setTabKey] = useState(0);
  useFocusEffect(useCallback(() => { setTabKey((k) => k + 1); }, []));

  const wh = data?.data;
  const summary = summaryData?.data ?? summaryData;

  const onRefresh = async () => {
    setRefreshing(true);
    try {
      await Promise.all([
        refetch(),
        qc.invalidateQueries({ queryKey: ['warehouses', warehouseId] }),
        qc.invalidateQueries({ queryKey: ['parcels', 'warehouse', warehouseId] }),
      ]);
    } finally {
      setRefreshing(false);
    }
  };

  if (isLoading) {
    return <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}><ActivityIndicator size="large" color={colors.primary[500]} /></View>;
  }
  if (!wh) {
    return <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', padding: spacing['3xl'] }}><Text style={{ color: colors.gray[500] }}>Magasin introuvable</Text></View>;
  }

  const tabs: TabItem[] = [
    { value: 'overview', label: "Vue d'ensemble", icon: ic('cube-outline'), content: <OverviewTab summary={summary} /> },
    { value: 'parcels', label: 'Colis', icon: ic('file-tray-stacked-outline'), content: <WarehouseParcelsTab warehouseId={warehouseId} agencyId={wh.agencyId ?? wh.agency?.id} /> },
    { value: 'spaces', label: 'Zones', icon: ic('grid-outline'), content: <SpacesTab warehouseId={warehouseId} /> },
    { value: 'rules', label: 'Regles', icon: ic('wallet-outline'), content: <StorageRulesTab warehouseId={warehouseId} /> },
    { value: 'inventories', label: 'Inventaires', icon: ic('clipboard-outline'), content: <InventoriesTab warehouseId={warehouseId} /> },
  ];

  return (
    <View style={{ flex: 1, backgroundColor: 'transparent' }}>
      <ScrollView
        style={{ flex: 1 }}
        contentContainerStyle={{ padding: spacing['2xl'], gap: spacing.xl }}
        keyboardShouldPersistTaps="handled"
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.primary[500]} />}
      >
        <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: spacing.lg }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.lg, flex: 1 }}>
            <Pressable onPress={() => router.navigate('/warehouses')} style={({ pressed }) => ({ width: 40, height: 40, borderRadius: 12, alignItems: 'center', justifyContent: 'center', backgroundColor: pressed ? colors.gray[100] : 'transparent' })}>
              <Ionicons name="arrow-back" size={22} color={colors.gray[600]} />
            </Pressable>
            <View style={{ width: 52, height: 52, borderRadius: radius.lg, backgroundColor: colors.primary[50], alignItems: 'center', justifyContent: 'center' }}>
              <Ionicons name="business" size={26} color={colors.primary[600]} />
            </View>
            <View style={{ flex: 1 }}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.sm, flexWrap: 'wrap' }}>
                <Text style={{ fontSize: 24, fontWeight: '700', color: colors.gray[900] }}>{wh.name}</Text>
                <Badge variant={wh.isActive === false ? 'error' : 'success'}>{wh.isActive === false ? 'Inactif' : 'Actif'}</Badge>
              </View>
              <Text style={{ fontSize: 13, color: colors.gray[500], marginTop: 2 }}>{[wh.location, wh.agency?.name].filter(Boolean).join(' · ')}</Text>
            </View>
          </View>
          <HeaderAction label="Modifier" icon="create-outline" variant="outline" onPress={() => setShowEdit(true)} />
        </View>

        <AppTabs key={tabKey} tabs={tabs} />
      </ScrollView>

      <WarehouseFormDialog open={showEdit} onClose={() => setShowEdit(false)} warehouse={wh} />
    </View>
  );
}

function OverviewTab({ summary }: { summary: any }) {
  const totals = summary?.totals ?? {};
  const catColumns: Column<any>[] = [
    { key: 'category', label: 'Categorie', width: 160 },
    { key: 'parcelCount', label: 'Colis', width: 80, align: 'center', render: (r) => <Text style={{ fontSize: 13 }}>{r.parcelCount ?? 0}</Text> },
    { key: 'expectedValue', label: 'Valeur attendue', width: 150, align: 'right', render: (r) => <Text style={{ fontWeight: '600' }}>{formatAmount(Number(r.expectedValue ?? 0))}</Text> },
    { key: 'totalWeight', label: 'Masse', width: 110, align: 'right', render: (r) => <Text style={{ fontSize: 13 }}>{Number(r.totalWeight ?? 0).toFixed(2)} kg</Text> },
  ];
  const routeColumns: Column<any>[] = [
    { key: 'transitRouteName', label: 'Route', width: 200, render: (r) => <Text style={{ fontSize: 13 }}>{r.transitRouteName ?? '-'}{r.transitType ? ` (${r.transitType})` : ''}</Text> },
    { key: 'parcelCount', label: 'Colis', width: 80, align: 'center', render: (r) => <Text style={{ fontSize: 13 }}>{r.parcelCount ?? 0}</Text> },
    { key: 'totalWeight', label: 'Masse', width: 110, align: 'right', render: (r) => <Text style={{ fontSize: 13 }}>{Number(r.totalWeight ?? 0).toFixed(2)} kg</Text> },
    { key: 'totalVolume', label: 'Volume', width: 120, align: 'right', render: (r) => <Text style={{ fontSize: 13 }}>{Number(r.totalVolume ?? 0).toFixed(3)} m³</Text> },
  ];

  return (
    <View style={{ gap: spacing.xl }}>
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: spacing.md }}>
        <StatCard label="Colis en stock" value={String(totals?.parcelCount ?? 0)} color={colors.primary[700]} />
        <StatCard label="Valeur attendue" value={formatAmount(Number(totals?.expectedValue ?? 0))} />
        <StatCard label="Masse totale" value={`${totals?.totalWeight ?? 0} kg`} />
        <StatCard label="Volume total" value={`${totals?.totalVolume ?? 0} m³`} />
      </View>
      <SectionCard title="Par categorie">
        <AppDataTable columns={catColumns} data={summary?.byCategory ?? []} emptyMessage="Aucune donnee" />
      </SectionCard>
      <SectionCard title="Par route de transit">
        <AppDataTable columns={routeColumns} data={summary?.byTransitRoute ?? []} emptyMessage="Aucune donnee" />
      </SectionCard>
    </View>
  );
}

function InventoriesTab({ warehouseId }: { warehouseId: string }) {
  const router = useRouter();
  const { data } = useWarehouseInventories(warehouseId);
  const start = useStartInventory(warehouseId);
  const inventories: any[] = data?.data ?? data ?? [];
  const openInventory = (invId: string) => router.push(`/warehouses/${warehouseId}/inventory/${invId}`);
  const columns: Column<any>[] = [
    { key: 'startedAt', label: 'Date', width: 150, render: (r) => <Text style={{ fontSize: 13 }}>{formatDate(r.startedAt)}</Text> },
    { key: 'status', label: 'Statut', width: 130, render: (r) => <Badge variant={INV_VARIANT[r.status] ?? 'default'}>{r.status}</Badge> },
    { key: '_count', label: 'Items', width: 90, align: 'center', render: (r) => <Text style={{ fontSize: 13 }}>{r._count?.items ?? 0}</Text> },
    { key: 'startedBy', label: 'Demarre par', width: 160, render: (r) => <Text style={{ fontSize: 13 }}>{r.startedBy?.fullName ?? r.startedBy?.firstName ?? '-'}</Text> },
    { key: 'open', label: '', width: 90, align: 'center', render: (r) => <Button size="sm" variant="outline" onPress={() => openInventory(r.id)}>Ouvrir</Button> },
  ];
  return (
    <SectionCard
      title="Inventaires"
      subtitle="Reconcilier le stock theorique avec le stock physique"
      action={
        <Button
          size="sm"
          loading={start.isPending}
          onPress={() => start.mutate(undefined, { onSuccess: (res: any) => { const newId = res?.data?.id; if (newId) openInventory(newId); } })}
        >
          Lancer un inventaire
        </Button>
      }
    >
      <AppDataTable columns={columns} data={inventories} emptyMessage="Aucun inventaire" onRowClick={(r) => openInventory(r.id)} />
    </SectionCard>
  );
}
