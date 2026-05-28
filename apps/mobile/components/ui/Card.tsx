import { View, Text, type ViewProps } from 'react-native';
import type { ReactNode } from 'react';
import { colors, radius, spacing } from '@/lib/theme/colors';

interface CardProps extends ViewProps {
  children: ReactNode;
}

export function Card({ children, style, ...props }: CardProps) {
  return (
    <View
      style={[
        {
          backgroundColor: colors.card,
          borderRadius: radius.lg,
          padding: spacing.lg,
          shadowColor: '#000',
          shadowOpacity: 0.05,
          shadowRadius: 8,
          shadowOffset: { width: 0, height: 2 },
          elevation: 2,
        },
        style,
      ]}
      {...props}
    >
      {children}
    </View>
  );
}

export function CardHeader({ title, subtitle, right }: { title: string; subtitle?: string; right?: ReactNode }) {
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: spacing.md }}>
      <View style={{ flex: 1 }}>
        <Text style={{ fontSize: 16, fontWeight: '600', color: colors.gray[900] }}>{title}</Text>
        {subtitle && <Text style={{ fontSize: 12, color: colors.gray[500], marginTop: 2 }}>{subtitle}</Text>}
      </View>
      {right}
    </View>
  );
}
