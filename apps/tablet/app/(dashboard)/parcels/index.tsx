import { View, Text, ScrollView, RefreshControl, Pressable, ActivityIndicator } from 'react-native';
import { useState } from 'react';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useQuery } from '@tanstack/react-query';
import { Card, CardHeader } from '@/components/ui/Card';
import { Badge } from '@/components/ui/Badge';
import { apiClient } from '@/lib/api/client';
import { colors } from '@/lib/theme/colors';
import { spacing } from '@/lib/theme/spacing';
import { formatAmount } from '@optipack/shared';

export default function ParcelsScreen() {
  const router = useRouter();
  const [refreshing, setRefreshing] = useState(false);

  const { data, isLoading, refetch } = useQuery({
    queryKey: ['parcels'],
    queryFn: () => apiClient.get('/parcels?limit=50').then((r) => r.data),
  });

  const onRefresh = async () => {
    setRefreshing(true);
    await refetch();
    setRefreshing(false);
  };

  const parcels: any[] = data?.data ?? [];

  const statusVariant = (status: string) => {
    if (status === 'DELIVERED') return 'success';
    if (status === 'IN_TRANSIT') return 'warning';
    return 'default';
  };

  return (
    <ScrollView
      style={{ flex: 1, backgroundColor: colors.background }}
      contentContainerStyle={{ padding: spacing['2xl'] }}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.primary[500]} />}
    >
      <View style={{ marginBottom: spacing['2xl'] }}>
        <Text style={{ fontSize: 26, fontWeight: '700', color: colors.gray[900] }}>Colis</Text>
        <Text style={{ fontSize: 14, color: colors.gray[500], marginTop: 4 }}>Liste de tous les colis</Text>
      </View>

      {isLoading ? (
        <ActivityIndicator size="large" color={colors.primary[500]} style={{ marginTop: 40 }} />
      ) : (
        <Card>
          <CardHeader title="Tous les colis" subtitle={`${parcels.length} resultats`} />
          {parcels.length === 0 ? (
            <Text style={{ textAlign: 'center', fontSize: 13, color: colors.gray[400], paddingVertical: 20 }}>Aucun colis trouve</Text>
          ) : (
            parcels.map((parcel, i) => (
              <Pressable
                key={parcel.id}
                onPress={() => {}}
                style={{
                  flexDirection: 'row',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                  paddingVertical: 12,
                  borderBottomWidth: i < parcels.length - 1 ? 1 : 0,
                  borderBottomColor: '#F3F4F6',
                }}
              >
                <View style={{ flex: 1 }}>
                  <Text style={{ fontSize: 13, fontWeight: '700', fontFamily: 'monospace', color: colors.primary[700] }}>
                    {parcel.trackingNumber}
                  </Text>
                  <Text style={{ fontSize: 13, color: colors.gray[700], marginTop: 2 }}>{parcel.designation}</Text>
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 4 }}>
                    <Ionicons name="person-outline" size={12} color={colors.gray[400]} />
                    <Text style={{ fontSize: 12, color: colors.gray[500] }}>{parcel.client?.fullName ?? '-'}</Text>
                    <Text style={{ fontSize: 12, color: colors.gray[400] }}>{parcel.weight ? `${parcel.weight} kg` : ''}</Text>
                  </View>
                </View>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                  <Text style={{ fontSize: 14, fontWeight: '700', color: colors.gray[900] }}>
                    {formatAmount(Number(parcel.price ?? 0))}
                  </Text>
                  <Badge variant={statusVariant(parcel.status)}>{parcel.status}</Badge>
                  <Ionicons name="chevron-forward" size={16} color={colors.gray[300]} />
                </View>
              </Pressable>
            ))
          )}
        </Card>
      )}
    </ScrollView>
  );
}
