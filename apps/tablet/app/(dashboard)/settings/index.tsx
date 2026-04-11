import { View, Text, ScrollView, Alert } from 'react-native';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import * as SecureStore from 'expo-secure-store';
import { Card, CardHeader } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { colors } from '@/lib/theme/colors';
import { spacing, radius } from '@/lib/theme/spacing';

const APP_VERSION = '2.0.0';

export default function SettingsScreen() {
  const router = useRouter();

  const handleLogout = () => {
    Alert.alert(
      'Deconnexion',
      'Voulez-vous vraiment vous deconnecter?',
      [
        { text: 'Annuler', style: 'cancel' },
        {
          text: 'Deconnecter',
          style: 'destructive',
          onPress: async () => {
            await SecureStore.deleteItemAsync('accessToken');
            router.replace('/login' as any);
          },
        },
      ],
    );
  };

  const infoRows = [
    { icon: 'information-circle-outline' as const, label: 'Version', value: APP_VERSION },
    { icon: 'code-slash-outline' as const, label: 'Build', value: 'Production' },
    { icon: 'server-outline' as const, label: 'API', value: process.env.EXPO_PUBLIC_API_URL || 'http://localhost:4000' },
    { icon: 'phone-portrait-outline' as const, label: 'Plateforme', value: 'Tablette' },
  ];

  return (
    <ScrollView
      style={{ flex: 1, backgroundColor: colors.background }}
      contentContainerStyle={{ padding: spacing['2xl'] }}
    >
      <View style={{ marginBottom: spacing['2xl'] }}>
        <Text style={{ fontSize: 26, fontWeight: '700', color: colors.gray[900] }}>Parametres</Text>
        <Text style={{ fontSize: 14, color: colors.gray[500], marginTop: 4 }}>Configuration de l'application</Text>
      </View>

      {/* App Info */}
      <Card style={{ marginBottom: spacing.lg }}>
        <CardHeader title="Informations" subtitle="A propos de l'application" />
        {infoRows.map((row, i) => (
          <View
            key={row.label}
            style={{
              flexDirection: 'row',
              justifyContent: 'space-between',
              alignItems: 'center',
              paddingVertical: 14,
              borderBottomWidth: i < infoRows.length - 1 ? 1 : 0,
              borderBottomColor: '#F3F4F6',
            }}
          >
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
              <View
                style={{
                  width: 36,
                  height: 36,
                  borderRadius: radius.md,
                  backgroundColor: colors.gray[50],
                  alignItems: 'center',
                  justifyContent: 'center',
                }}
              >
                <Ionicons name={row.icon} size={18} color={colors.gray[500]} />
              </View>
              <Text style={{ fontSize: 14, fontWeight: '500', color: colors.gray[700] }}>{row.label}</Text>
            </View>
            <Text style={{ fontSize: 14, color: colors.gray[500], fontFamily: 'monospace' }}>{row.value}</Text>
          </View>
        ))}
      </Card>

      {/* Preferences placeholder */}
      <Card style={{ marginBottom: spacing.lg }}>
        <CardHeader title="Preferences" subtitle="Personnalisez votre experience" />
        <View
          style={{
            flexDirection: 'row',
            justifyContent: 'space-between',
            alignItems: 'center',
            paddingVertical: 14,
            borderBottomWidth: 1,
            borderBottomColor: '#F3F4F6',
          }}
        >
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
            <View
              style={{
                width: 36,
                height: 36,
                borderRadius: radius.md,
                backgroundColor: colors.gray[50],
                alignItems: 'center',
                justifyContent: 'center',
              }}
            >
              <Ionicons name="notifications-outline" size={18} color={colors.gray[500]} />
            </View>
            <Text style={{ fontSize: 14, fontWeight: '500', color: colors.gray[700] }}>Notifications</Text>
          </View>
          <Text style={{ fontSize: 13, color: colors.primary[600] }}>Activees</Text>
        </View>
        <View
          style={{
            flexDirection: 'row',
            justifyContent: 'space-between',
            alignItems: 'center',
            paddingVertical: 14,
          }}
        >
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
            <View
              style={{
                width: 36,
                height: 36,
                borderRadius: radius.md,
                backgroundColor: colors.gray[50],
                alignItems: 'center',
                justifyContent: 'center',
              }}
            >
              <Ionicons name="language-outline" size={18} color={colors.gray[500]} />
            </View>
            <Text style={{ fontSize: 14, fontWeight: '500', color: colors.gray[700] }}>Langue</Text>
          </View>
          <Text style={{ fontSize: 13, color: colors.gray[500] }}>Francais</Text>
        </View>
      </Card>

      {/* Logout */}
      <Card>
        <View style={{ alignItems: 'center', paddingVertical: spacing.lg }}>
          <Button variant="destructive" size="lg" onPress={handleLogout}>
            Se deconnecter
          </Button>
          <Text style={{ fontSize: 12, color: colors.gray[400], marginTop: spacing.lg }}>
            OptiPack v{APP_VERSION}
          </Text>
        </View>
      </Card>
    </ScrollView>
  );
}
