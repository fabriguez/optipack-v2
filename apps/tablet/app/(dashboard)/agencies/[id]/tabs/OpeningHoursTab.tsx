import { useEffect, useState } from 'react';
import { View, Text, TextInput, Switch } from 'react-native';
import { SectionCard } from '../_components';
import { Button } from '@/components/ui/Button';
import { useAgencyOpeningHours, useSaveOpeningHours } from '@/lib/hooks/useAgencyDetail';
import { colors } from '@/lib/theme/colors';
import { radius, spacing } from '@/lib/theme/spacing';

const DAYS = ['Lundi', 'Mardi', 'Mercredi', 'Jeudi', 'Vendredi', 'Samedi', 'Dimanche'];

interface DayHours {
  dayOfWeek: number;
  isOpen: boolean;
  openTime: string;
  closeTime: string;
}

function defaultHours(): DayHours[] {
  return DAYS.map((_, i) => ({ dayOfWeek: i, isOpen: i < 5, openTime: '08:00', closeTime: '17:00' }));
}

export function OpeningHoursTab({ agencyId }: { agencyId: string }) {
  const { data } = useAgencyOpeningHours(agencyId);
  const save = useSaveOpeningHours(agencyId);
  const [hours, setHours] = useState<DayHours[]>(defaultHours());

  useEffect(() => {
    const raw: any[] = data?.data ?? data ?? [];
    if (Array.isArray(raw) && raw.length > 0) {
      const merged = defaultHours().map((d) => {
        const found = raw.find((h) => Number(h.dayOfWeek) === d.dayOfWeek);
        return found
          ? { dayOfWeek: d.dayOfWeek, isOpen: !!found.isOpen, openTime: found.openTime ?? '08:00', closeTime: found.closeTime ?? '17:00' }
          : d;
      });
      setHours(merged);
    }
  }, [data]);

  const updateDay = (index: number, patch: Partial<DayHours>) => {
    setHours((prev) => prev.map((d, i) => (i === index ? { ...d, ...patch } : d)));
  };

  return (
    <SectionCard
      title="Horaires d'ouverture"
      subtitle="Definir les heures par jour"
      action={<Button size="sm" loading={save.isPending} onPress={() => save.mutate(hours)}>Enregistrer</Button>}
    >
      <View style={{ gap: spacing.md }}>
        {hours.map((d, i) => (
          <View
            key={i}
            style={{
              flexDirection: 'row',
              alignItems: 'center',
              gap: spacing.md,
              paddingVertical: spacing.sm,
              borderBottomWidth: i < hours.length - 1 ? 1 : 0,
              borderBottomColor: colors.gray[100],
            }}
          >
            <Text style={{ width: 90, fontSize: 14, fontWeight: '500', color: colors.gray[800] }}>{DAYS[i]}</Text>
            <Switch
              value={d.isOpen}
              onValueChange={(v) => updateDay(i, { isOpen: v })}
              trackColor={{ true: colors.primary[400], false: colors.gray[300] }}
              thumbColor={colors.white}
            />
            {d.isOpen ? (
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.sm, flex: 1 }}>
                <TimeBox value={d.openTime} onChange={(v) => updateDay(i, { openTime: v })} />
                <Text style={{ color: colors.gray[400] }}>-</Text>
                <TimeBox value={d.closeTime} onChange={(v) => updateDay(i, { closeTime: v })} />
              </View>
            ) : (
              <Text style={{ flex: 1, fontSize: 13, color: colors.gray[400] }}>Ferme</Text>
            )}
          </View>
        ))}
      </View>
    </SectionCard>
  );
}

function TimeBox({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  return (
    <TextInput
      value={value}
      onChangeText={onChange}
      placeholder="08:00"
      placeholderTextColor={colors.gray[400]}
      style={{
        width: 80,
        height: 40,
        borderWidth: 1,
        borderColor: colors.gray[300],
        borderRadius: radius.md,
        paddingHorizontal: spacing.md,
        fontSize: 14,
        color: colors.gray[900],
        textAlign: 'center',
      }}
    />
  );
}
