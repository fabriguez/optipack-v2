import { Text, Pressable, ScrollView } from 'react-native';
import { colors, radius, spacing } from '@/lib/theme/colors';

/**
 * Filtre par periode pour l'historique. Presets en jours (null = tout).
 * Evite d'ajouter un date-picker natif : suffisant pour "filtrer par periode".
 */
const OPTIONS: Array<{ label: string; days: number | null }> = [
  { label: 'Tout', days: null },
  { label: '7 jours', days: 7 },
  { label: '30 jours', days: 30 },
  { label: '3 mois', days: 90 },
  { label: '12 mois', days: 365 },
];

/** Retourne la borne basse YYYY-MM-DD pour N jours en arriere, ou undefined. */
export function sinceDays(days: number | null): string | undefined {
  if (!days) return undefined;
  const d = new Date();
  d.setDate(d.getDate() - days);
  return d.toISOString().slice(0, 10);
}

export function PeriodChips({
  value,
  onChange,
}: {
  value: number | null;
  onChange: (days: number | null) => void;
}) {
  return (
    <ScrollView
      horizontal
      showsHorizontalScrollIndicator={false}
      contentContainerStyle={{ gap: spacing.sm, paddingTop: spacing.md }}
    >
      {OPTIONS.map((opt) => {
        const active = opt.days === value;
        return (
          <Pressable
            key={opt.label}
            onPress={() => onChange(opt.days)}
            style={{
              paddingHorizontal: 14,
              height: 32,
              borderRadius: radius.full,
              borderWidth: 1,
              borderColor: active ? colors.primary[500] : colors.gray[200],
              backgroundColor: active ? colors.primary[50] : colors.white,
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            <Text
              style={{
                fontSize: 12,
                fontWeight: active ? '700' : '500',
                color: active ? colors.primary[700] : colors.gray[600],
              }}
            >
              {opt.label}
            </Text>
          </Pressable>
        );
      })}
    </ScrollView>
  );
}
