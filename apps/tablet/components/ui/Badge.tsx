import { View, Text } from 'react-native';
import { colors } from '@/lib/theme/colors';
import { radius } from '@/lib/theme/spacing';

type Variant = 'default' | 'success' | 'warning' | 'error' | 'info';

const variants: Record<Variant, { bg: string; text: string }> = {
  default: { bg: colors.gray[100], text: colors.gray[700] },
  success: { bg: '#E8F5E9', text: '#1B5E20' },
  warning: { bg: '#FFF3E0', text: '#E65100' },
  error: { bg: '#FFEBEE', text: '#C62828' },
  info: { bg: '#E3F2FD', text: '#1565C0' },
};

export function Badge({ children, variant = 'default' }: { children: string; variant?: Variant }) {
  const v = variants[variant];
  return (
    <View style={{ backgroundColor: v.bg, paddingHorizontal: 10, paddingVertical: 3, borderRadius: radius.sm, alignSelf: 'flex-start' }}>
      <Text style={{ fontSize: 11, fontWeight: '600', color: v.text }}>{children}</Text>
    </View>
  );
}
