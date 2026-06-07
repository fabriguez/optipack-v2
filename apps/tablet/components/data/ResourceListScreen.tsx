import { useMemo, useState, type ReactNode } from 'react';
import {
  View,
  Text,
  TextInput,
  FlatList,
  Pressable,
  RefreshControl,
  ActivityIndicator,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useQuery, type QueryKey } from '@tanstack/react-query';
import { colors } from '@/lib/theme/colors';
import { radius, spacing } from '@/lib/theme/spacing';
import { Can } from '@/components/auth/Can';
import { useOnlineStatus } from '@/lib/hooks/useOnlineStatus';

interface ListParams {
  search?: string;
  limit?: number;
  page?: number;
  [k: string]: unknown;
}

export interface ResourceListScreenProps<T> {
  title: string;
  subtitle?: string;
  /** React Query key (we add `params` automatically). */
  queryKey: QueryKey;
  fetcher: (params: ListParams) => Promise<{ data?: T[] } | T[]>;
  renderRow: (item: T) => ReactNode;
  keyExtractor: (item: T) => string;
  emptyText?: string;
  /** Permission required to see "Nouveau" button. */
  createPermission?: string | string[];
  onCreate?: () => void;
  /** Optional right-aligned secondary actions in header. */
  headerActions?: ReactNode;
  searchPlaceholder?: string;
  /** Extra static filters merged into params. */
  staticParams?: Record<string, unknown>;
  pageSize?: number;
}

export function ResourceListScreen<T>({
  title,
  subtitle,
  queryKey,
  fetcher,
  renderRow,
  keyExtractor,
  emptyText = 'Aucun resultat',
  createPermission,
  onCreate,
  headerActions,
  searchPlaceholder = 'Rechercher...',
  staticParams,
  pageSize = 50,
}: ResourceListScreenProps<T>) {
  const [search, setSearch] = useState('');
  const [refreshing, setRefreshing] = useState(false);
  const online = useOnlineStatus();

  const params = useMemo<ListParams>(
    () => ({ search: search || undefined, limit: pageSize, page: 1, ...staticParams }),
    [search, pageSize, staticParams],
  );

  const query = useQuery({
    queryKey: [...(queryKey as readonly unknown[]), params],
    queryFn: () => fetcher(params),
  });

  const items = useMemo<T[]>(() => {
    const raw = query.data as { data?: T[] } | T[] | undefined;
    if (!raw) return [];
    if (Array.isArray(raw)) return raw;
    return raw.data ?? [];
  }, [query.data]);

  const onRefresh = async () => {
    setRefreshing(true);
    try {
      await query.refetch();
    } finally {
      setRefreshing(false);
    }
  };

  return (
    <View style={{ flex: 1, backgroundColor: 'transparent' }}>
      <View style={{ padding: spacing['2xl'], paddingBottom: spacing.lg }}>
        <View style={{ flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between', gap: spacing.lg }}>
          <View style={{ flex: 1 }}>
            <Text style={{ fontSize: 26, fontWeight: '700', color: colors.gray[900] }}>{title}</Text>
            {subtitle && (
              <Text style={{ fontSize: 14, color: colors.gray[500], marginTop: 4 }}>{subtitle}</Text>
            )}
          </View>
          <View style={{ flexDirection: 'row', gap: spacing.sm }}>
            {headerActions}
            {onCreate && (
              <CreateButton permission={createPermission} onPress={onCreate} disabled={!online} />
            )}
          </View>
        </View>

        <View
          style={{
            marginTop: spacing.lg,
            flexDirection: 'row',
            alignItems: 'center',
            gap: spacing.sm,
            backgroundColor: colors.white,
            borderRadius: radius.md,
            borderWidth: 1,
            borderColor: colors.gray[200],
            paddingHorizontal: spacing.lg,
            height: 44,
          }}
        >
          <Ionicons name="search" size={18} color={colors.gray[400]} />
          <TextInput
            value={search}
            onChangeText={setSearch}
            placeholder={searchPlaceholder}
            placeholderTextColor={colors.gray[400]}
            style={{ flex: 1, fontSize: 14, color: colors.gray[900] }}
          />
          {search.length > 0 && (
            <Pressable onPress={() => setSearch('')} hitSlop={10}>
              <Ionicons name="close-circle" size={18} color={colors.gray[400]} />
            </Pressable>
          )}
        </View>
      </View>

      {query.isLoading ? (
        <View style={{ paddingTop: 60, alignItems: 'center' }}>
          <ActivityIndicator size="large" color={colors.primary[500]} />
        </View>
      ) : (
        <FlatList
          data={items}
          keyExtractor={keyExtractor}
          contentContainerStyle={{ paddingHorizontal: spacing['2xl'], paddingBottom: spacing['3xl'] }}
          renderItem={({ item }) => <View>{renderRow(item)}</View>}
          ItemSeparatorComponent={() => (
            <View style={{ height: 1, backgroundColor: colors.gray[100], marginVertical: 4 }} />
          )}
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={onRefresh}
              tintColor={colors.primary[500]}
            />
          }
          ListEmptyComponent={
            <View style={{ alignItems: 'center', padding: 40 }}>
              <Ionicons name="document-outline" size={36} color={colors.gray[300]} />
              <Text style={{ fontSize: 14, color: colors.gray[500], marginTop: 8 }}>{emptyText}</Text>
              {!online && (
                <Text style={{ fontSize: 12, color: colors.gray[400], marginTop: 4 }}>
                  Mode hors ligne - donnees du cache
                </Text>
              )}
            </View>
          }
        />
      )}
    </View>
  );
}

function CreateButton({
  permission,
  onPress,
  disabled,
}: {
  permission?: string | string[];
  onPress: () => void;
  disabled?: boolean;
}) {
  const btn = (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      style={({ pressed }) => ({
        flexDirection: 'row',
        alignItems: 'center',
        gap: 6,
        height: 40,
        paddingHorizontal: spacing.lg,
        borderRadius: radius.md,
        backgroundColor: colors.gray[900],
        opacity: disabled ? 0.5 : pressed ? 0.85 : 1,
      })}
    >
      <Ionicons name="add" size={18} color={colors.white} />
      <Text style={{ fontSize: 13, fontWeight: '600', color: colors.white }}>Nouveau</Text>
    </Pressable>
  );
  if (!permission) return btn;
  return <Can permission={permission}>{btn}</Can>;
}
