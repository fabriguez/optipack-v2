import { type ReactNode } from 'react';
import { View, Text, Pressable } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { colors } from '@/lib/theme/colors';
import { radius, spacing } from '@/lib/theme/spacing';

/** En-tete de page standard (mirror web : titre + sous-titre/compte a gauche, actions a droite). */
export function PageHeader({
  title,
  subtitle,
  actions,
  left,
}: {
  title: string;
  subtitle?: string;
  actions?: ReactNode;
  /** Element optionnel a gauche du titre (ex: bouton retour, avatar). */
  left?: ReactNode;
}) {
  return (
    <View
      style={{
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        gap: spacing.lg,
      }}
    >
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.lg, flex: 1 }}>
        {left}
        <View style={{ flex: 1 }}>
          <Text style={{ fontSize: 26, fontWeight: '700', color: colors.gray[900] }}>{title}</Text>
          {subtitle && <Text style={{ fontSize: 14, color: colors.gray[500], marginTop: 4 }}>{subtitle}</Text>}
        </View>
      </View>
      {actions && <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.sm }}>{actions}</View>}
    </View>
  );
}

/** Bouton d'action d'en-tete (icone + libelle), variantes primary / outline. */
export function HeaderAction({
  label,
  icon,
  onPress,
  variant = 'primary',
  disabled,
}: {
  label: string;
  icon?: keyof typeof Ionicons.glyphMap;
  onPress: () => void;
  variant?: 'primary' | 'outline';
  disabled?: boolean;
}) {
  const isPrimary = variant === 'primary';
  return (
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
        borderWidth: isPrimary ? 0 : 1,
        borderColor: colors.gray[300],
        backgroundColor: isPrimary ? colors.gray[900] : pressed ? colors.gray[50] : colors.white,
        opacity: disabled ? 0.5 : pressed && isPrimary ? 0.85 : 1,
      })}
    >
      {icon && <Ionicons name={icon} size={16} color={isPrimary ? colors.white : colors.gray[700]} />}
      <Text style={{ fontSize: 13, fontWeight: '600', color: isPrimary ? colors.white : colors.gray[700] }}>{label}</Text>
    </Pressable>
  );
}
