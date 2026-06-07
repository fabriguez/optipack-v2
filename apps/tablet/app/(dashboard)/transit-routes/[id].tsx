import { useState } from 'react';
import { View, Text, ScrollView, Pressable, ActivityIndicator, RefreshControl } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { formatAmount } from '@transitsoftservices/shared';
import { Card } from '@/components/ui/Card';
import { Badge } from '@/components/ui/Badge';
import { HeaderAction } from '@/components/data/PageHeader';
import { InfoCard } from '@/components/data/DetailCards';
import { usePullRefresh } from '@/lib/hooks/usePullRefresh';
import { useTransitRoute } from '@/lib/hooks/useTransitRoutes';
import { colors } from '@/lib/theme/colors';
import { spacing } from '@/lib/theme/spacing';
import { TransitRouteFormDialog } from './TransitRouteFormDialog';

const TYPE: Record<string, { label: string; variant: 'info' | 'warning' | 'success'; icon: keyof typeof import('@expo/vector-icons').Ionicons.glyphMap }> = {
  AIR: { label: 'Aerien', variant: 'info', icon: 'airplane' },
  SEA: { label: 'Maritime', variant: 'warning', icon: 'boat' },
  LAND: { label: 'Terrestre', variant: 'success', icon: 'bus' },
};

export default function TransitRouteDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const { data, isLoading, refetch } = useTransitRoute(String(id));
  const { refreshing, onRefresh } = usePullRefresh(refetch);
  const [showEdit, setShowEdit] = useState(false);

  const route = data?.data;
  if (isLoading) return <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}><ActivityIndicator size="large" color={colors.primary[500]} /></View>;
  if (!route) return <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', padding: spacing['3xl'] }}><Text style={{ color: colors.gray[500] }}>Route introuvable</Text></View>;

  const t = TYPE[route.type] ?? TYPE.AIR;

  return (
    <View style={{ flex: 1, backgroundColor: 'transparent' }}>
      <ScrollView style={{ flex: 1 }} contentContainerStyle={{ padding: spacing['2xl'], gap: spacing.xl }} refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.primary[500]} />}>
        <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: spacing.lg }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.lg, flex: 1 }}>
            <Pressable onPress={() => router.navigate('/transit-routes')} style={({ pressed }) => ({ width: 40, height: 40, borderRadius: 12, alignItems: 'center', justifyContent: 'center', backgroundColor: pressed ? colors.gray[100] : 'transparent' })}>
              <Ionicons name="arrow-back" size={22} color={colors.gray[600]} />
            </Pressable>
            <View style={{ flex: 1 }}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.sm, flexWrap: 'wrap' }}>
                <Text style={{ fontSize: 24, fontWeight: '700', color: colors.gray[900] }}>{route.name}</Text>
                <Badge variant={t.variant}>{t.label}</Badge>
                <Badge variant={route.isActive === false ? 'error' : 'success'}>{route.isActive === false ? 'Inactif' : 'Actif'}</Badge>
              </View>
            </View>
          </View>
          <HeaderAction label="Modifier" icon="create-outline" variant="outline" onPress={() => setShowEdit(true)} />
        </View>

        {/* Diagramme */}
        <Card>
          <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
            <View style={{ alignItems: 'center', flex: 1 }}>
              <Ionicons name="location" size={22} color={colors.primary[600]} />
              <Text style={{ fontSize: 15, fontWeight: '600', color: colors.gray[900], marginTop: 4 }}>{route.departureCity}</Text>
              <Text style={{ fontSize: 12, color: colors.gray[400] }}>{route.departureCountry}</Text>
            </View>
            <View style={{ alignItems: 'center', flex: 1 }}>
              <Ionicons name={t.icon} size={26} color={colors.primary[500]} />
              <Text style={{ fontSize: 12, color: colors.gray[400], marginTop: 4 }}>{route.estimatedDurationDays ?? 0} jours</Text>
              <View style={{ height: 2, backgroundColor: colors.gray[200], alignSelf: 'stretch', marginTop: 6 }} />
            </View>
            <View style={{ alignItems: 'center', flex: 1 }}>
              <Ionicons name="location" size={22} color={colors.primary[600]} />
              <Text style={{ fontSize: 15, fontWeight: '600', color: colors.gray[900], marginTop: 4 }}>{route.arrivalCity}</Text>
              <Text style={{ fontSize: 12, color: colors.gray[400] }}>{route.arrivalCountry}</Text>
            </View>
          </View>
        </Card>

        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: spacing.md }}>
          <InfoCard icon="cash-outline" label="Prix / kg" value={route.pricePerKg != null ? formatAmount(Number(route.pricePerKg)) : '-'} />
          <InfoCard icon="cube-outline" label="Prix / m3" value={route.pricePerVolume != null ? formatAmount(Number(route.pricePerVolume)) : '-'} />
          <InfoCard icon="time-outline" label="Delai estime" value={`${route.estimatedDurationDays ?? 0} jours`} />
          <InfoCard icon="git-network-outline" label="Type" value={t.label} />
        </View>
      </ScrollView>

      <TransitRouteFormDialog open={showEdit} onClose={() => setShowEdit(false)} route={route} />
    </View>
  );
}
