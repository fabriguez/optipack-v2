import type { ReactElement } from 'react';
import { Drawer } from 'expo-router/drawer';
import { DrawerContent } from '@/components/layout/DrawerContent';
import { allNavScreens } from '@/lib/nav/nav-config';
import { colors } from '@/lib/theme/colors';

export default function DashboardLayout() {
  return (
    <Drawer
      drawerContent={(props) => {
        const Component = DrawerContent as unknown as (p: typeof props) => ReactElement;
        return <Component {...props} />;
      }}
      screenOptions={{
        drawerType: 'permanent',
        drawerStyle: { backgroundColor: colors.sidebar.bg, width: 280 },
        headerStyle: { backgroundColor: colors.white, elevation: 0, shadowOpacity: 0 },
        headerTintColor: colors.gray[900],
        headerTitleStyle: { fontWeight: '600', fontSize: 18 },
      }}
    >
      {allNavScreens.map((it) => (
        <Drawer.Screen key={it.screen} name={it.screen} options={{ title: it.label }} />
      ))}
    </Drawer>
  );
}
