import { useState } from 'react';
import { View, Text, FlatList, RefreshControl, ActivityIndicator } from 'react-native';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Ionicons } from '@expo/vector-icons';
import { portalApi } from '@/lib/api/portal';
import { colors, radius, spacing } from '@/lib/theme/colors';

export default function NotificationsTab() {
  const qc = useQueryClient();
  const [refreshing, setRefreshing] = useState(false);
  const { data, refetch, isLoading } = useQuery({
    queryKey: ['portal', 'notifications'],
    queryFn: () => portalApi.notifications(),
  });
  const items = (data?.data ?? []) as any[];

  const onRefresh = async () => {
    setRefreshing(true);
    await refetch();
    setRefreshing(false);
  };

  const markRead = async (id: string) => {
    try {
      await portalApi.markNotificationRead(id);
      qc.invalidateQueries({ queryKey: ['portal', 'notifications'] });
    } catch {}
  };

  return (
    <View style={{ flex: 1, backgroundColor: 'transparent' }}>
      {isLoading ? (
        <ActivityIndicator color={colors.primary[500]} style={{ marginTop: 40 }} />
      ) : (
        <FlatList
          data={items}
          keyExtractor={(n) => n.id}
          contentContainerStyle={{ padding: spacing.lg, paddingBottom: 80, gap: spacing.sm }}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.primary[500]} />}
          ListEmptyComponent={
            <View style={{ alignItems: 'center', padding: 40 }}>
              <Ionicons name="notifications-outline" size={40} color={colors.gray[300]} />
              <Text style={{ fontSize: 13, color: colors.gray[500], marginTop: 8 }}>Aucune notification</Text>
            </View>
          }
          renderItem={({ item: n }) => (
            <View
              onTouchEnd={() => !n.readAt && markRead(n.id)}
              style={{
                backgroundColor: colors.white,
                borderRadius: radius.lg,
                padding: spacing.lg,
                gap: 4,
                borderLeftWidth: !n.readAt ? 3 : 0,
                borderLeftColor: colors.primary[500],
              }}
            >
              <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                <Text style={{ fontSize: 14, fontWeight: '600', color: colors.gray[900], flex: 1 }}>{n.title ?? 'Notification'}</Text>
                {!n.readAt && <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: colors.primary[500] }} />}
              </View>
              {n.body && <Text style={{ fontSize: 13, color: colors.gray[600] }}>{n.body}</Text>}
              <Text style={{ fontSize: 11, color: colors.gray[400], marginTop: 2 }}>{n.createdAt?.slice(0, 16)}</Text>
            </View>
          )}
        />
      )}
    </View>
  );
}
