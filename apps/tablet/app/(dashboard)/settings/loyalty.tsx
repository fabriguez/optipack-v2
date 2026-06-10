import { useEffect, useState } from 'react';
import { View, Text, ScrollView, Pressable } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { PageHeader } from '@/components/data/PageHeader';
import { SectionCard } from '@/components/data/DetailCards';
import { apiClient } from '@/lib/api/client';
import { toast } from '@/lib/toast';
import { extractApiError } from '@/lib/api/errorMessage';
import { colors } from '@/lib/theme/colors';
import { radius, spacing } from '@/lib/theme/spacing';

interface Tier { name: string; minPoints: string; discountPercent: string; benefits: string }

export default function LoyaltySettingsScreen() {
  const router = useRouter();
  const qc = useQueryClient();
  const { data } = useQuery({ queryKey: ['loyalty-tiers'], queryFn: () => apiClient.get('/loyalty/tiers').then((r) => r.data) });
  const [tiers, setTiers] = useState<Tier[]>([]);

  useEffect(() => {
    const raw: any[] = data?.data ?? [];
    setTiers(raw.map((t) => ({ name: t.name ?? '', minPoints: String(t.minPoints ?? 0), discountPercent: String(t.discountPercent ?? 0), benefits: t.benefits ?? '' })));
  }, [data]);

  const save = useMutation({
    mutationFn: () => apiClient.put('/loyalty/tiers', { tiers: tiers.map((t) => ({ name: t.name, minPoints: Number(t.minPoints) || 0, discountPercent: Number(t.discountPercent) || 0, benefits: t.benefits || undefined })) }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['loyalty-tiers'] }); toast.success('Paliers enregistres'); },
    onError: (e) => toast.error(extractApiError(e, 'Erreur')),
  });

  const upd = (i: number, p: Partial<Tier>) => setTiers((prev) => prev.map((t, idx) => (idx === i ? { ...t, ...p } : t)));

  return (
    <View style={{ flex: 1, backgroundColor: 'transparent' }}>
      <ScrollView style={{ flex: 1 }} contentContainerStyle={{ padding: spacing['2xl'], gap: spacing.xl }} keyboardShouldPersistTaps="handled">
        <PageHeader title="Programme de fidelite" subtitle="Paliers + reductions + avantages" left={<Pressable onPress={() => router.navigate('/settings')}><Ionicons name="arrow-back" size={22} color={colors.gray[600]} /></Pressable>} actions={<Button size="sm" loading={save.isPending} onPress={() => save.mutate()}>Enregistrer</Button>} />
        <SectionCard title={`Paliers (${tiers.length})`} action={<Button size="sm" variant="outline" onPress={() => setTiers((p) => [...p, { name: '', minPoints: '0', discountPercent: '0', benefits: '' }])}>+ Ajouter</Button>}>
          <View style={{ gap: spacing.md }}>
            {tiers.map((t, i) => (
              <View key={i} style={{ borderWidth: 1, borderColor: colors.gray[200], borderRadius: radius.md, padding: spacing.lg, gap: spacing.sm }}>
                <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
                  <Text style={{ fontSize: 13, fontWeight: '700', color: colors.primary[700] }}>Palier {i + 1}</Text>
                  <Pressable onPress={() => setTiers((p) => p.filter((_, idx) => idx !== i))} hitSlop={6}><Ionicons name="trash-outline" size={18} color={colors.error} /></Pressable>
                </View>
                <View style={{ flexDirection: 'row', gap: spacing.md }}>
                  <View style={{ flex: 1 }}><Input label="Nom" value={t.name} onChangeText={(v) => upd(i, { name: v })} /></View>
                  <View style={{ flex: 1 }}><Input label="Points min" value={t.minPoints} onChangeText={(v) => upd(i, { minPoints: v })} keyboardType="numeric" /></View>
                  <View style={{ flex: 1 }}><Input label="Reduction %" value={t.discountPercent} onChangeText={(v) => upd(i, { discountPercent: v })} keyboardType="numeric" /></View>
                </View>
                <Input label="Avantages" value={t.benefits} onChangeText={(v) => upd(i, { benefits: v })} multiline />
              </View>
            ))}
          </View>
        </SectionCard>
      </ScrollView>
    </View>
  );
}
