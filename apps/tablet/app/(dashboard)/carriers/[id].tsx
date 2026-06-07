import { useState } from 'react';
import { View, Text, ScrollView, Pressable, ActivityIndicator, RefreshControl } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useQuery } from '@tanstack/react-query';
import { formatAmount } from '@transitsoftservices/shared';
import { Badge } from '@/components/ui/Badge';
import { HeaderAction } from '@/components/data/PageHeader';
import { AppDataTable, type Column } from '@/components/data/AppDataTable';
import { SectionCard, InfoCard } from '@/components/data/DetailCards';
import { usePullRefresh } from '@/lib/hooks/usePullRefresh';
import { useCarrier } from '@/lib/hooks/useCarriers';
import { apiClient } from '@/lib/api/client';
import { colors } from '@/lib/theme/colors';
import { spacing } from '@/lib/theme/spacing';
import { CarrierFormDialog } from './CarrierFormDialog';

const TYPE_LABEL: Record<string, string> = { AIR: 'Aerien', SEA: 'Maritime', LAND: 'Terrestre', MULTI: 'Multi-modal' };

export default function CarrierDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const carrierId = String(id);
  const router = useRouter();
  const { data, isLoading, refetch } = useCarrier(carrierId);
  const { refreshing, onRefresh } = usePullRefresh(refetch);
  const [showEdit, setShowEdit] = useState(false);

  const { data: containersData } = useQuery({
    queryKey: ['containers', 'carrier', carrierId],
    queryFn: () => apiClient.get('/containers', { params: { carrierId, limit: 50 } }).then((r) => r.data),
    enabled: !!carrierId,
  });

  const c = data?.data;
  const containers: any[] = containersData?.data ?? [];

  if (isLoading) return <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}><ActivityIndicator size="large" color={colors.primary[500]} /></View>;
  if (!c) return <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', padding: spacing['3xl'] }}><Text style={{ color: colors.gray[500] }}>Transporteur introuvable</Text></View>;

  const columns: Column<any>[] = [
    { key: 'designation', label: 'Designation', width: 160, render: (r) => <Text style={{ fontFamily: 'monospace', fontSize: 12, fontWeight: '700', color: colors.primary[700] }}>{r.designation}</Text> },
    { key: 'type', label: 'Type', width: 100, render: (r) => <Badge>{TYPE_LABEL[r.type ?? ''] ?? r.type ?? '-'}</Badge> },
    { key: 'status', label: 'Statut', width: 120, render: (r) => <Badge>{r.status}</Badge> },
    { key: 'carrierCost', label: 'Cout', width: 130, align: 'right', render: (r) => <Text style={{ fontSize: 13 }}>{r.carrierCost != null ? formatAmount(Number(r.carrierCost)) : '-'}</Text> },
  ];

  return (
    <View style={{ flex: 1, backgroundColor: 'transparent' }}>
      <ScrollView style={{ flex: 1 }} contentContainerStyle={{ padding: spacing['2xl'], gap: spacing.xl }} refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.primary[500]} />}>
        <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: spacing.lg }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.lg, flex: 1 }}>
            <Pressable onPress={() => router.navigate('/carriers')} style={({ pressed }) => ({ width: 40, height: 40, borderRadius: 12, alignItems: 'center', justifyContent: 'center', backgroundColor: pressed ? colors.gray[100] : 'transparent' })}>
              <Ionicons name="arrow-back" size={22} color={colors.gray[600]} />
            </Pressable>
            <View style={{ flex: 1 }}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.sm, flexWrap: 'wrap' }}>
                <Text style={{ fontSize: 24, fontWeight: '700', color: colors.gray[900] }}>{c.name}</Text>
                <Badge>{TYPE_LABEL[c.carrierType ?? ''] ?? c.carrierType ?? '-'}</Badge>
                <Badge variant={c.isActive === false ? 'error' : 'success'}>{c.isActive === false ? 'Inactif' : 'Actif'}</Badge>
              </View>
            </View>
          </View>
          <HeaderAction label="Modifier" icon="create-outline" variant="outline" onPress={() => setShowEdit(true)} />
        </View>

        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: spacing.md }}>
          <InfoCard icon="person-outline" label="Contact" value={c.contactName || '-'} />
          <InfoCard icon="call-outline" label="Telephone" value={c.phone || '-'} />
          <InfoCard icon="mail-outline" label="Email" value={c.email || '-'} />
          <InfoCard icon="location-outline" label="Adresse" value={c.address || '-'} />
        </View>

        {(c.emergencyContactName || c.emergencyContactPhone) && (
          <SectionCard title="Contact d'urgence">
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: spacing.md }}>
              <InfoCard icon="person-outline" label="Nom" value={c.emergencyContactName || '-'} />
              <InfoCard icon="call-outline" label="Telephone" value={c.emergencyContactPhone || '-'} />
              <InfoCard icon="people-outline" label="Lien" value={c.emergencyContactRelation || '-'} />
            </View>
          </SectionCard>
        )}

        {!!c.notes && (
          <SectionCard title="Notes">
            <Text style={{ fontSize: 14, color: colors.gray[700], lineHeight: 20 }}>{c.notes}</Text>
          </SectionCard>
        )}

        <SectionCard title={`Conteneurs (${containers.length})`}>
          <AppDataTable columns={columns} data={containers} emptyMessage="Aucun conteneur" onRowClick={(r) => router.push(`/containers/${r.id}`)} />
        </SectionCard>
      </ScrollView>

      <CarrierFormDialog open={showEdit} onClose={() => setShowEdit(false)} carrier={c} />
    </View>
  );
}
