import { useState } from 'react';
import { View, Text, ScrollView, RefreshControl, Pressable } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { formatDateTime } from '@transitsoftservices/shared';
import { Card } from '@/components/ui/Card';
import { Badge } from '@/components/ui/Badge';
import { PageHeader, HeaderAction } from '@/components/data/PageHeader';
import { SearchBar } from '@/components/data/SearchBar';
import { useServerPagination } from '@/lib/hooks/useServerPagination';
import { apiClient } from '@/lib/api/client';
import { toast } from '@/lib/toast';
import { colors } from '@/lib/theme/colors';
import { spacing, radius } from '@/lib/theme/spacing';

const TYPE_META: Record<string, { icon: keyof typeof Ionicons.glyphMap; variant: 'info' | 'warning' | 'success' | 'default' }> = {
  EMAIL: { icon: 'mail-outline', variant: 'info' }, SMS: { icon: 'chatbox-outline', variant: 'warning' }, WHATSAPP: { icon: 'logo-whatsapp', variant: 'success' }, PUSH: { icon: 'notifications-outline', variant: 'default' }, IN_APP: { icon: 'notifications-outline', variant: 'default' },
};
const TABS = [{ k: '', l: 'Toutes' }, { k: 'unread', l: 'Non lues' }, { k: 'read', l: 'Lues' }];

export default function NotificationsScreen() {
  const qc = useQueryClient();
  const { page, search, setPage, setSearch, queryParams } = useServerPagination();
  const [statusTab, setStatusTab] = useState('');
  const [refreshing, setRefreshing] = useState(false);

  const { data, refetch } = useQuery({ queryKey: ['notifications', { ...queryParams, status: statusTab }], queryFn: () => apiClient.get('/notifications', { params: { ...queryParams, status: statusTab || undefined } }).then((r) => r.data) });
  const { data: unreadData } = useQuery({ queryKey: ['notifications-unread-count'], queryFn: () => apiClient.get('/notifications/unread-count').then((r) => r.data) });
  const rows: any[] = data?.data ?? [];
  const meta = data?.meta;
  const unread = (unreadData?.count ?? unreadData?.data?.count ?? 0) as number;
  const onRefresh = async () => { setRefreshing(true); await refetch(); setRefreshing(false); };

  const markRead = useMutation({ mutationFn: (id: string) => apiClient.post(`/notifications/${id}/read`), onSuccess: () => { qc.invalidateQueries({ queryKey: ['notifications'] }); qc.invalidateQueries({ queryKey: ['notifications-unread-count'] }); } });
  const markAll = useMutation({ mutationFn: () => apiClient.post('/notifications/read-all'), onSuccess: () => { qc.invalidateQueries({ queryKey: ['notifications'] }); qc.invalidateQueries({ queryKey: ['notifications-unread-count'] }); toast.success('Tout marque comme lu'); } });

  return (
    <View style={{ flex: 1, backgroundColor: 'transparent' }}>
      <ScrollView style={{ flex: 1 }} contentContainerStyle={{ padding: spacing['2xl'], gap: spacing.xl }} keyboardShouldPersistTaps="handled" refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.primary[500]} />}>
        <PageHeader title="Notifications" subtitle={`${meta?.total ?? rows.length} notification(s)${unread > 0 ? ` · ${unread} non lue(s)` : ''}`} actions={<HeaderAction label="Tout marquer lu" icon="checkmark-done-outline" variant="outline" onPress={() => markAll.mutate()} />} />
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.md }}>
          <View style={{ flex: 1 }}><SearchBar value={search} onChange={setSearch} placeholder="Rechercher une notification..." /></View>
        </View>
        <View style={{ flexDirection: 'row', gap: spacing.sm }}>
          {TABS.map((t) => <Pressable key={t.k} onPress={() => { setStatusTab(t.k); setPage(1); }} style={{ paddingVertical: 7, paddingHorizontal: spacing.lg, borderRadius: radius.full, borderWidth: 1, borderColor: statusTab === t.k ? colors.primary[400] : colors.gray[300], backgroundColor: statusTab === t.k ? colors.primary[50] : colors.white }}><Text style={{ fontSize: 13, fontWeight: '600', color: statusTab === t.k ? colors.primary[700] : colors.gray[600] }}>{t.l}</Text></Pressable>)}
        </View>
        <Card padding="sm">
          {rows.length === 0 ? (
            <View style={{ alignItems: 'center', paddingVertical: 48, gap: spacing.sm }}><Ionicons name="notifications-outline" size={40} color={colors.gray[300]} /><Text style={{ fontSize: 14, color: colors.gray[400] }}>Aucune notification</Text></View>
          ) : rows.map((n, i) => {
            const meta2 = TYPE_META[n.type] ?? TYPE_META.IN_APP;
            const isUnread = !n.readAt;
            return (
              <Pressable key={n.id} onPress={() => isUnread && markRead.mutate(n.id)} style={{ flexDirection: 'row', gap: spacing.md, alignItems: 'flex-start', paddingVertical: 12, paddingHorizontal: spacing.md, borderBottomWidth: i < rows.length - 1 ? 1 : 0, borderBottomColor: colors.gray[50], backgroundColor: isUnread ? colors.primary[50] : 'transparent', borderRadius: radius.md }}>
                <Ionicons name={meta2.icon} size={20} color={colors.gray[500]} />
                <View style={{ flex: 1 }}>
                  <Text style={{ fontSize: 14, fontWeight: isUnread ? '700' : '500', color: colors.gray[900] }}>{n.title}</Text>
                  {!!n.message && <Text style={{ fontSize: 13, color: colors.gray[500] }}>{n.message}</Text>}
                  <Text style={{ fontSize: 11, color: colors.gray[400], marginTop: 2 }}>{n.createdAt ? formatDateTime(n.createdAt) : ''}</Text>
                </View>
                <View style={{ alignItems: 'flex-end', gap: 4 }}>
                  <Badge variant={meta2.variant}>{n.type}</Badge>
                  {isUnread && <Badge variant="warning">Non lu</Badge>}
                </View>
              </Pressable>
            );
          })}
          {meta && (meta.totalPages ?? 1) > 1 && (
            <View style={{ flexDirection: 'row', justifyContent: 'center', alignItems: 'center', gap: spacing.lg, paddingVertical: spacing.md }}>
              <Pressable onPress={() => setPage(Math.max(1, page - 1))} disabled={page <= 1}><Ionicons name="chevron-back" size={20} color={page <= 1 ? colors.gray[300] : colors.gray[600]} /></Pressable>
              <Text style={{ fontSize: 13, color: colors.gray[500] }}>{page} / {meta.totalPages}</Text>
              <Pressable onPress={() => setPage(page + 1)} disabled={page >= (meta.totalPages ?? 1)}><Ionicons name="chevron-forward" size={20} color={page >= (meta.totalPages ?? 1) ? colors.gray[300] : colors.gray[600]} /></Pressable>
            </View>
          )}
        </Card>
      </ScrollView>
    </View>
  );
}
