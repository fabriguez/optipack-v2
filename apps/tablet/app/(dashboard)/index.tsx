import { View, Text, ScrollView, RefreshControl } from 'react-native';
import { useState } from 'react';
import { Ionicons } from '@expo/vector-icons';
import { KpiCard } from '@/components/ui/KpiCard';
import { Card, CardHeader } from '@/components/ui/Card';
import { Badge } from '@/components/ui/Badge';
import { BarChart, DonutChart } from '@/components/ui/Charts';
import { useDashboardStats } from '@/lib/hooks/useDashboard';
import { colors } from '@/lib/theme/colors';
import { spacing } from '@/lib/theme/spacing';
import { formatAmount } from '@transitsoftservices/shared';

const STATUS_LABELS: Record<string, string> = {
  IN_STOCK: 'En stock',
  IN_TRANSIT: 'En transit',
  DELIVERED: 'Livres',
  ARRIVED: 'Arrives',
  RECEIVED: 'Recus',
};

export default function DashboardScreen() {
  const { data, refetch } = useDashboardStats();
  const [refreshing, setRefreshing] = useState(false);
  const stats = data?.data;

  const onRefresh = async () => {
    setRefreshing(true);
    await refetch();
    setRefreshing(false);
  };

  const pieData = Object.entries(stats?.parcelsByStatus || {}).map(([name, value]) => ({
    name: STATUS_LABELS[name] ?? name,
    value: Number(value),
  }));

  return (
    <ScrollView
      style={{ flex: 1, backgroundColor: 'transparent' }}
      contentContainerStyle={{ padding: spacing['2xl'] }}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.primary[500]} />}
    >
      {/* Header */}
      <View style={{ marginBottom: spacing['2xl'] }}>
        <Text style={{ fontSize: 26, fontWeight: '700', color: colors.gray[900] }}>Tableau de bord</Text>
        <Text style={{ fontSize: 14, color: colors.gray[500], marginTop: 4 }}>Vue d'ensemble de vos operations</Text>
      </View>

      {/* KPI Row */}
      <View style={{ flexDirection: 'row', gap: spacing.lg, marginBottom: spacing['2xl'] }}>
        <View style={{ flex: 1 }}>
          <KpiCard
            label="Total Colis"
            value={stats?.totalParcels ?? 0}
            icon={<Ionicons name="cube-outline" size={22} color={colors.primary[600]} />}
          />
        </View>
        <View style={{ flex: 1 }}>
          <KpiCard
            label="Livres"
            value={stats?.parcelsByStatus?.DELIVERED ?? 0}
            icon={<Ionicons name="checkmark-circle-outline" size={22} color="#388E3C" />}
            iconBg="#E8F5E9"
            accentColor="#388E3C"
          />
        </View>
        <View style={{ flex: 1 }}>
          <KpiCard
            label="En Transit"
            value={stats?.parcelsByStatus?.IN_TRANSIT ?? 0}
            icon={<Ionicons name="airplane-outline" size={22} color="#E65100" />}
            iconBg="#FFF3E0"
            accentColor="#FF9800"
          />
        </View>
        <View style={{ flex: 1 }}>
          <KpiCard
            label="En Attente"
            value={(stats?.parcelsByStatus?.ARRIVED ?? 0) + (stats?.parcelsByStatus?.RECEIVED ?? 0)}
            icon={<Ionicons name="time-outline" size={22} color="#1565C0" />}
            iconBg="#E3F2FD"
            accentColor="#2196F3"
          />
        </View>
      </View>

      {/* Charts Row */}
      <View style={{ flexDirection: 'row', gap: spacing.lg, marginBottom: spacing['2xl'] }}>
        <View style={{ flex: 2 }}>
          <Card>
            <CardHeader title="Volume de colis" subtitle="Colis enregistres cette semaine" />
            <BarChart data={stats?.parcelsChart || []} />
          </Card>
        </View>
        <View style={{ flex: 1 }}>
          <Card>
            <CardHeader title="Repartition" subtitle="Par statut" />
            {pieData.length > 0 ? (
              <DonutChart data={pieData} />
            ) : (
              <Text style={{ textAlign: 'center', fontSize: 13, color: colors.gray[400], paddingVertical: 40 }}>Aucune donnee</Text>
            )}
          </Card>
        </View>
      </View>

      {/* Bottom Row */}
      <View style={{ flexDirection: 'row', gap: spacing.lg, marginBottom: spacing['2xl'] }}>
        {/* Cash in agencies */}
        <View style={{ flex: 1 }}>
          <Card style={{ flex: 1 }}>
            <CardHeader title="Solde caisses" right={<Badge variant="success">Temps reel</Badge>} />
            {(stats?.cashInAgencies || []).length > 0 ? (
              (stats?.cashInAgencies || []).map((agency: any) => (
                <View key={agency.agencyId} style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', backgroundColor: colors.gray[50], borderRadius: 12, padding: 14, marginBottom: 8 }}>
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
                    <View style={{ width: 36, height: 36, borderRadius: 10, backgroundColor: colors.primary[50], alignItems: 'center', justifyContent: 'center' }}>
                      <Ionicons name="business-outline" size={18} color={colors.primary[600]} />
                    </View>
                    <Text style={{ fontSize: 14, fontWeight: '500', color: colors.gray[900] }}>{agency.agencyName}</Text>
                  </View>
                  <Text style={{ fontSize: 14, fontWeight: '700', color: colors.primary[700] }}>{formatAmount(agency.balance)}</Text>
                </View>
              ))
            ) : (
              <Text style={{ textAlign: 'center', fontSize: 13, color: colors.gray[400], paddingVertical: 20 }}>Pas de caisses ouvertes</Text>
            )}
          </Card>
        </View>

        {/* Revenue */}
        <View style={{ flex: 1 }}>
          <Card style={{ flex: 1 }}>
            <CardHeader title="Chiffre d'affaires" subtitle="Total transfere au siege" />
            <View style={{ alignItems: 'center', paddingVertical: 12 }}>
              <View style={{ width: 64, height: 64, borderRadius: 18, backgroundColor: colors.primary[50], alignItems: 'center', justifyContent: 'center', marginBottom: 12 }}>
                <Ionicons name="card-outline" size={28} color={colors.primary[600]} />
              </View>
              <Text style={{ fontSize: 26, fontWeight: '700', color: colors.gray[900] }}>{formatAmount(stats?.totalRevenue ?? 0)}</Text>
              <Text style={{ fontSize: 12, color: colors.gray[400], marginTop: 4 }}>Montant confirme</Text>
            </View>
          </Card>
        </View>

        {/* Debts */}
        <View style={{ flex: 1 }}>
          <Card style={{ flex: 1 }}>
            <CardHeader title="Dettes clients" right={<Badge variant="warning">A recouvrer</Badge>} />
            <View style={{ alignItems: 'center', paddingVertical: 12 }}>
              <View style={{ width: 64, height: 64, borderRadius: 18, backgroundColor: '#FFEBEE', alignItems: 'center', justifyContent: 'center', marginBottom: 12 }}>
                <Ionicons name="alert-circle-outline" size={28} color={colors.error} />
              </View>
              <Text style={{ fontSize: 26, fontWeight: '700', color: colors.error }}>{formatAmount(stats?.outstandingDebts ?? 0)}</Text>
              <Text style={{ fontSize: 12, color: colors.gray[400], marginTop: 4 }}>Montant en souffrance</Text>
            </View>
          </Card>
        </View>
      </View>

      {/* Top Clients */}
      {(stats?.topClients || []).length > 0 && (
        <Card>
          <CardHeader title="Meilleurs clients" subtitle="Par total depense" />
          {stats.topClients.map((client: any, i: number) => (
            <View key={client.clientId} style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingVertical: 10, borderBottomWidth: i < stats.topClients.length - 1 ? 1 : 0, borderBottomColor: colors.gray[100] }}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
                <View style={{ width: 32, height: 32, borderRadius: 999, backgroundColor: colors.primary[50], alignItems: 'center', justifyContent: 'center' }}>
                  <Text style={{ fontSize: 13, fontWeight: '700', color: colors.primary[700] }}>{i + 1}</Text>
                </View>
                <View>
                  <Text style={{ fontSize: 14, fontWeight: '500', color: colors.gray[900] }}>{client.clientName}</Text>
                  {client.phone && <Text style={{ fontSize: 11, color: colors.gray[400] }}>{client.phone}</Text>}
                </View>
              </View>
              <Text style={{ fontSize: 14, fontWeight: '700', color: colors.gray[900] }}>{formatAmount(client.totalSpent)}</Text>
            </View>
          ))}
        </Card>
      )}

      {/* Recent parcels */}
      {(stats?.recentParcels || []).length > 0 && (
        <Card style={{ marginTop: spacing.lg }}>
          <CardHeader title="Derniers colis" />
          {stats.recentParcels.map((parcel: any) => (
            <View key={parcel.id} style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: colors.gray[50] }}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
                <View style={{ width: 36, height: 36, borderRadius: 10, backgroundColor: colors.primary[50], alignItems: 'center', justifyContent: 'center' }}>
                  <Ionicons name="cube-outline" size={18} color={colors.primary[600]} />
                </View>
                <View>
                  <Text style={{ fontSize: 12, fontWeight: '700', fontFamily: 'monospace', color: colors.primary[700] }}>{parcel.trackingNumber}</Text>
                  <Text style={{ fontSize: 12, color: colors.gray[500] }}>{parcel.designation}</Text>
                </View>
              </View>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                <Text style={{ fontSize: 13, fontWeight: '600', color: colors.gray[900] }}>{formatAmount(Number(parcel.price))}</Text>
                <Badge variant={parcel.status === 'DELIVERED' ? 'success' : parcel.status === 'IN_TRANSIT' ? 'warning' : 'default'}>
                  {parcel.status}
                </Badge>
              </View>
            </View>
          ))}
        </Card>
      )}
    </ScrollView>
  );
}
