import { type ReactNode } from 'react';
import { View, Text } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Card } from '@/components/ui/Card';
import { colors } from '@/lib/theme/colors';
import { radius, spacing } from '@/lib/theme/spacing';

/** Carte avec en-tete (titre + action) pour les pages de detail. */
export function SectionCard({ title, subtitle, action, children }: { title: string; subtitle?: string; action?: ReactNode; children: ReactNode }) {
  return (
    <Card>
      <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: spacing.lg }}>
        <View style={{ flex: 1 }}>
          <Text style={{ fontSize: 16, fontWeight: '600', color: colors.gray[900] }}>{title}</Text>
          {!!subtitle && <Text style={{ fontSize: 13, color: colors.gray[500], marginTop: 2 }}>{subtitle}</Text>}
        </View>
        {action}
      </View>
      {children}
    </Card>
  );
}

export function InfoCard({ icon, label, value }: { icon: keyof typeof Ionicons.glyphMap; label: string; value: string }) {
  return (
    <Card padding="sm" style={{ flex: 1, minWidth: 150 }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.md }}>
        <View style={{ width: 40, height: 40, borderRadius: radius.md, backgroundColor: colors.primary[50], alignItems: 'center', justifyContent: 'center' }}>
          <Ionicons name={icon} size={20} color={colors.primary[600]} />
        </View>
        <View style={{ flex: 1 }}>
          <Text style={{ fontSize: 11, textTransform: 'uppercase', letterSpacing: 0.5, color: colors.gray[400] }}>{label}</Text>
          <Text style={{ fontSize: 14, fontWeight: '500', color: colors.gray[900] }} numberOfLines={1}>{value}</Text>
        </View>
      </View>
    </Card>
  );
}

export function StatCard({ label, value, color = colors.gray[900], hint }: { label: string; value: string; color?: string; hint?: string }) {
  return (
    <Card style={{ flex: 1, minWidth: 140 }}>
      <Text style={{ fontSize: 11, textTransform: 'uppercase', letterSpacing: 0.5, color: colors.gray[400] }}>{label}</Text>
      <Text style={{ fontSize: 22, fontWeight: '700', color, marginTop: 6 }}>{value}</Text>
      {!!hint && <Text style={{ fontSize: 12, color: colors.gray[400], marginTop: 2 }}>{hint}</Text>}
    </Card>
  );
}

export function EmptyState({ text }: { text: string }) {
  return (
    <View style={{ alignItems: 'center', paddingVertical: 32, gap: spacing.sm }}>
      <Ionicons name="file-tray-outline" size={32} color={colors.gray[300]} />
      <Text style={{ fontSize: 13, color: colors.gray[400] }}>{text}</Text>
    </View>
  );
}
