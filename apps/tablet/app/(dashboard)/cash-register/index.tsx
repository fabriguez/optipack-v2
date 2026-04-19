import { View, Text, ScrollView, RefreshControl, ActivityIndicator } from 'react-native';
import { useState } from 'react';
import { Ionicons } from '@expo/vector-icons';
import { useQuery } from '@tanstack/react-query';
import { Card, CardHeader } from '@/components/ui/Card';
import { KpiCard } from '@/components/ui/KpiCard';
import { Badge } from '@/components/ui/Badge';
import { apiClient } from '@/lib/api/client';
import { colors } from '@/lib/theme/colors';
import { spacing } from '@/lib/theme/spacing';
import { formatAmount } from '@transitsoftservices/shared';

export default function CashRegisterScreen() {
  const [refreshing, setRefreshing] = useState(false);

  const { data: agenciesData } = useQuery({
    queryKey: ['agencies-for-cash'],
    queryFn: () => apiClient.get('/agencies?limit=50').then((r) => r.data),
  });

  const agencies: any[] = agenciesData?.data ?? [];
  const agencyId = agencies[0]?.id;

  const { data, isLoading, refetch } = useQuery({
    queryKey: ['cash-register', agencyId],
    queryFn: () => apiClient.get(`/cash-registers/${agencyId}`).then((r) => r.data),
    enabled: !!agencyId,
  });

  const onRefresh = async () => {
    setRefreshing(true);
    await refetch();
    setRefreshing(false);
  };

  const register = data?.data;

  return (
    <ScrollView
      style={{ flex: 1, backgroundColor: colors.background }}
      contentContainerStyle={{ padding: spacing['2xl'] }}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.primary[500]} />}
    >
      <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: spacing['2xl'] }}>
        <View>
          <Text style={{ fontSize: 26, fontWeight: '700', color: colors.gray[900] }}>Caisse</Text>
          <Text style={{ fontSize: 14, color: colors.gray[500], marginTop: 4 }}>
            {agencyId ? agencies[0]?.name ?? 'Agence' : 'Chargement...'}
          </Text>
        </View>
        {register && (
          <Badge variant={register.isClosed ? 'error' : 'success'}>
            {register.isClosed ? 'Fermee' : 'Ouverte'}
          </Badge>
        )}
      </View>

      {isLoading || !agencyId ? (
        <ActivityIndicator size="large" color={colors.primary[500]} style={{ marginTop: 40 }} />
      ) : !register ? (
        <Card>
          <Text style={{ textAlign: 'center', fontSize: 14, color: colors.gray[400], paddingVertical: 30 }}>
            Aucune caisse trouvee pour cette agence
          </Text>
        </Card>
      ) : (
        <>
          {/* KPI Row */}
          <View style={{ flexDirection: 'row', gap: spacing.lg, marginBottom: spacing['2xl'] }}>
            <View style={{ flex: 1 }}>
              <KpiCard
                label="Solde d'ouverture"
                value={formatAmount(Number(register.openingBalance ?? 0))}
                icon={<Ionicons name="wallet-outline" size={22} color={colors.primary[600]} />}
              />
            </View>
            <View style={{ flex: 1 }}>
              <KpiCard
                label="Total Entrees"
                value={formatAmount(Number(register.totalEntries ?? 0))}
                icon={<Ionicons name="arrow-down-circle-outline" size={22} color="#388E3C" />}
                iconBg="#E8F5E9"
                accentColor="#388E3C"
              />
            </View>
            <View style={{ flex: 1 }}>
              <KpiCard
                label="Total Sorties"
                value={formatAmount(Number(register.totalExits ?? 0))}
                icon={<Ionicons name="arrow-up-circle-outline" size={22} color={colors.error} />}
                iconBg="#FFEBEE"
                accentColor={colors.error}
              />
            </View>
          </View>

          {/* Current Balance - big card */}
          <Card style={{ marginBottom: spacing['2xl'] }}>
            <View style={{ alignItems: 'center', paddingVertical: spacing['2xl'] }}>
              <View
                style={{
                  width: 64,
                  height: 64,
                  borderRadius: 20,
                  backgroundColor: colors.primary[50],
                  alignItems: 'center',
                  justifyContent: 'center',
                  marginBottom: spacing.lg,
                }}
              >
                <Ionicons name="cash-outline" size={30} color={colors.primary[600]} />
              </View>
              <Text style={{ fontSize: 11, fontWeight: '500', textTransform: 'uppercase', letterSpacing: 0.5, color: colors.gray[400] }}>
                Solde actuel
              </Text>
              <Text style={{ fontSize: 36, fontWeight: '700', color: colors.gray[900], marginTop: 8 }}>
                {formatAmount(Number(register.currentBalance ?? 0))}
              </Text>
            </View>
          </Card>

          {/* Summary */}
          <Card>
            <CardHeader title="Resume" />
            <View style={{ gap: spacing.md }}>
              <View style={{ flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 8 }}>
                <Text style={{ fontSize: 14, color: colors.gray[500] }}>Solde d'ouverture</Text>
                <Text style={{ fontSize: 14, fontWeight: '600', color: colors.gray[900] }}>
                  {formatAmount(Number(register.openingBalance ?? 0))}
                </Text>
              </View>
              <View style={{ flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 8, borderTopWidth: 1, borderTopColor: '#F3F4F6' }}>
                <Text style={{ fontSize: 14, color: '#388E3C' }}>+ Entrees</Text>
                <Text style={{ fontSize: 14, fontWeight: '600', color: '#388E3C' }}>
                  +{formatAmount(Number(register.totalEntries ?? 0))}
                </Text>
              </View>
              <View style={{ flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 8, borderTopWidth: 1, borderTopColor: '#F3F4F6' }}>
                <Text style={{ fontSize: 14, color: colors.error }}>- Sorties</Text>
                <Text style={{ fontSize: 14, fontWeight: '600', color: colors.error }}>
                  -{formatAmount(Number(register.totalExits ?? 0))}
                </Text>
              </View>
              <View style={{ flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 8, borderTopWidth: 2, borderTopColor: colors.gray[200] }}>
                <Text style={{ fontSize: 15, fontWeight: '700', color: colors.gray[900] }}>Solde actuel</Text>
                <Text style={{ fontSize: 15, fontWeight: '700', color: colors.primary[700] }}>
                  {formatAmount(Number(register.currentBalance ?? 0))}
                </Text>
              </View>
            </View>
          </Card>
        </>
      )}
    </ScrollView>
  );
}
