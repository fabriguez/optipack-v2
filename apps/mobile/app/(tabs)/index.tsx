import { ScrollView, View, Text, RefreshControl, ActivityIndicator, TextInput, Pressable } from 'react-native';
import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { Card, CardHeader } from '@/components/ui/Card';
import { Badge } from '@/components/ui/Badge';
import { portalApi } from '@/lib/api/portal';
import { useAuth } from '@/lib/auth/AuthContext';
import { colors, radius, spacing } from '@/lib/theme/colors';
import { formatAmount } from '@transitsoftservices/shared';
import { parcelStatusLabel } from '@/lib/labels';

export default function HomeScreen() {
  const { user } = useAuth();
  const router = useRouter();
  const [refreshing, setRefreshing] = useState(false);
  const [tracking, setTracking] = useState('');

  const { data, refetch, isLoading } = useQuery({
    queryKey: ['portal', 'dashboard'],
    queryFn: () => portalApi.dashboard(),
  });

  const stats = data?.data;

  const onRefresh = async () => {
    setRefreshing(true);
    await refetch();
    setRefreshing(false);
  };

  const submitTracking = () => {
    const t = tracking.trim();
    if (!t) return;
    router.push(`/track?tracking=${encodeURIComponent(t)}` as never);
  };

  return (
    <ScrollView
      style={{ flex: 1, backgroundColor: 'transparent' }}
      contentContainerStyle={{ padding: spacing.lg, gap: spacing.lg }}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.primary[500]} />}
    >
      <View>
        <Text style={{ fontSize: 13, color: colors.gray[500] }}>Bonjour</Text>
        <Text style={{ fontSize: 22, fontWeight: '700', color: colors.gray[900] }}>
          {user?.fullName?.split(' ')[0] ?? 'Client'}
        </Text>
      </View>

      <Card>
        <CardHeader title="Suivre un colis" subtitle="Saisissez le numero de tracking" />
        <View style={{ flexDirection: 'row', gap: 8 }}>
          <TextInput
            value={tracking}
            onChangeText={setTracking}
            placeholder="TS-XXXXX..."
            placeholderTextColor={colors.gray[400]}
            autoCapitalize="characters"
            style={{
              flex: 1,
              height: 44,
              borderWidth: 1,
              borderColor: colors.gray[300],
              borderRadius: radius.md,
              paddingHorizontal: spacing.lg,
              fontSize: 14,
              color: colors.gray[900],
              backgroundColor: colors.white,
            }}
            onSubmitEditing={submitTracking}
          />
          <Pressable
            onPress={submitTracking}
            style={({ pressed }) => ({
              height: 44,
              paddingHorizontal: 18,
              borderRadius: radius.md,
              backgroundColor: colors.primary[500],
              alignItems: 'center',
              justifyContent: 'center',
              opacity: pressed ? 0.85 : 1,
            })}
          >
            <Ionicons name="arrow-forward" size={18} color={colors.white} />
          </Pressable>
        </View>
      </Card>

      {isLoading ? (
        <ActivityIndicator color={colors.primary[500]} />
      ) : (
        <>
          <View style={{ flexDirection: 'row', gap: spacing.md }}>
            <KpiTile label="Total colis" value={stats?.parcels?.total ?? 0} icon="cube-outline" color={colors.primary[500]} />
            <KpiTile label="En transit" value={stats?.parcels?.inTransit ?? 0} icon="airplane-outline" color="#FF9800" />
          </View>
          <View style={{ flexDirection: 'row', gap: spacing.md }}>
            <KpiTile label="Arrives" value={stats?.parcels?.arrived ?? 0} icon="checkmark-done-outline" color="#388E3C" />
            <KpiTile label="En magasinage" value={stats?.parcels?.inStorage ?? 0} icon="file-tray-stacked-outline" color="#7E57C2" />
          </View>
          <KpiTile
            label="Solde a payer"
            value={formatAmount(
              Number(
                stats?.balanceDue ??
                  Number(stats?.debts?.remaining ?? 0) + Number(stats?.invoices?.unpaidBalance ?? 0),
              ),
            )}
            icon="wallet-outline"
            color={colors.error}
            small
          />
          <View style={{ flexDirection: 'row', gap: spacing.md }}>
            <KpiTile
              label="Factures impayees"
              value={stats?.invoices?.unpaidCount ?? 0}
              icon="document-text-outline"
              color="#E53935"
            />
            <KpiTile
              label="Dettes actives"
              value={formatAmount(Number(stats?.debts?.remaining ?? 0))}
              icon="cash-outline"
              color="#F4511E"
              small
            />
          </View>
          <Pressable onPress={() => router.push('/loyalty' as never)}>
            <KpiTile
              label="Points de fidelite"
              value={stats?.loyalty?.points ?? 0}
              icon="gift-outline"
              color={colors.primary[600]}
            />
          </Pressable>

          {(stats?.recentParcels ?? []).length > 0 && (
            <Card>
              <CardHeader title="Derniers colis" />
              {(stats?.recentParcels ?? []).slice(0, 5).map((p: any) => (
                <Pressable
                  key={p.id}
                  onPress={() => router.push(`/parcels/${p.trackingNumber}` as never)}
                  style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: colors.gray[100] }}
                >
                  <View style={{ flex: 1 }}>
                    <Text style={{ fontSize: 12, fontWeight: '700', fontFamily: 'monospace', color: colors.primary[700] }}>{p.trackingNumber}</Text>
                    <Text style={{ fontSize: 12, color: colors.gray[600] }} numberOfLines={1}>{p.designation}</Text>
                  </View>
                  <Badge variant={p.status === 'DELIVERED' ? 'success' : p.status === 'IN_TRANSIT' ? 'warning' : 'default'}>{parcelStatusLabel(p.status)}</Badge>
                </Pressable>
              ))}
            </Card>
          )}
        </>
      )}
    </ScrollView>
  );
}

function KpiTile({ label, value, icon, color, small }: { label: string; value: string | number; icon: keyof typeof Ionicons.glyphMap; color: string; small?: boolean }) {
  return (
    <View style={{ flex: 1, backgroundColor: colors.white, borderRadius: radius.lg, padding: spacing.lg, gap: 6, borderWidth: 1, borderColor: colors.gray[300] }}>
      <View style={{ width: 32, height: 32, borderRadius: 10, backgroundColor: colors.primary[50], alignItems: 'center', justifyContent: 'center' }}>
        <Ionicons name={icon} size={18} color={color} />
      </View>
      <Text style={{ fontSize: small ? 16 : 22, fontWeight: '700', color: colors.gray[900] }}>{value}</Text>
      <Text style={{ fontSize: 11, color: colors.gray[500] }}>{label}</Text>
    </View>
  );
}
