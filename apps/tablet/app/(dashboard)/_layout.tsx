import { Drawer } from 'expo-router/drawer';
import { Ionicons } from '@expo/vector-icons';
import { colors } from '@/lib/theme/colors';

type IconName = React.ComponentProps<typeof Ionicons>['name'];

function drawerIcon(name: IconName) {
  return ({ color, size }: { color: string; size: number }) => (
    <Ionicons name={name} size={size} color={color} />
  );
}

export default function DashboardLayout() {
  return (
    <Drawer
      screenOptions={{
        drawerType: 'permanent',
        drawerStyle: {
          backgroundColor: colors.sidebar.bg,
          width: 260,
        },
        drawerActiveTintColor: colors.white,
        drawerInactiveTintColor: colors.sidebar.muted,
        drawerActiveBackgroundColor: colors.sidebar.active,
        drawerItemStyle: { borderRadius: 10, marginHorizontal: 8, paddingLeft: 4 },
        drawerLabelStyle: { fontSize: 14, fontWeight: '500', marginLeft: -8 },
        headerStyle: { backgroundColor: colors.white, elevation: 0, shadowOpacity: 0 },
        headerTintColor: colors.gray[900],
        headerTitleStyle: { fontWeight: '600', fontSize: 18 },
      }}
    >
      <Drawer.Screen name="index" options={{ title: 'Tableau de bord', drawerIcon: drawerIcon('grid-outline') }} />
      <Drawer.Screen name="parcels/index" options={{ title: 'Colis', drawerIcon: drawerIcon('cube-outline') }} />
      <Drawer.Screen name="clients/index" options={{ title: 'Clients', drawerIcon: drawerIcon('people-outline') }} />
      <Drawer.Screen name="containers/index" options={{ title: 'Conteneurs', drawerIcon: drawerIcon('archive-outline') }} />
      <Drawer.Screen name="agencies/index" options={{ title: 'Agences', drawerIcon: drawerIcon('business-outline') }} />
      <Drawer.Screen name="warehouses/index" options={{ title: 'Magasins', drawerIcon: drawerIcon('home-outline') }} />
      <Drawer.Screen name="invoices/index" options={{ title: 'Factures', drawerIcon: drawerIcon('document-text-outline') }} />
      <Drawer.Screen name="payments/index" options={{ title: 'Paiements', drawerIcon: drawerIcon('card-outline') }} />
      <Drawer.Screen name="cash-register/index" options={{ title: 'Caisse', drawerIcon: drawerIcon('wallet-outline') }} />
      <Drawer.Screen name="employees/index" options={{ title: 'Personnel', drawerIcon: drawerIcon('person-outline') }} />
      <Drawer.Screen name="settings/index" options={{ title: 'Parametres', drawerIcon: drawerIcon('settings-outline') }} />
    </Drawer>
  );
}
