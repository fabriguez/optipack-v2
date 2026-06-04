import { useMemo, useState } from 'react';
import { View, Text, TextInput, FlatList, RefreshControl, ActivityIndicator, Pressable } from 'react-native';
import { useQuery } from '@tanstack/react-query';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { portalApi } from '@/lib/api/portal';
import { Badge } from '@/components/ui/Badge';
import { AuthedImage } from '@/components/ui/AuthedImage';
import { ParcelStatusContext } from '@/components/parcel/ParcelStatusContext';
import { parcelStatusLabel } from '@/lib/labels';
import { colors, radius, spacing } from '@/lib/theme/colors';
import { formatAmount } from '@transitsoftservices/shared';
import { PeriodChips, sinceDays } from '@/components/PeriodChips';

export default function ParcelsTab() {
  const router = useRouter();
  const [search, setSearch] = useState('');
  const [periodDays, setPeriodDays] = useState<number | null>(null);
  const [refreshing, setRefreshing] = useState(false);

  const params = useMemo(
    () => ({ search: search || undefined, from: sinceDays(periodDays), limit: 50 }),
    [search, periodDays],
  );
  const { data, refetch, isLoading } = useQuery({
    queryKey: ['portal', 'parcels', params],
    queryFn: () => portalApi.parcels(params),
  });

  const items = (data?.data ?? []) as any[];

  const onRefresh = async () => {
    setRefreshing(true);
    await refetch();
    setRefreshing(false);
  };

  return (
    <View style={{ flex: 1, backgroundColor: 'transparent' }}>
      <View style={{ padding: spacing.lg }}>
        <View
          style={{
            flexDirection: 'row',
            alignItems: 'center',
            backgroundColor: colors.white,
            borderRadius: radius.md,
            borderWidth: 1,
            borderColor: colors.gray[200],
            paddingHorizontal: spacing.lg,
            height: 44,
            gap: 8,
          }}
        >
          <Ionicons name="search" size={18} color={colors.gray[400]} />
          <TextInput
            value={search}
            onChangeText={setSearch}
            placeholder="Rechercher tracking..."
            placeholderTextColor={colors.gray[400]}
            style={{ flex: 1, fontSize: 14, color: colors.gray[900] }}
          />
        </View>
        <PeriodChips value={periodDays} onChange={setPeriodDays} />
      </View>
      {isLoading ? (
        <ActivityIndicator color={colors.primary[500]} style={{ marginTop: 40 }} />
      ) : (
        <FlatList
          data={items}
          keyExtractor={(p) => p.id}
          contentContainerStyle={{ paddingHorizontal: spacing.lg, paddingBottom: 80, gap: spacing.sm }}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.primary[500]} />}
          ListEmptyComponent={
            <View style={{ alignItems: 'center', padding: 40 }}>
              <Ionicons name="cube-outline" size={40} color={colors.gray[300]} />
              <Text style={{ fontSize: 13, color: colors.gray[500], marginTop: 8 }}>Aucun colis pour le moment</Text>
            </View>
          }
          renderItem={({ item: p }) => (
            <Pressable
              onPress={() => router.push(`/parcels/${p.trackingNumber}` as never)}
              style={({ pressed }) => ({
                backgroundColor: pressed ? colors.gray[50] : colors.white,
                borderRadius: radius.lg,
                padding: spacing.lg,
                flexDirection: 'row',
                alignItems: 'center',
                gap: 12,
              })}
            >
              {p.images?.[0]?.url ? (
                <AuthedImage
                  uri={p.images[0].url}
                  style={{ width: 30, height: 30, borderRadius: 8, backgroundColor: colors.gray[100] }}
                  placeholderBg={colors.primary[50]}
                />
              ) : (
                <View style={{ width: 30, height: 30, borderRadius: 8, backgroundColor: colors.primary[50], alignItems: 'center', justifyContent: 'center' }}>
                  <Ionicons name="cube-outline" size={16} color={colors.primary[600]} />
                </View>
              )}
              <View style={{ flex: 1 }}>
                <Text style={{ fontSize: 13, fontWeight: '700', fontFamily: 'monospace', color: colors.primary[700] }}>{p.trackingNumber}</Text>
                <Text style={{ fontSize: 13, color: colors.gray[700] }} numberOfLines={1}>{p.designation}</Text>
                <View style={{ marginTop: 2 }}>
                  <ParcelStatusContext parcel={p} compact />
                </View>
                {p.price != null && <Text style={{ fontSize: 11, color: colors.gray[500], marginTop: 2 }}>{formatAmount(Number(p.price))}</Text>}
              </View>
              <View style={{ alignItems: 'flex-end', gap: 4 }}>
                <Badge variant={p.status === 'DELIVERED' ? 'success' : p.status === 'IN_TRANSIT' ? 'warning' : 'default'}>{parcelStatusLabel(p.status)}</Badge>
                <Ionicons name="chevron-forward" size={16} color={colors.gray[300]} />
              </View>
            </Pressable>
          )}
        />
      )}
    </View>
  );
}
