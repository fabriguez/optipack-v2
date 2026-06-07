import { useEffect, useState } from 'react';
import { View, Text, TextInput, Pressable } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { SectionCard } from '../_components';
import { Button } from '@/components/ui/Button';
import { useAgencyReviewConfig, useSaveReviewConfig } from '@/lib/hooks/useAgencyDetail';
import { colors } from '@/lib/theme/colors';
import { radius, spacing } from '@/lib/theme/spacing';

const CADENCES = [
  { value: 'MONTHLY', label: 'Mensuel' },
  { value: 'QUARTERLY', label: 'Trimestriel' },
  { value: 'YEARLY', label: 'Annuel' },
];

interface Criterion {
  key: string;
  label: string;
  maxScore: number;
  isAuto?: boolean;
}

export function ReviewConfigTab({ agencyId }: { agencyId: string }) {
  const { data } = useAgencyReviewConfig(agencyId);
  const save = useSaveReviewConfig(agencyId);

  const [cadence, setCadence] = useState('MONTHLY');
  const [criteria, setCriteria] = useState<Criterion[]>([]);

  useEffect(() => {
    const cfg = data?.data ?? data;
    if (cfg) {
      setCadence(cfg.cadence ?? 'MONTHLY');
      setCriteria(Array.isArray(cfg.criteria) ? cfg.criteria : []);
    }
  }, [data]);

  const updateCriterion = (i: number, patch: Partial<Criterion>) =>
    setCriteria((prev) => prev.map((c, idx) => (idx === i ? { ...c, ...patch } : c)));

  const removeCriterion = (i: number) => setCriteria((prev) => prev.filter((_, idx) => idx !== i));

  const addManual = () => setCriteria((prev) => [...prev, { key: '', label: '', maxScore: 10 }]);

  return (
    <SectionCard
      title="Grille d'evaluation"
      subtitle="Criteres et cadence des evaluations"
      action={<Button size="sm" loading={save.isPending} onPress={() => save.mutate({ cadence, criteria })}>Enregistrer</Button>}
    >
      <View style={{ gap: spacing.lg }}>
        {/* Cadence */}
        <View>
          <Text style={{ fontSize: 13, fontWeight: '500', color: colors.gray[700], marginBottom: spacing.sm }}>Cadence</Text>
          <View style={{ flexDirection: 'row', gap: spacing.sm }}>
            {CADENCES.map((c) => (
              <Pressable
                key={c.value}
                onPress={() => setCadence(c.value)}
                style={{
                  paddingVertical: 8,
                  paddingHorizontal: spacing.lg,
                  borderRadius: radius.md,
                  borderWidth: 1,
                  borderColor: cadence === c.value ? colors.primary[400] : colors.gray[300],
                  backgroundColor: cadence === c.value ? colors.primary[50] : colors.white,
                }}
              >
                <Text style={{ fontSize: 13, fontWeight: '600', color: cadence === c.value ? colors.primary[700] : colors.gray[600] }}>{c.label}</Text>
              </Pressable>
            ))}
          </View>
        </View>

        {/* Criteres */}
        <View style={{ gap: spacing.sm }}>
          {criteria.map((c, i) => (
            <View key={i} style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.sm }}>
              <TextInput
                value={c.key}
                editable={!c.isAuto}
                onChangeText={(v) => updateCriterion(i, { key: v })}
                placeholder="cle"
                placeholderTextColor={colors.gray[400]}
                style={[fieldStyle, { width: 110, backgroundColor: c.isAuto ? colors.gray[100] : colors.white }]}
              />
              <TextInput
                value={c.label}
                onChangeText={(v) => updateCriterion(i, { label: v })}
                placeholder="Libelle"
                placeholderTextColor={colors.gray[400]}
                style={[fieldStyle, { flex: 1 }]}
              />
              <TextInput
                value={String(c.maxScore ?? '')}
                onChangeText={(v) => updateCriterion(i, { maxScore: Number(v) || 0 })}
                placeholder="Max"
                keyboardType="numeric"
                placeholderTextColor={colors.gray[400]}
                style={[fieldStyle, { width: 70, textAlign: 'center' }]}
              />
              {c.isAuto ? (
                <Ionicons name="lock-closed" size={18} color={colors.gray[400]} style={{ width: 32, textAlign: 'center' }} />
              ) : (
                <Pressable onPress={() => removeCriterion(i)} style={{ width: 32, alignItems: 'center' }}>
                  <Ionicons name="trash-outline" size={18} color={colors.error} />
                </Pressable>
              )}
            </View>
          ))}
        </View>

        <Button size="sm" variant="outline" onPress={addManual}>Ajouter un critere</Button>
      </View>
    </SectionCard>
  );
}

const fieldStyle = {
  height: 40,
  borderWidth: 1,
  borderColor: colors.gray[300],
  borderRadius: radius.md,
  paddingHorizontal: spacing.md,
  fontSize: 14,
  color: colors.gray[900],
} as const;
