import { View, Text, type ViewProps } from 'react-native';
import { colors } from '@/lib/theme/colors';
import { radius, spacing } from '@/lib/theme/spacing';

interface CardProps extends ViewProps {
  children: React.ReactNode;
  padding?: 'sm' | 'md' | 'lg';
}

export function Card({ children, padding = 'md', style, ...props }: CardProps) {
  const paddings = { sm: spacing.lg, md: spacing['2xl'], lg: spacing['3xl'] };
  return (
    <View
      style={[
        {
          backgroundColor: colors.card,
          borderRadius: radius.lg,
          padding: paddings[padding],
          shadowColor: colors.black,
          shadowOffset: { width: 0, height: 1 },
          shadowOpacity: 0.05,
          shadowRadius: 3,
          elevation: 1,
        },
        style,
      ]}
      {...props}
    >
      {children}
    </View>
  );
}

export function CardHeader({ title, subtitle, right }: { title: string; subtitle?: string; right?: React.ReactNode }) {
  return (
    <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: spacing.lg }}>
      <View>
        <Text style={{ fontSize: 17, fontWeight: '600', color: colors.gray[900] }}>{title}</Text>
        {subtitle && <Text style={{ fontSize: 13, color: colors.gray[500], marginTop: 2 }}>{subtitle}</Text>}
      </View>
      {right}
    </View>
  );
}
