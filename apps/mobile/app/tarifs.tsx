import { ScrollView, View, Text, Pressable, RefreshControl } from 'react-native';
import { useState } from 'react';
import { useRouter } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useQuery } from '@tanstack/react-query';
import { Ionicons } from '@expo/vector-icons';
import { Card } from '@/components/ui/Card';
import { Badge } from '@/components/ui/Badge';
import { portalApi } from '@/lib/api/portal';
import { colors, spacing } from '@/lib/theme/colors';

interface MyTariff {
  id: string;
  route: {
    id: string;
    name: string;
    type: 'AIR' | 'SEA' | 'LAND';
    departureCity: string;
    arrivalCity: string;
  };
  unit: 'kg' | 'm3';
  partnerPrice: number;
  standardPrice: number;
  savings: number;
  savingsPercent: number;
  isAdvantage: boolean;
}

const TYPE_META: Record<MyTariff['route']['type'], { label: string; icon: keyof typeof Ionicons.glyphMap }> = {
  AIR: { label: 'Aerien', icon: 'airplane-outline' },
  SEA: { label: 'Maritime', icon: 'boat-outline' },
  LAND: { label: 'Terrestre', icon: 'car-outline' },
};

function formatXaf(n: number): string {
  return `${Math.round(n).toLocaleString('fr-FR')} FCFA`;
}

export default function TarifsScreen() {
  const router = useRouter();
  const [refreshing, setRefreshing] = useState(false);
  const { data, refetch } = useQuery({
    queryKey: ['portal', 'tariffs'],
    queryFn: () => portalApi.myTariffs(),
  });
  const tariffs: MyTariff[] = data?.data ?? [];

  const onRefresh = async () => {
    setRefreshing(true);
    await refetch();
    setRefreshing(false);
  };

  return (
    <View style={{ flex: 1, backgroundColor: 'transparent' }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', padding: spacing.lg, gap: 12 }}>
        <Pressable onPress={() => router.back()} hitSlop={10}>
          <Ionicons name="arrow-back" size={22} color={colors.gray[700]} />
        </Pressable>
        <Text style={{ fontSize: 17, fontWeight: '600', color: colors.gray[900] }}>Mes tarifs</Text>
      </View>

      <ScrollView
        contentContainerStyle={{ padding: spacing.lg, gap: spacing.md, paddingBottom: 80 }}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.primary[500]} />}
      >
        <Text style={{ fontSize: 13, color: colors.gray[500] }}>
          Tarifs partenaire negocies sur vos routes de transit.
        </Text>

        {tariffs.length === 0 ? (
          <Card>
            <View style={{ alignItems: 'center', gap: spacing.md, paddingVertical: spacing.lg }}>
              <View style={{ width: 56, height: 56, borderRadius: 18, backgroundColor: colors.primary[50], alignItems: 'center', justifyContent: 'center' }}>
                <Ionicons name="pricetags-outline" size={28} color={colors.primary[600]} />
              </View>
              <Text style={{ fontSize: 13, color: colors.gray[500], textAlign: 'center' }}>
                Aucun tarif partenaire dedie pour le moment.
              </Text>
            </View>
          </Card>
        ) : (
          tariffs.map((t) => {
            const tm = TYPE_META[t.route.type];
            return (
              <Card key={t.id}>
                <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 12 }}>
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12, flex: 1 }}>
                    <View style={{ width: 42, height: 42, borderRadius: 14, backgroundColor: colors.primary[50], alignItems: 'center', justifyContent: 'center' }}>
                      <Ionicons name={tm.icon} size={22} color={colors.primary[600]} />
                    </View>
                    <View style={{ flex: 1 }}>
                      <Text style={{ fontSize: 14, fontWeight: '600', color: colors.gray[900] }} numberOfLines={1}>
                        {t.route.name}
                      </Text>
                      <Text style={{ fontSize: 12, color: colors.gray[500] }} numberOfLines={1}>
                        {tm.label} · {t.route.departureCity} → {t.route.arrivalCity}
                      </Text>
                    </View>
                  </View>
                  {t.isAdvantage && <Badge variant="success">-{t.savingsPercent}%</Badge>}
                </View>

                <View style={{ flexDirection: 'row', alignItems: 'baseline', gap: 8, marginTop: spacing.md, paddingTop: spacing.sm, borderTopWidth: 1, borderTopColor: colors.gray[100] }}>
                  <Text style={{ fontSize: 18, fontWeight: '700', color: colors.gray[900] }}>
                    {formatXaf(t.partnerPrice)}
                    <Text style={{ fontSize: 12, fontWeight: '400', color: colors.gray[500] }}> /{t.unit}</Text>
                  </Text>
                  {t.isAdvantage && t.standardPrice > 0 && (
                    <Text style={{ fontSize: 13, color: colors.gray[400], textDecorationLine: 'line-through' }}>
                      {formatXaf(t.standardPrice)}/{t.unit}
                    </Text>
                  )}
                </View>
              </Card>
            );
          })
        )}
      </ScrollView>
    </View>
  );
}
