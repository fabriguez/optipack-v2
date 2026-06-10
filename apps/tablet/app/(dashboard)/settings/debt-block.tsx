import { useEffect, useState } from 'react';
import { View, Text, ScrollView, Pressable, Switch } from 'react-native';
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
import { spacing } from '@/lib/theme/spacing';

export default function DebtBlockScreen() {
  const router = useRouter();
  const qc = useQueryClient();
  const { data } = useQuery({ queryKey: ['config', 'debt-block'], queryFn: () => apiClient.get('/config/debt-block').then((r) => r.data) });
  const [handoverOn, setHandoverOn] = useState(false);
  const [handoverThreshold, setHandoverThreshold] = useState('0');
  const [shipmentOn, setShipmentOn] = useState(false);
  const [shipmentThreshold, setShipmentThreshold] = useState('0');

  useEffect(() => {
    const c = data?.data ?? data ?? {};
    setHandoverOn(!!c.handoverEnabled); setHandoverThreshold(String(c.handoverThreshold ?? 0));
    setShipmentOn(!!c.shipmentEnabled); setShipmentThreshold(String(c.shipmentThreshold ?? 0));
  }, [data]);

  const save = useMutation({
    mutationFn: () => apiClient.patch('/config/debt-block', { handoverEnabled: handoverOn, handoverThreshold: Number(handoverThreshold) || 0, shipmentEnabled: shipmentOn, shipmentThreshold: Number(shipmentThreshold) || 0 }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['config', 'debt-block'] }); toast.success('Enregistre'); },
    onError: (e) => toast.error(extractApiError(e, 'Erreur')),
  });

  return (
    <View style={{ flex: 1, backgroundColor: 'transparent' }}>
      <ScrollView style={{ flex: 1 }} contentContainerStyle={{ padding: spacing['2xl'], gap: spacing.xl }} keyboardShouldPersistTaps="handled">
        <PageHeader title="Blocage sur dettes" subtitle="Refus auto si dette > seuil" left={<Pressable onPress={() => router.navigate('/settings')}><Ionicons name="arrow-back" size={22} color={colors.gray[600]} /></Pressable>} actions={<Button size="sm" loading={save.isPending} onPress={() => save.mutate()}>Enregistrer</Button>} />
        <SectionCard title="Remise de colis">
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.md, paddingVertical: spacing.sm }}>
            <Switch value={handoverOn} onValueChange={setHandoverOn} trackColor={{ true: colors.primary[400], false: colors.gray[300] }} thumbColor={colors.white} />
            <Text style={{ fontSize: 14, color: colors.gray[700] }}>Bloquer la remise si dette superieure au seuil</Text>
          </View>
          <Input label="Seuil (FCFA)" value={handoverThreshold} onChangeText={setHandoverThreshold} keyboardType="numeric" />
        </SectionCard>
        <SectionCard title="Creation de colis">
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.md, paddingVertical: spacing.sm }}>
            <Switch value={shipmentOn} onValueChange={setShipmentOn} trackColor={{ true: colors.primary[400], false: colors.gray[300] }} thumbColor={colors.white} />
            <Text style={{ fontSize: 14, color: colors.gray[700] }}>Bloquer la creation si dette superieure au seuil</Text>
          </View>
          <Input label="Seuil (FCFA)" value={shipmentThreshold} onChangeText={setShipmentThreshold} keyboardType="numeric" />
        </SectionCard>
      </ScrollView>
    </View>
  );
}
