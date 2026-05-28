import { View, Text } from 'react-native';
import { Card } from './Card';
import { colors } from '@/lib/theme/colors';
import { radius } from '@/lib/theme/spacing';

interface KpiCardProps {
  label: string;
  value: string | number;
  icon: React.ReactNode;
  iconBg?: string;
  accentColor?: string;
}

export function KpiCard({ label, value, icon, iconBg = colors.primary[50], accentColor = colors.primary[500] }: KpiCardProps) {
  return (
    <Card style={{ overflow: 'hidden' }}>
      <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start' }}>
        <View>
          <Text style={{ fontSize: 11, fontWeight: '500', textTransform: 'uppercase', letterSpacing: 0.5, color: colors.gray[400] }}>
            {label}
          </Text>
          <Text style={{ fontSize: 28, fontWeight: '700', color: colors.gray[900], marginTop: 8 }}>
            {value}
          </Text>
        </View>
        <View style={{ width: 44, height: 44, borderRadius: radius.md, backgroundColor: iconBg, alignItems: 'center', justifyContent: 'center' }}>
          {icon}
        </View>
      </View>
      <View style={{ position: 'absolute', bottom: 0, left: 0, right: 0, height: 3, backgroundColor: accentColor, opacity: 0.8 }} />
    </Card>
  );
}
