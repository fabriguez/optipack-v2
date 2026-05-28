import { Text, View } from 'react-native';
import type { ReactNode } from 'react';
import { colors } from '@/lib/theme/colors';

type Variant = 'default' | 'success' | 'warning' | 'error' | 'info';

const styles: Record<Variant, { bg: string; fg: string }> = {
  default: { bg: colors.gray[100], fg: colors.gray[700] },
  success: { bg: '#E8F5E9', fg: '#1B5E20' },
  warning: { bg: '#FFF3E0', fg: '#E65100' },
  error: { bg: '#FEE2E2', fg: '#B91C1C' },
  info: { bg: '#DBEAFE', fg: '#1E40AF' },
};

export function Badge({ variant = 'default', children }: { variant?: Variant; children: ReactNode }) {
  const s = styles[variant];
  return (
    <View style={{ alignSelf: 'flex-start', backgroundColor: s.bg, paddingHorizontal: 8, paddingVertical: 2, borderRadius: 999 }}>
      <Text style={{ fontSize: 11, fontWeight: '600', color: s.fg }}>{children}</Text>
    </View>
  );
}
