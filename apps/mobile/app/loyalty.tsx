import { ScrollView, View, Text, Pressable } from 'react-native';
import { useRouter } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useQuery } from '@tanstack/react-query';
import { Ionicons } from '@expo/vector-icons';
import { Card } from '@/components/ui/Card';
import { Badge } from '@/components/ui/Badge';
import { portalApi } from '@/lib/api/portal';
import { colors, spacing } from '@/lib/theme/colors';

const TIER_LABEL: Record<string, string> = {
  STANDARD: 'Standard',
  SILVER: 'Argent',
  GOLD: 'Or',
  VIP: 'VIP',
};

export default function LoyaltyScreen() {
  const router = useRouter();
  const { data } = useQuery({ queryKey: ['portal', 'me'], queryFn: () => portalApi.me() });
  const me = data?.data;

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: 'transparent' }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', padding: spacing.lg, gap: 12 }}>
        <Pressable onPress={() => router.back()} hitSlop={10}>
          <Ionicons name="arrow-back" size={22} color={colors.gray[700]} />
        </Pressable>
        <Text style={{ fontSize: 17, fontWeight: '600', color: colors.gray[900] }}>Fidelite</Text>
      </View>

      <ScrollView contentContainerStyle={{ padding: spacing.lg, gap: spacing.lg }}>
        <Card>
          <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
            <View>
              <Text style={{ fontSize: 34, fontWeight: '700', color: colors.gray[900] }}>
                {me?.loyaltyPoints ?? 0}
              </Text>
              <Text style={{ fontSize: 13, color: colors.gray[500] }}>Points de fidelite cumules</Text>
            </View>
            <View style={{ width: 52, height: 52, borderRadius: 16, backgroundColor: colors.primary[50], alignItems: 'center', justifyContent: 'center' }}>
              <Ionicons name="gift-outline" size={26} color={colors.primary[600]} />
            </View>
          </View>
          <View style={{ flexDirection: 'row', gap: 8, marginTop: spacing.md }}>
            <Badge variant="default">Palier {TIER_LABEL[me?.loyaltyTier ?? 'STANDARD'] ?? me?.loyaltyTier}</Badge>
            <Badge variant={me?.isPartner ? 'success' : 'default'}>
              {me?.isPartner ? 'Partenaire' : 'Non partenaire'}
            </Badge>
          </View>
        </Card>

        <Card>
          <View style={{ alignItems: 'center', gap: spacing.md, paddingVertical: spacing.md }}>
            <View style={{ width: 56, height: 56, borderRadius: 18, backgroundColor: colors.primary[50], alignItems: 'center', justifyContent: 'center' }}>
              <Ionicons name="time-outline" size={28} color={colors.primary[600]} />
            </View>
            <Text style={{ fontSize: 16, fontWeight: '700', color: colors.gray[900], textAlign: 'center' }}>
              Conversion bientot disponible
            </Text>
            <Text style={{ fontSize: 13, color: colors.gray[500], textAlign: 'center', lineHeight: 19 }}>
              La conversion de vos points de fidelite en avantages arrive prochainement.
              Continuez a cumuler des points a chaque envoi.
            </Text>
          </View>
        </Card>
      </ScrollView>
    </SafeAreaView>
  );
}
