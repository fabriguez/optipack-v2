import { ScrollView, View, Text, ActivityIndicator, Pressable } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useQuery } from '@tanstack/react-query';
import { Ionicons } from '@expo/vector-icons';
import { Card, CardHeader } from '@/components/ui/Card';
import { Badge } from '@/components/ui/Badge';
import { portalApi } from '@/lib/api/portal';
import { colors, spacing } from '@/lib/theme/colors';
import { formatAmount } from '@transitsoftservices/shared';

function Row({ label, value }: { label: string; value?: string | number | null }) {
  if (value == null || value === '') return null;
  return (
    <View style={{ flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 8, borderBottomWidth: 1, borderBottomColor: colors.gray[100] }}>
      <Text style={{ fontSize: 13, color: colors.gray[500] }}>{label}</Text>
      <Text style={{ fontSize: 13, color: colors.gray[900], fontWeight: '500' }}>{String(value)}</Text>
    </View>
  );
}

export default function ParcelDetail() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const { data, isLoading } = useQuery({
    queryKey: ['portal', 'parcels', id],
    queryFn: () => portalApi.parcelById(id ?? ''),
    enabled: !!id,
  });

  const p = data?.data;

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: colors.background }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', padding: spacing.lg, gap: 12 }}>
        <Pressable onPress={() => router.back()} hitSlop={10}>
          <Ionicons name="arrow-back" size={22} color={colors.gray[700]} />
        </Pressable>
        <Text style={{ fontSize: 17, fontWeight: '600', color: colors.gray[900], flex: 1 }} numberOfLines={1}>
          {p?.trackingNumber ?? 'Colis'}
        </Text>
      </View>
      {isLoading ? (
        <ActivityIndicator color={colors.primary[500]} style={{ marginTop: 40 }} />
      ) : !p ? (
        <Text style={{ textAlign: 'center', color: colors.gray[500], marginTop: 40 }}>Introuvable</Text>
      ) : (
        <ScrollView contentContainerStyle={{ padding: spacing.lg, gap: spacing.lg }}>
          <Card>
            <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
              <Text style={{ fontSize: 18, fontWeight: '700', color: colors.gray[900], fontFamily: 'monospace' }}>{p.trackingNumber}</Text>
              <Badge variant={p.status === 'DELIVERED' ? 'success' : p.status === 'IN_TRANSIT' ? 'warning' : 'default'}>{p.status}</Badge>
            </View>
            <Text style={{ fontSize: 14, color: colors.gray[700] }}>{p.designation}</Text>
          </Card>

          <Card>
            <CardHeader title="Details" />
            <Row label="Poids" value={p.weight ? `${p.weight} kg` : null} />
            <Row label="Volume" value={p.volume ? `${p.volume} m3` : null} />
            <Row label="Prix" value={p.price != null ? formatAmount(Number(p.price)) : null} />
            <Row label="Magasin" value={p.warehouse?.name} />
            <Row label="Route" value={p.transitRoute?.name} />
            <Row label="Cree" value={p.createdAt?.slice(0, 16)} />
          </Card>

          {p.history && p.history.length > 0 && (
            <Card>
              <CardHeader title="Historique" />
              <View style={{ gap: 12 }}>
                {p.history.map((h: any) => (
                  <View key={h.id} style={{ flexDirection: 'row', gap: 12 }}>
                    <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: colors.primary[500], marginTop: 6 }} />
                    <View style={{ flex: 1 }}>
                      <Text style={{ fontSize: 13, fontWeight: '500', color: colors.gray[900] }}>{h.action ?? h.event}</Text>
                      <Text style={{ fontSize: 11, color: colors.gray[500] }}>{h.createdAt?.slice(0, 16)}</Text>
                    </View>
                  </View>
                ))}
              </View>
            </Card>
          )}
        </ScrollView>
      )}
    </SafeAreaView>
  );
}
