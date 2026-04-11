import { View, Text, ScrollView, RefreshControl, Pressable, ActivityIndicator } from 'react-native';
import { useState } from 'react';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useQuery } from '@tanstack/react-query';
import { Card, CardHeader } from '@/components/ui/Card';
import { Badge } from '@/components/ui/Badge';
import { apiClient } from '@/lib/api/client';
import { colors } from '@/lib/theme/colors';
import { spacing, radius } from '@/lib/theme/spacing';

export default function WarehousesScreen() {
  const router = useRouter();
  const [refreshing, setRefreshing] = useState(false);

  const { data: agenciesData } = useQuery({
    queryKey: ['agencies-for-warehouses'],
    queryFn: () => apiClient.get('/agencies?limit=50').then((r) => r.data),
  });

  const agencies: any[] = agenciesData?.data ?? [];
  const agencyId = agencies[0]?.id;

  const { data, isLoading, refetch } = useQuery({
    queryKey: ['warehouses', agencyId],
    queryFn: () => apiClient.get(`/warehouses/agency/${agencyId}`).then((r) => r.data),
    enabled: !!agencyId,
  });

  const onRefresh = async () => {
    setRefreshing(true);
    await refetch();
    setRefreshing(false);
  };

  const warehouses: any[] = data?.data ?? [];

  return (
    <ScrollView
      style={{ flex: 1, backgroundColor: colors.background }}
      contentContainerStyle={{ padding: spacing['2xl'] }}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.primary[500]} />}
    >
      <View style={{ marginBottom: spacing['2xl'] }}>
        <Text style={{ fontSize: 26, fontWeight: '700', color: colors.gray[900] }}>Magasins</Text>
        <Text style={{ fontSize: 14, color: colors.gray[500], marginTop: 4 }}>
          {agencyId ? `Magasins de ${agencies[0]?.name ?? 'l\'agence'}` : 'Chargement des agences...'}
        </Text>
      </View>

      {isLoading || !agencyId ? (
        <ActivityIndicator size="large" color={colors.primary[500]} style={{ marginTop: 40 }} />
      ) : (
        <Card>
          <CardHeader title="Tous les magasins" subtitle={`${warehouses.length} resultats`} />
          {warehouses.length === 0 ? (
            <Text style={{ textAlign: 'center', fontSize: 13, color: colors.gray[400], paddingVertical: 20 }}>Aucun magasin trouve</Text>
          ) : (
            warehouses.map((warehouse, i) => {
              const occupancy = warehouse.occupancy ?? 0;
              const pct = Math.min(occupancy, 100);

              return (
                <Pressable
                  key={warehouse.id}
                  onPress={() => {}}
                  style={{
                    flexDirection: 'row',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                    paddingVertical: 12,
                    borderBottomWidth: i < warehouses.length - 1 ? 1 : 0,
                    borderBottomColor: '#F3F4F6',
                  }}
                >
                  <View style={{ flex: 1 }}>
                    <Text style={{ fontSize: 14, fontWeight: '600', color: colors.gray[900] }}>{warehouse.name}</Text>
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 4 }}>
                      <Ionicons name="location-outline" size={12} color={colors.gray[400]} />
                      <Text style={{ fontSize: 12, color: colors.gray[500] }}>{warehouse.location ?? '-'}</Text>
                      {warehouse.type && <Badge variant="info">{warehouse.type}</Badge>}
                    </View>
                    {/* Occupancy bar */}
                    <View style={{ marginTop: 6, flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                      <View style={{ flex: 1, maxWidth: 120, height: 6, backgroundColor: colors.gray[100], borderRadius: radius.sm }}>
                        <View
                          style={{
                            width: `${pct}%`,
                            height: 6,
                            backgroundColor: pct > 85 ? colors.error : pct > 60 ? colors.warning : colors.primary[500],
                            borderRadius: radius.sm,
                          }}
                        />
                      </View>
                      <Text style={{ fontSize: 11, color: colors.gray[400] }}>{Math.round(pct)}%</Text>
                    </View>
                  </View>
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                    <View style={{ alignItems: 'flex-end' }}>
                      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
                        <Ionicons name="cube-outline" size={14} color={colors.gray[400]} />
                        <Text style={{ fontSize: 13, fontWeight: '600', color: colors.gray[700] }}>
                          {warehouse.parcelCount ?? 0}
                        </Text>
                      </View>
                      <Text style={{ fontSize: 11, color: colors.gray[400], marginTop: 2 }}>colis</Text>
                    </View>
                    <Ionicons name="chevron-forward" size={16} color={colors.gray[300]} />
                  </View>
                </Pressable>
              );
            })
          )}
        </Card>
      )}
    </ScrollView>
  );
}
