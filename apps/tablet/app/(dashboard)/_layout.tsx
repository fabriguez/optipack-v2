import type { ReactElement } from 'react';
import { View } from 'react-native';
import { Drawer } from 'expo-router/drawer';
import { DrawerContent } from '@/components/layout/DrawerContent';
import { TopBar } from '@/components/layout/TopBar';
import { PermissionGate } from '@/components/layout/PermissionGate';
import { allNavScreens } from '@/lib/nav/nav-config';
import { SidebarProvider, useSidebar } from '@/lib/sidebar/SidebarContext';
import { colors } from '@/lib/theme/colors';

function DrawerShell() {
  const { collapsed } = useSidebar();
  return (
    <Drawer
      drawerContent={(props) => {
        const Component = DrawerContent as unknown as (p: typeof props) => ReactElement;
        return <Component {...props} />;
      }}
      sceneContainerStyle={{ backgroundColor: 'transparent' }}
      screenOptions={{
        headerShown: true,
        header: () => <TopBar />,
        drawerType: 'permanent',
        // Sidebar opaque (lisibilite). Largeur reduite quand repliee (icones
        // seules), comme le backoffice web.
        drawerStyle: { backgroundColor: colors.sidebar.bg, width: collapsed ? 76 : 280 },
        sceneStyle: { backgroundColor: 'transparent' },
      }}
    >
      {allNavScreens.map((it) => (
        <Drawer.Screen key={it.screen} name={it.screen} options={{ title: it.label }} />
      ))}
    </Drawer>
  );
}

export default function DashboardLayout() {
  return (
    <SidebarProvider>
      <View style={{ flex: 1 }}>
        <DrawerShell />
        <PermissionGate />
      </View>
    </SidebarProvider>
  );
}
