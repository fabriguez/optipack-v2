import { ScrollView, View, Text, Pressable, Alert } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { useQueryClient } from '@tanstack/react-query';
import { useAuth } from '@/lib/auth/AuthContext';
import { useOfflineQueue } from '@/lib/hooks/useOfflineQueue';
import { offlineQueue } from '@/lib/api/offlineQueue';
import { colors } from '@/lib/theme/colors';
import { spacing, radius } from '@/lib/theme/spacing';
import { Card } from '@/components/ui/Card';

function Row({ icon, label, value, onPress, danger }: { icon: keyof typeof Ionicons.glyphMap; label: string; value?: string; onPress?: () => void; danger?: boolean }) {
  return (
    <Pressable
      onPress={onPress}
      style={{ flexDirection: 'row', alignItems: 'center', padding: spacing.lg, gap: spacing.md }}
    >
      <View style={{ width: 36, height: 36, borderRadius: 10, backgroundColor: danger ? '#FEE2E2' : colors.primary[50], alignItems: 'center', justifyContent: 'center' }}>
        <Ionicons name={icon as never} size={18} color={danger ? colors.error : colors.primary[600]} />
      </View>
      <View style={{ flex: 1 }}>
        <Text style={{ fontSize: 14, fontWeight: '500', color: danger ? colors.error : colors.gray[900] }}>{label}</Text>
        {value && <Text style={{ fontSize: 12, color: colors.gray[500], marginTop: 2 }}>{value}</Text>}
      </View>
      {onPress && <Ionicons name="chevron-forward" size={16} color={colors.gray[300]} />}
    </Pressable>
  );
}

export default function SettingsScreen() {
  const { user, logout } = useAuth();
  const { pending } = useOfflineQueue();
  const qc = useQueryClient();
  const router = useRouter();

  const confirmClearQueue = () => {
    Alert.alert('Vider la file', `Supprimer ${pending} actions en attente ?`, [
      { text: 'Annuler', style: 'cancel' },
      { text: 'Vider', style: 'destructive', onPress: async () => { await offlineQueue.clear(); } },
    ]);
  };

  const confirmClearCache = () => {
    Alert.alert('Vider le cache', 'Cela supprimera toutes les donnees mises en cache hors ligne.', [
      { text: 'Annuler', style: 'cancel' },
      { text: 'Vider', style: 'destructive', onPress: () => { qc.clear(); } },
    ]);
  };

  return (
    <ScrollView style={{ flex: 1, backgroundColor: 'transparent' }} contentContainerStyle={{ padding: spacing['2xl'], gap: spacing.lg }}>
      <View>
        <Text style={{ fontSize: 26, fontWeight: '700', color: colors.gray[900] }}>Parametres</Text>
        <Text style={{ fontSize: 14, color: colors.gray[500], marginTop: 4 }}>Configuration et donnees locales</Text>
      </View>

      <Card>
        <Row icon="person-outline" label={user?.email ?? '-'} value={`Role: ${user?.role ?? '-'}`} />
      </Card>

      <Text style={{ fontSize: 13, fontWeight: '600', color: colors.gray[500], marginTop: spacing.sm }}>Configuration</Text>
      <Card>
        <Row icon="ribbon-outline" label="Programme de fidelite" value="Paliers, reductions, avantages" onPress={() => router.push('/settings/loyalty')} />
        <View style={{ height: 1, backgroundColor: colors.gray[100] }} />
        <Row icon="card-outline" label="Methodes de paiement" value="Especes, MoMo, virement..." onPress={() => router.push('/settings/payment-methods')} />
        <View style={{ height: 1, backgroundColor: colors.gray[100] }} />
        <Row icon="flash-outline" label="Providers de paiement" value="TaraMoney, Campay, Stripe..." onPress={() => router.push('/settings/payment-providers')} />
        <View style={{ height: 1, backgroundColor: colors.gray[100] }} />
        <Row icon="shield-outline" label="Blocage sur dettes" value="Seuils de blocage remise/creation" onPress={() => router.push('/settings/debt-block')} />
      </Card>

      <Card>
        <Row icon="cloud-offline-outline" label="File hors ligne" value={`${pending} action(s) en attente`} onPress={pending > 0 ? confirmClearQueue : undefined} />
        <View style={{ height: 1, backgroundColor: colors.gray[100] }} />
        <Row icon="server-outline" label="Cache local" value="Effacer les donnees mises en cache" onPress={confirmClearCache} />
      </Card>

      <Card>
        <Pressable onPress={() => logout()} style={{ padding: spacing.lg, alignItems: 'center', borderRadius: radius.md }}>
          <Text style={{ fontSize: 14, color: colors.error, fontWeight: '600' }}>Deconnexion</Text>
        </Pressable>
      </Card>
    </ScrollView>
  );
}
