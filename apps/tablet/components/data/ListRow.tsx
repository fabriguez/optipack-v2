import { View, Text, Pressable } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { colors } from '@/lib/theme/colors';
import { Badge } from '@/components/ui/Badge';

export interface ListRowProps {
  title: string;
  subtitle?: string;
  metadata?: string[];
  rightLabel?: string;
  badge?: { label: string; variant?: 'default' | 'success' | 'warning' | 'error' };
  onPress?: () => void;
}

export function ListRow({ title, subtitle, metadata, rightLabel, badge, onPress }: ListRowProps) {
  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => ({
        backgroundColor: pressed ? colors.gray[50] : colors.white,
        flexDirection: 'row',
        alignItems: 'center',
        paddingVertical: 12,
        paddingHorizontal: 12,
        borderRadius: 12,
        gap: 12,
      })}
    >
      <View style={{ flex: 1, gap: 2 }}>
        <Text style={{ fontSize: 14, fontWeight: '600', color: colors.gray[900] }} numberOfLines={1}>
          {title}
        </Text>
        {subtitle && (
          <Text style={{ fontSize: 13, color: colors.gray[600] }} numberOfLines={2}>
            {subtitle}
          </Text>
        )}
        {metadata && metadata.length > 0 && (
          <Text style={{ fontSize: 12, color: colors.gray[400] }} numberOfLines={1}>
            {metadata.filter(Boolean).join(' - ')}
          </Text>
        )}
      </View>
      <View style={{ alignItems: 'flex-end', gap: 4 }}>
        {rightLabel && (
          <Text style={{ fontSize: 14, fontWeight: '700', color: colors.gray[900] }}>
            {rightLabel}
          </Text>
        )}
        {badge && <Badge variant={badge.variant ?? 'default'}>{badge.label}</Badge>}
      </View>
      {onPress && <Ionicons name="chevron-forward" size={16} color={colors.gray[300]} />}
    </Pressable>
  );
}
