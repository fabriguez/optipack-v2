import { ScrollView, View, Text } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Can } from '@/components/auth/Can';
import { Card } from '@/components/ui/Card';
import { colors } from '@/lib/theme/colors';
import { spacing } from '@/lib/theme/spacing';

function Tile({ icon, title, description, permission }: { icon: keyof typeof Ionicons.glyphMap; title: string; description: string; permission: string }) {
  return (
    <Can permission={permission}>
      <Card>
        <View style={{ flexDirection: 'row', alignItems: 'flex-start', gap: spacing.md, padding: spacing.lg }}>
          <View style={{ width: 44, height: 44, borderRadius: 12, backgroundColor: colors.primary[50], alignItems: 'center', justifyContent: 'center' }}>
            <Ionicons name={icon as never} size={22} color={colors.primary[600]} />
          </View>
          <View style={{ flex: 1 }}>
            <Text style={{ fontSize: 15, fontWeight: '600', color: colors.gray[900] }}>{title}</Text>
            <Text style={{ fontSize: 13, color: colors.gray[500], marginTop: 4 }}>{description}</Text>
          </View>
        </View>
      </Card>
    </Can>
  );
}

export default function AdminScreen() {
  return (
    <ScrollView style={{ flex: 1, backgroundColor: 'transparent' }} contentContainerStyle={{ padding: spacing['2xl'], gap: spacing.lg }}>
      <View>
        <Text style={{ fontSize: 26, fontWeight: '700', color: colors.gray[900] }}>Administration RH</Text>
        <Text style={{ fontSize: 14, color: colors.gray[500], marginTop: 4 }}>Postes, permissions, plannings, conges</Text>
      </View>
      <Tile icon="briefcase-outline" title="Postes" description="Definir les postes et leurs permissions" permission="position.manage" />
      <Tile icon="key-outline" title="Permissions" description="Affecter et reviser les permissions" permission="permission.manage" />
      <Tile icon="calendar-outline" title="Plannings" description="Gerer les horaires de travail" permission="schedule.manage" />
      <Tile icon="leaf-outline" title="Conges et feries" description="Configurer les jours feries" permission="holiday.manage" />
      <Tile icon="star-outline" title="Politique fidelite" description="Reglages du programme de fidelite" permission="system.config" />
    </ScrollView>
  );
}
