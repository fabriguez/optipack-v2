import { type ReactNode } from 'react';
import { View, Text, Pressable, ScrollView } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Skeleton } from '@/components/ui/Skeleton';
import { colors } from '@/lib/theme/colors';
import { radius, spacing } from '@/lib/theme/spacing';

export interface Column<T> {
  key: string;
  label: string;
  render?: (row: T) => ReactNode;
  width?: number;
  align?: 'left' | 'right' | 'center';
}

interface AppDataTableProps<T> {
  columns: Column<T>[];
  data: T[];
  isLoading?: boolean;
  page?: number;
  totalPages?: number;
  total?: number;
  limit?: number;
  onPageChange?: (page: number) => void;
  onRowClick?: (row: T) => void;
  emptyMessage?: string;
  keyExtractor?: (row: T, index: number) => string;
}

const DEFAULT_WIDTH = 160;

/**
 * Tableau de donnees avec scroll horizontal au drag, skeleton de chargement et
 * pagination (mirror web AppDataTable).
 */
export function AppDataTable<T extends Record<string, any>>({
  columns,
  data,
  isLoading,
  page = 1,
  totalPages = 1,
  total,
  limit = 20,
  onPageChange,
  onRowClick,
  emptyMessage = 'Aucune donnee trouvee',
  keyExtractor,
}: AppDataTableProps<T>) {
  const effectiveTotal = total ?? data.length;
  const startItem = effectiveTotal === 0 ? 0 : (page - 1) * limit + 1;
  const endItem = Math.min(page * limit, effectiveTotal);

  const alignItems = (a?: 'left' | 'right' | 'center') =>
    a === 'right' ? 'flex-end' : a === 'center' ? 'center' : 'flex-start';

  return (
    <View>
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator
        nestedScrollEnabled
        contentContainerStyle={{ flexDirection: 'column', minWidth: '100%' }}
      >
        <View>
          {/* Header */}
          <View
            style={{
              flexDirection: 'row',
              borderBottomWidth: 2,
              borderBottomColor: colors.gray[100],
              paddingHorizontal: spacing.sm,
            }}
          >
            {columns.map((col) => (
              <View
                key={col.key}
                style={{ width: col.width ?? DEFAULT_WIDTH, paddingHorizontal: spacing.md, paddingVertical: 14, alignItems: alignItems(col.align) }}
              >
                <Text style={{ fontSize: 11, fontWeight: '700', textTransform: 'uppercase', letterSpacing: 0.5, color: colors.gray[400] }}>
                  {col.label}
                </Text>
              </View>
            ))}
          </View>

          {/* Body */}
          {isLoading ? (
            Array.from({ length: 6 }).map((_, i) => (
              <View key={i} style={{ flexDirection: 'row', paddingHorizontal: spacing.sm, paddingVertical: 14 }}>
                {columns.map((col) => (
                  <View key={col.key} style={{ width: col.width ?? DEFAULT_WIDTH, paddingHorizontal: spacing.md }}>
                    <Skeleton style={{ height: 14, width: '70%' }} />
                  </View>
                ))}
              </View>
            ))
          ) : data.length === 0 ? null : (
            data.map((row, i) => (
              <Pressable
                key={keyExtractor ? keyExtractor(row, i) : row.id ?? i}
                onPress={() => onRowClick?.(row)}
                style={({ pressed }) => ({
                  flexDirection: 'row',
                  paddingHorizontal: spacing.sm,
                  borderBottomWidth: 1,
                  borderBottomColor: colors.gray[50],
                  backgroundColor: pressed && onRowClick ? colors.primary[50] : i % 2 === 0 ? colors.white : colors.gray[50],
                })}
              >
                {columns.map((col) => (
                  <View
                    key={col.key}
                    style={{ width: col.width ?? DEFAULT_WIDTH, paddingHorizontal: spacing.md, paddingVertical: 14, justifyContent: 'center', alignItems: alignItems(col.align) }}
                  >
                    {col.render ? (
                      col.render(row)
                    ) : (
                      <Text style={{ fontSize: 13, color: colors.gray[700] }} numberOfLines={1}>
                        {String(row[col.key] ?? '')}
                      </Text>
                    )}
                  </View>
                ))}
              </Pressable>
            ))
          )}
        </View>
      </ScrollView>

      {/* Empty state */}
      {!isLoading && data.length === 0 && (
        <View style={{ alignItems: 'center', paddingVertical: 56, gap: spacing.md }}>
          <Ionicons name="file-tray-outline" size={40} color={colors.gray[300]} />
          <Text style={{ fontSize: 14, fontWeight: '500', color: colors.gray[400] }}>{emptyMessage}</Text>
        </View>
      )}

      {/* Pagination */}
      {onPageChange && (
        <View
          style={{
            flexDirection: 'row',
            alignItems: 'center',
            justifyContent: 'space-between',
            borderTopWidth: 1,
            borderTopColor: colors.gray[100],
            paddingHorizontal: spacing.lg,
            paddingVertical: 14,
          }}
        >
          <Text style={{ fontSize: 12, color: colors.gray[500] }}>
            {effectiveTotal > 0 ? `${startItem}-${endItem} sur ${effectiveTotal}` : 'Aucun resultat'}
          </Text>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
            <PageButton icon="chevron-back" onPress={() => onPageChange(page - 1)} disabled={page <= 1} />
            {getPageNumbers(page, totalPages).map((p, idx) =>
              p === '...' ? (
                <Text key={`d${idx}`} style={{ paddingHorizontal: 4, fontSize: 12, color: colors.gray[400] }}>
                  ...
                </Text>
              ) : (
                <Pressable
                  key={p}
                  onPress={() => onPageChange(p as number)}
                  style={{
                    width: 32,
                    height: 32,
                    borderRadius: radius.sm,
                    alignItems: 'center',
                    justifyContent: 'center',
                    backgroundColor: p === page ? colors.primary[500] : 'transparent',
                  }}
                >
                  <Text style={{ fontSize: 12, fontWeight: '600', color: p === page ? colors.white : colors.gray[600] }}>{p}</Text>
                </Pressable>
              ),
            )}
            <PageButton icon="chevron-forward" onPress={() => onPageChange(page + 1)} disabled={page >= totalPages} />
          </View>
        </View>
      )}
    </View>
  );
}

function PageButton({ icon, onPress, disabled }: { icon: 'chevron-back' | 'chevron-forward'; onPress: () => void; disabled?: boolean }) {
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      style={{ width: 32, height: 32, borderRadius: radius.sm, alignItems: 'center', justifyContent: 'center', opacity: disabled ? 0.3 : 1 }}
    >
      <Ionicons name={icon} size={16} color={colors.gray[500]} />
    </Pressable>
  );
}

function getPageNumbers(current: number, total: number): (number | string)[] {
  if (total <= 7) return Array.from({ length: total }, (_, i) => i + 1);
  if (current <= 3) return [1, 2, 3, 4, '...', total];
  if (current >= total - 2) return [1, '...', total - 3, total - 2, total - 1, total];
  return [1, '...', current - 1, current, current + 1, '...', total];
}
