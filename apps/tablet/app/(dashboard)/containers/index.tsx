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

export default function ContainersScreen() {
  const router = useRouter();
  const [refreshing, setRefreshing] = useState(false);

  const { data, isLoading, refetch } = useQuery({
    queryKey: ['containers'],
    queryFn: () => apiClient.get('/containers?limit=50').then((r) => r.data),
  });

  const onRefresh = async () => {
    setRefreshing(true);
    await refetch();
    setRefreshing(false);
  };

  const containers: any[] = data?.data ?? [];

  const typeVariant = (type: string) => {
    if (type === 'AIR') return 'info';
    if (type === 'SEA') return 'info';
    if (type === 'LAND') return 'warning';
    return 'default';
  };

  const statusVariant = (status: string) => {
    if (status === 'ARRIVED' || status === 'DELIVERED') return 'success';
    if (status === 'IN_TRANSIT') return 'warning';
    if (status === 'LOADING') return 'info';
    return 'default';
  };

  return (
    <ScrollView
      style={{ flex: 1, backgroundColor: colors.background }}
      contentContainerStyle={{ padding: spacing['2xl'] }}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.primary[500]} />}
    >
      <View style={{ marginBottom: spacing['2xl'] }}>
        <Text style={{ fontSize: 26, fontWeight: '700', color: colors.gray[900] }}>Conteneurs</Text>
        <Text style={{ fontSize: 14, color: colors.gray[500], marginTop: 4 }}>Suivi des conteneurs</Text>
      </View>

      {isLoading ? (
        <ActivityIndicator size="large" color={colors.primary[500]} style={{ marginTop: 40 }} />
      ) : (
        <Card>
          <CardHeader title="Tous les conteneurs" subtitle={`${containers.length} resultats`} />
          {containers.length === 0 ? (
            <Text style={{ textAlign: 'center', fontSize: 13, color: colors.gray[400], paddingVertical: 20 }}>Aucun conteneur trouve</Text>
          ) : (
            containers.map((container, i) => {
              const capacityUsed = container.currentLoad ?? 0;
              const capacityMax = container.capacity ?? 1;
              const pct = Math.min((capacityUsed / capacityMax) * 100, 100);

              return (
                <Pressable
                  key={container.id}
                  onPress={() => {}}
                  style={{
                    flexDirection: 'row',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                    paddingVertical: 12,
                    borderBottomWidth: i < containers.length - 1 ? 1 : 0,
                    borderBottomColor: '#F3F4F6',
                  }}
                >
                  <View style={{ flex: 1 }}>
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                      <Text style={{ fontSize: 13, fontWeight: '700', fontFamily: 'monospace', color: colors.gray[900] }}>
                        {container.designation}
                      </Text>
                      <Badge variant={typeVariant(container.type)}>{container.type}</Badge>
                    </View>
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12, marginTop: 4 }}>
                      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
                        <Ionicons name="arrow-up-circle-outline" size={12} color={colors.gray[400]} />
                        <Text style={{ fontSize: 12, color: colors.gray[500] }}>{container.departureAgency?.name ?? '-'}</Text>
                      </View>
                      <Ionicons name="arrow-forward" size={12} color={colors.gray[300]} />
                      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
                        <Ionicons name="arrow-down-circle-outline" size={12} color={colors.gray[400]} />
                        <Text style={{ fontSize: 12, color: colors.gray[500] }}>{container.arrivalAgency?.name ?? '-'}</Text>
                      </View>
                    </View>
                    {/* Capacity bar */}
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
                    <Badge variant={statusVariant(container.status)}>{container.status}</Badge>
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
