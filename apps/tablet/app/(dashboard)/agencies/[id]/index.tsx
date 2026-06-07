import { useCallback, useState } from 'react';
import { View, Text, ScrollView, Pressable, ActivityIndicator, RefreshControl } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useLocalSearchParams, useRouter, useFocusEffect } from 'expo-router';
import { useQueryClient } from '@tanstack/react-query';
import { AgencyAvatar } from '@/components/shared/AgencyAvatar';
import { AppTabs, type TabItem } from '@/components/ui/AppTabs';
import { Badge } from '@/components/ui/Badge';
import { ConfirmDialog } from '@/components/ui/ConfirmDialog';
import { HeaderAction } from '@/components/data/PageHeader';
import { useAgency, useDeleteAgency } from '@/lib/hooks/useAgencies';
import { useAgencyCashRegister } from '@/lib/hooks/useAgencyDetail';
import { colors } from '@/lib/theme/colors';
import { spacing } from '@/lib/theme/spacing';
import { AgencyFormDialog } from '../AgencyFormDialog';
import { OverviewTab } from './tabs/OverviewTab';
import { FinanceTab } from './tabs/FinanceTab';
import { BreakdownTab } from './tabs/BreakdownTab';
import { ChargesTab } from './tabs/ChargesTab';
import { PersonnelTab } from './tabs/PersonnelTab';
import { AttendanceTab } from './tabs/AttendanceTab';
import { LeavesTab } from './tabs/LeavesTab';
import { ReviewConfigTab } from './tabs/ReviewConfigTab';
import { HRStatsTab } from './tabs/HRStatsTab';
import { DailyReportsTab } from './tabs/DailyReportsTab';
import { OpeningHoursTab } from './tabs/OpeningHoursTab';

const ic = (name: keyof typeof Ionicons.glyphMap, active = false) => (
  <Ionicons name={name} size={15} color={active ? colors.primary[700] : colors.gray[500]} />
);

export default function AgencyDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const agencyId = String(id);
  const router = useRouter();
  const { data, isLoading, refetch } = useAgency(agencyId);
  const { data: cashData } = useAgencyCashRegister(agencyId);
  const deleteMutation = useDeleteAgency();
  const qc = useQueryClient();
  const [showEdit, setShowEdit] = useState(false);
  const [showDelete, setShowDelete] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  // Remonte les onglets a chaque retour sur la page -> revient au 1er onglet.
  const [tabKey, setTabKey] = useState(0);
  useFocusEffect(useCallback(() => { setTabKey((k) => k + 1); }, []));

  // Rafraichit l'agence + toutes les donnees liees (onglet actif inclus).
  const onRefresh = async () => {
    setRefreshing(true);
    try {
      await Promise.all([
        refetch(),
        qc.invalidateQueries({ queryKey: ['agencies', agencyId] }),
        qc.invalidateQueries({ queryKey: ['cash-register', agencyId] }),
        qc.invalidateQueries({ queryKey: ['employees'] }),
        qc.invalidateQueries({ queryKey: ['warehouses', 'agency', agencyId] }),
        qc.invalidateQueries({ queryKey: ['clients', 'agency', agencyId] }),
        qc.invalidateQueries({ queryKey: ['payments', 'agency', agencyId] }),
        qc.invalidateQueries({ queryKey: ['disbursements', 'agency', agencyId] }),
      ]);
    } finally {
      setRefreshing(false);
    }
  };

  const agency = data?.data;
  const cash = cashData?.data;

  if (isLoading) {
    return (
      <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
        <ActivityIndicator size="large" color={colors.primary[500]} />
      </View>
    );
  }

  if (!agency) {
    return (
      <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', padding: spacing['3xl'] }}>
        <Text style={{ fontSize: 15, color: colors.gray[500] }}>Agence introuvable</Text>
      </View>
    );
  }

  const tabs: TabItem[] = [
    { value: 'overview', label: "Vue d'ensemble", icon: ic('business-outline'), content: <OverviewTab agency={agency} cash={cash} /> },
    { value: 'finance', label: 'Finance', icon: ic('card-outline'), content: <FinanceTab agencyId={agencyId} cash={cash} /> },
    { value: 'breakdown', label: 'Repartition', icon: ic('bar-chart-outline'), content: <BreakdownTab agencyId={agencyId} /> },
    { value: 'charges', label: 'Charges', icon: ic('wallet-outline'), content: <ChargesTab agencyId={agencyId} /> },
    { value: 'personnel', label: 'Personnel', icon: ic('people-outline'), content: <PersonnelTab agencyId={agencyId} /> },
    { value: 'attendance', label: 'Pointage', icon: ic('checkbox-outline'), content: <AttendanceTab agencyId={agencyId} /> },
    { value: 'leaves', label: 'Conges', icon: ic('airplane-outline'), content: <LeavesTab agencyId={agencyId} /> },
    { value: 'review', label: 'Grille eval.', icon: ic('star-outline'), content: <ReviewConfigTab agencyId={agencyId} /> },
    { value: 'hr-stats', label: 'Stats RH', icon: ic('stats-chart-outline'), content: <HRStatsTab agencyId={agencyId} /> },
    { value: 'reports', label: 'Observations', icon: ic('document-text-outline'), content: <DailyReportsTab agencyId={agencyId} /> },
    { value: 'hours', label: 'Horaires', icon: ic('time-outline'), content: <OpeningHoursTab agencyId={agencyId} /> },
  ];

  return (
    <View style={{ flex: 1, backgroundColor: 'transparent' }}>
      <ScrollView
        style={{ flex: 1 }}
        contentContainerStyle={{ padding: spacing['2xl'], gap: spacing.xl }}
        keyboardShouldPersistTaps="handled"
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.primary[500]} />}
      >
        {/* Header */}
        <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: spacing.lg }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.lg, flex: 1 }}>
            <Pressable
              onPress={() => router.navigate('/agencies')}
              style={({ pressed }) => ({ width: 40, height: 40, borderRadius: 12, alignItems: 'center', justifyContent: 'center', backgroundColor: pressed ? colors.gray[100] : 'transparent' })}
            >
              <Ionicons name="arrow-back" size={22} color={colors.gray[600]} />
            </Pressable>
            <AgencyAvatar agency={agency} size={56} rounded="lg" />
            <View style={{ flex: 1 }}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.sm, flexWrap: 'wrap' }}>
                <Text style={{ fontSize: 24, fontWeight: '700', color: colors.gray[900] }}>{agency.name}</Text>
                <View style={{ backgroundColor: colors.primary[50], paddingHorizontal: 8, paddingVertical: 3, borderRadius: 8 }}>
                  <Text style={{ fontFamily: 'monospace', fontSize: 11, fontWeight: '700', color: colors.primary[700] }}>{agency.code}</Text>
                </View>
                <Badge variant={agency.isActive === false ? 'error' : 'success'}>{agency.isActive === false ? 'Inactif' : 'Actif'}</Badge>
              </View>
              <Text style={{ fontSize: 13, color: colors.gray[500], marginTop: 2 }}>{[agency.city, agency.country].filter(Boolean).join(', ')}</Text>
            </View>
          </View>
          <View style={{ flexDirection: 'row', gap: spacing.sm }}>
            <HeaderAction label="Modifier" icon="create-outline" variant="outline" onPress={() => setShowEdit(true)} />
            <HeaderAction label="Supprimer" icon="trash-outline" variant="outline" onPress={() => setShowDelete(true)} />
          </View>
        </View>

        {/* Tabs */}
        <AppTabs key={tabKey} tabs={tabs} />
      </ScrollView>

      <AgencyFormDialog open={showEdit} onClose={() => setShowEdit(false)} agency={agency} />
      <ConfirmDialog
        open={showDelete}
        onClose={() => setShowDelete(false)}
        onConfirm={() =>
          deleteMutation.mutate(agency.id, {
            onSuccess: () => {
              setShowDelete(false);
              router.navigate('/agencies');
            },
            onError: () => setShowDelete(false),
          })
        }
        title="Supprimer l'agence"
        message={`L'agence "${agency.name}" sera desactivee. Vous pourrez la reactiver plus tard.`}
        confirmLabel="Supprimer"
        variant="destructive"
        loading={deleteMutation.isPending}
      />
    </View>
  );
}
