import { View, Text } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { colors } from '@/lib/theme/colors';
import { spacing } from '@/lib/theme/spacing';

interface PlaceholderScreenProps {
  title: string;
  subtitle?: string;
  icon?: keyof typeof Ionicons.glyphMap;
  description?: string;
}

export function PlaceholderScreen({
  title,
  subtitle,
  icon = 'construct-outline',
  description = 'Cette section sera disponible prochainement sur tablette.',
}: PlaceholderScreenProps) {
  return (
    <View style={{ flex: 1, backgroundColor: 'transparent', padding: spacing['2xl'] }}>
      <View style={{ marginBottom: spacing['2xl'] }}>
        <Text style={{ fontSize: 26, fontWeight: '700', color: colors.gray[900] }}>{title}</Text>
        {subtitle && (
          <Text style={{ fontSize: 14, color: colors.gray[500], marginTop: 4 }}>{subtitle}</Text>
        )}
      </View>
      <View
        style={{
          flex: 1,
          alignItems: 'center',
          justifyContent: 'center',
          gap: 12,
        }}
      >
        <Ionicons name={icon as never} size={48} color={colors.gray[300]} />
        <Text style={{ fontSize: 15, color: colors.gray[500], textAlign: 'center', maxWidth: 320 }}>
          {description}
        </Text>
      </View>
    </View>
  );
}
