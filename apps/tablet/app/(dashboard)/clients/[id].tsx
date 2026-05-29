import { ScrollView, View, Text, ActivityIndicator, Pressable } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useQuery } from '@tanstack/react-query';
import { Ionicons } from '@expo/vector-icons';
import { Card, CardHeader } from '@/components/ui/Card';
import { Badge } from '@/components/ui/Badge';
import { clientsApi } from '@/lib/api/clients';
import { colors } from '@/lib/theme/colors';
import { spacing } from '@/lib/theme/spacing';

function Row({ label, value }: { label: string; value?: string | number | null }) {
  if (value == null || value === '') return null;
  return (
    <View style={{ flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 8, borderBottomWidth: 1, borderBottomColor: colors.gray[100] }}>
      <Text style={{ fontSize: 13, color: colors.gray[500] }}>{label}</Text>
      <Text style={{ fontSize: 13, color: colors.gray[900], fontWeight: '500' }}>{String(value)}</Text>
    </View>
  );
}

export default function ClientDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const { data, isLoading } = useQuery({
    queryKey: ['clients', id],
    queryFn: () => clientsApi.getById(id ?? ''),
    enabled: !!id,
  });
  const c = data?.data;

  if (isLoading) {
    return <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}><ActivityIndicator color={colors.primary[500]} /></View>;
  }
  if (!c) {
    return <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}><Text style={{ color: colors.gray[500] }}>Client introuvable</Text></View>;
  }

  return (
    <ScrollView style={{ flex: 1, backgroundColor: 'transparent' }} contentContainerStyle={{ padding: spacing['2xl'], gap: spacing.lg }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.md }}>
        <Pressable onPress={() => router.back()} hitSlop={10}>
          <Ionicons name="arrow-back" size={22} color={colors.gray[700]} />
        </Pressable>
        <View style={{ flex: 1 }}>
          <Text style={{ fontSize: 22, fontWeight: '700', color: colors.gray[900] }}>{c.fullName}</Text>
          <Text style={{ fontSize: 13, color: colors.gray[500] }}>{c.phone}</Text>
        </View>
        {c.clientType && <Badge>{c.clientType}</Badge>}
      </View>

      <Card>
        <CardHeader title="Coordonnees" />
        <View style={{ padding: spacing.lg }}>
          <Row label="Email" value={c.email} />
          <Row label="Telephone" value={c.phone} />
          <Row label="Adresse" value={c.address} />
          <Row label="Agence" value={c.agency?.name} />
          <Row label="Tier fidelite" value={c.loyaltyTier} />
          <Row label="Cree le" value={c.createdAt?.slice(0, 10)} />
        </View>
      </Card>
    </ScrollView>
  );
}
