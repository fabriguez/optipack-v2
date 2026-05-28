import { ScrollView, View, Text, ActivityIndicator, Pressable, Alert } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { Card, CardHeader } from '@/components/ui/Card';
import { Badge } from '@/components/ui/Badge';
import { Can } from '@/components/auth/Can';
import { useParcel, useParcelHistory, useUpdateParcelStatus } from '@/lib/hooks/useParcels';
import { colors } from '@/lib/theme/colors';
import { spacing, radius } from '@/lib/theme/spacing';
import { formatAmount } from '@transitsoftservices/shared';

const NEXT_STATUS: Record<string, string> = {
  PENDING: 'IN_TRANSIT',
  IN_TRANSIT: 'AT_DESTINATION',
  AT_DESTINATION: 'DELIVERED',
};

function Row({ label, value }: { label: string; value?: string | number | null }) {
  if (value == null || value === '') return null;
  return (
    <View style={{ flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 8, borderBottomWidth: 1, borderBottomColor: colors.gray[100] }}>
      <Text style={{ fontSize: 13, color: colors.gray[500] }}>{label}</Text>
      <Text style={{ fontSize: 13, color: colors.gray[900], fontWeight: '500', flexShrink: 1, textAlign: 'right' }}>{String(value)}</Text>
    </View>
  );
}

export default function ParcelDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const { data, isLoading } = useParcel(id ?? '');
  const { data: hist } = useParcelHistory(id ?? '');
  const updateStatus = useUpdateParcelStatus();

  if (isLoading) {
    return (
      <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.background }}>
        <ActivityIndicator color={colors.primary[500]} />
      </View>
    );
  }

  const p = data?.data;
  if (!p) {
    return (
      <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.background }}>
        <Text style={{ color: colors.gray[500] }}>Colis introuvable</Text>
      </View>
    );
  }

  const next = NEXT_STATUS[p.status];
  const confirmAdvance = () => {
    if (!next) return;
    Alert.alert('Avancer le statut', `Passer a "${next}" ?`, [
      { text: 'Annuler', style: 'cancel' },
      { text: 'Confirmer', onPress: () => updateStatus.mutate({ id: p.id, status: next }) },
    ]);
  };

  return (
    <ScrollView style={{ flex: 1, backgroundColor: colors.background }} contentContainerStyle={{ padding: spacing['2xl'], gap: spacing.lg }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.md }}>
        <Pressable onPress={() => router.back()} hitSlop={10}>
          <Ionicons name="arrow-back" size={22} color={colors.gray[700]} />
        </Pressable>
        <View style={{ flex: 1 }}>
          <Text style={{ fontSize: 22, fontWeight: '700', color: colors.gray[900], fontFamily: 'monospace' }}>{p.trackingNumber}</Text>
          <Text style={{ fontSize: 14, color: colors.gray[500], marginTop: 2 }}>{p.designation}</Text>
        </View>
        <Badge variant={p.status === 'DELIVERED' ? 'success' : p.status === 'IN_TRANSIT' ? 'warning' : 'default'}>{p.status}</Badge>
      </View>

      {next && (
        <Can permission="parcel.update.status">
          <Pressable
            onPress={confirmAdvance}
            disabled={updateStatus.isPending}
            style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, height: 44, borderRadius: radius.md, backgroundColor: colors.primary[500], opacity: updateStatus.isPending ? 0.6 : 1 }}
          >
            <Ionicons name="arrow-forward" size={18} color={colors.white} />
            <Text style={{ color: colors.white, fontSize: 14, fontWeight: '600' }}>Passer a {next}</Text>
          </Pressable>
        </Can>
      )}

      <Card>
        <CardHeader title="Details" />
        <View style={{ padding: spacing.lg }}>
          <Row label="Client" value={p.client?.fullName} />
          <Row label="Destinataire" value={p.recipient?.fullName} />
          <Row label="Magasin" value={p.warehouse?.name} />
          <Row label="Route" value={p.transitRoute?.name} />
          <Row label="Conteneur" value={p.container?.designation} />
          <Row label="Poids" value={p.weight ? `${p.weight} kg` : null} />
          <Row label="Volume" value={p.volume ? `${p.volume} m3` : null} />
          <Row label="Prix" value={p.price != null ? formatAmount(Number(p.price)) : null} />
          <Row label="Observation" value={p.observation} />
          <Row label="Cree le" value={p.createdAt?.slice(0, 16)} />
        </View>
      </Card>

      {hist?.data && hist.data.length > 0 && (
        <Card>
          <CardHeader title="Historique" />
          <View style={{ padding: spacing.lg, gap: 8 }}>
            {(hist.data as any[]).map((h) => (
              <View key={h.id} style={{ flexDirection: 'row', gap: spacing.md, alignItems: 'flex-start' }}>
                <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: colors.primary[500], marginTop: 6 }} />
                <View style={{ flex: 1 }}>
                  <Text style={{ fontSize: 13, color: colors.gray[900], fontWeight: '500' }}>{h.action ?? h.event}</Text>
                  <Text style={{ fontSize: 11, color: colors.gray[500] }}>{h.createdAt?.slice(0, 16)} - {h.user?.fullName ?? h.user?.email ?? ''}</Text>
                  {h.note && <Text style={{ fontSize: 12, color: colors.gray[600], marginTop: 2 }}>{h.note}</Text>}
                </View>
              </View>
            ))}
          </View>
        </Card>
      )}
    </ScrollView>
  );
}
