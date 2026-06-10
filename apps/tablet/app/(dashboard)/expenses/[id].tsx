import { View, Text, ScrollView, Pressable, ActivityIndicator, RefreshControl } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useQuery } from '@tanstack/react-query';
import { formatAmount, formatDate } from '@transitsoftservices/shared';
import { Card } from '@/components/ui/Card';
import { Badge } from '@/components/ui/Badge';
import { SectionCard, InfoCard } from '@/components/data/DetailCards';
import { AttachmentsSection } from '@/components/data/AttachmentsSection';
import { usePullRefresh } from '@/lib/hooks/usePullRefresh';
import { expensesApi } from '@/lib/api/finance';
import { colors } from '@/lib/theme/colors';
import { spacing } from '@/lib/theme/spacing';

function ERow({ icon, label, value }: { icon: keyof typeof Ionicons.glyphMap; label: string; value?: string | null }) {
  if (!value) return null;
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.md, paddingVertical: 8, borderBottomWidth: 1, borderBottomColor: colors.gray[50] }}>
      <Ionicons name={icon} size={16} color={colors.gray[400]} />
      <Text style={{ fontSize: 13, color: colors.gray[500], width: 120 }}>{label}</Text>
      <Text style={{ flex: 1, fontSize: 13, color: colors.gray[900], fontWeight: '500', textAlign: 'right' }}>{value}</Text>
    </View>
  );
}

export default function ExpenseDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const eId = String(id);
  const router = useRouter();
  const { data, isLoading, refetch } = useQuery({ queryKey: ['expenses', eId], queryFn: () => expensesApi.getById(eId), enabled: !!eId });
  const { refreshing, onRefresh } = usePullRefresh(refetch);

  const e = data?.data;
  if (isLoading) return <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}><ActivityIndicator size="large" color={colors.primary[500]} /></View>;
  if (!e) return <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', padding: spacing['3xl'] }}><Text style={{ color: colors.gray[500] }}>Depense introuvable</Text></View>;

  return (
    <View style={{ flex: 1, backgroundColor: 'transparent' }}>
      <ScrollView style={{ flex: 1 }} contentContainerStyle={{ padding: spacing['2xl'], gap: spacing.xl }} refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.primary[500]} />}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.lg }}>
          <Pressable onPress={() => router.navigate('/expenses')} style={({ pressed }) => ({ width: 40, height: 40, borderRadius: 12, alignItems: 'center', justifyContent: 'center', backgroundColor: pressed ? colors.gray[100] : 'transparent' })}>
            <Ionicons name="arrow-back" size={22} color={colors.gray[600]} />
          </Pressable>
          <View style={{ flex: 1 }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.sm, flexWrap: 'wrap' }}>
              <Text style={{ fontSize: 22, fontWeight: '700', color: colors.gray[900] }}>{e.title}</Text>
              {!!e.category && <Badge variant="info">{e.category}</Badge>}
            </View>
            <Text style={{ fontSize: 13, color: colors.gray[500], marginTop: 2 }}>Enregistree le {e.createdAt ? formatDate(e.createdAt) : '-'}</Text>
          </View>
        </View>

        <Card>
          <View style={{ alignItems: 'center', paddingVertical: spacing.lg }}>
            <Text style={{ fontSize: 11, textTransform: 'uppercase', letterSpacing: 0.5, color: colors.gray[400] }}>Montant de la depense</Text>
            <Text style={{ fontSize: 30, fontWeight: '700', color: colors.error, marginTop: 6 }}>{formatAmount(Number(e.amount ?? 0))}</Text>
          </View>
        </Card>

        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: spacing.md }}>
          <InfoCard icon="business-outline" label="Agence" value={e.agency?.name ?? '-'} />
          <InfoCard icon="person-circle-outline" label="Approuve par" value={e.approvedBy ? `${e.approvedBy.firstName ?? ''} ${e.approvedBy.lastName ?? ''}`.trim() : 'Non approuve'} />
          <InfoCard icon="calendar-outline" label="Date" value={e.createdAt ? formatDate(e.createdAt) : '-'} />
        </View>

        <SectionCard title="Details">
          <ERow icon="document-text-outline" label="Titre" value={e.title} />
          <ERow icon="pricetag-outline" label="Motif" value={e.reason} />
          <ERow icon="document-outline" label="Description" value={e.description} />
          <ERow icon="albums-outline" label="Categorie" value={e.category} />
          <ERow icon="cash-outline" label="Montant" value={formatAmount(Number(e.amount ?? 0))} />
        </SectionCard>

        <AttachmentsSection parentType="expense" parentId={eId} readonly={!!e.isPaid} />
      </ScrollView>
    </View>
  );
}
