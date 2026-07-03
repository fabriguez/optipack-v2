import { useState } from 'react';
import { View, Text, Pressable, ScrollView, ActivityIndicator } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
// Type opaque pour le drawer en SDK 56 : expo-router fournit ses types
// re-exportes mais ils ne sont plus compatibles structurellement avec
// @react-navigation/drawer. On declare les seuls champs utilises ici.
interface DrawerContentComponentProps {
  state: { routes: Array<{ name: string }>; index: number };
  navigation: {
    navigate: (name: never) => void;
    reset: (state: { index: number; routes: Array<{ name: string }> }) => void;
  };
}
import { navSections, type NavItem, type NavSection } from '@/lib/nav/nav-config';
import { useAuth } from '@/lib/auth/AuthContext';
import { useTenant } from '@/lib/tenant/TenantContext';
import { usePermission, useIsTenantAdmin } from '@/lib/hooks/usePermission';
import { useSidebar } from '@/lib/sidebar/SidebarContext';
import { colors } from '@/lib/theme/colors';
import { ConnectivityBadge } from './ConnectivityBadge';

function SectionBlock({
  section,
  activeRoute,
  collapsed,
  onNavigate,
}: {
  section: NavSection;
  activeRoute: string | undefined;
  collapsed: boolean;
  onNavigate: (screen: string) => void;
}) {
  const [open, setOpen] = useState(!!section.defaultOpen);
  const isAdmin = useIsTenantAdmin();

  const visible = section.items.filter((it) => !(it.adminOnly && !isAdmin));
  if (visible.length === 0) return null;

  // Replie : pas d'en-tete de section, items toujours visibles (icones seules).
  if (collapsed) {
    return (
      <View style={{ marginBottom: 8, gap: 2, paddingHorizontal: 8 }}>
        {visible.map((item) => (
          <NavLink key={item.screen} item={item} active={activeRoute === item.screen} collapsed onPress={() => onNavigate(item.screen)} />
        ))}
      </View>
    );
  }

  return (
    <View style={{ marginBottom: 4 }}>
      <Pressable
        onPress={() => setOpen((v) => !v)}
        style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 16, paddingVertical: 6 }}
      >
        <Text style={{ fontSize: 11, fontWeight: '600', color: colors.sidebar.muted, letterSpacing: 1.2 }}>
          {section.title.toUpperCase()}
        </Text>
        <Ionicons name={open ? 'chevron-down' : 'chevron-forward'} size={14} color={colors.sidebar.muted} />
      </Pressable>
      {open && (
        <View style={{ paddingHorizontal: 8, gap: 2 }}>
          {visible.map((item) => (
            <NavLink key={item.screen} item={item} active={activeRoute === item.screen} collapsed={false} onPress={() => onNavigate(item.screen)} />
          ))}
        </View>
      )}
    </View>
  );
}

function NavLink({ item, active, collapsed, onPress }: { item: NavItem; active: boolean; collapsed: boolean; onPress: () => void }) {
  const allowed = usePermission(item.permissions ?? [], 'any');
  if (item.permissions && item.permissions.length > 0 && !allowed) return null;
  return (
    <Pressable
      onPress={onPress}
      style={{
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: collapsed ? 'center' : 'flex-start',
        gap: collapsed ? 0 : 12,
        paddingHorizontal: collapsed ? 0 : 12,
        paddingVertical: 10,
        borderRadius: 10,
        backgroundColor: active ? colors.sidebar.active : 'transparent',
      }}
    >
      <Ionicons name={item.icon} size={20} color={active ? colors.white : colors.sidebar.muted} />
      {!collapsed && (
        <Text style={{ fontSize: 14, fontWeight: '500', color: active ? colors.white : colors.sidebar.muted }} numberOfLines={1}>
          {item.label}
        </Text>
      )}
    </Pressable>
  );
}

export function DrawerContent(props: DrawerContentComponentProps) {
  const { user, logout } = useAuth();
  const { collapsed, toggle } = useSidebar();
  const { meta } = useTenant();
  const [loggingOut, setLoggingOut] = useState(false);
  const currentRouteName = props.state.routes[props.state.index]?.name;

  const handleLogout = async () => {
    setLoggingOut(true);
    try {
      await logout();
      props.navigation.reset({ index: 0, routes: [{ name: '(auth)/login' as never }] });
    } finally {
      setLoggingOut(false);
    }
  };

  return (
    <View style={{ flex: 1, backgroundColor: colors.sidebar.bg }}>
      <View
        style={{
          flexDirection: 'row',
          alignItems: 'center',
          justifyContent: collapsed ? 'center' : 'space-between',
          paddingHorizontal: collapsed ? 8 : 16,
          paddingTop: 24,
          paddingBottom: 16,
          borderBottomWidth: 1,
          borderBottomColor: 'rgba(255,255,255,0.1)',
        }}
      >
        {!collapsed && (
          <View style={{ flex: 1 }}>
            <Text style={{ fontSize: 18, fontWeight: '700', color: colors.white }} numberOfLines={1}>
              {meta?.name ?? ''}
            </Text>
            {user && (
              <Text style={{ fontSize: 12, color: colors.sidebar.muted, marginTop: 4 }} numberOfLines={1}>
                {user.email}
              </Text>
            )}
          </View>
        )}
        <Pressable
          onPress={toggle}
          hitSlop={8}
          style={{ width: 36, height: 36, borderRadius: 10, alignItems: 'center', justifyContent: 'center', backgroundColor: 'rgba(255,255,255,0.08)' }}
        >
          <Ionicons name={collapsed ? 'chevron-forward' : 'chevron-back'} size={20} color={colors.white} />
        </Pressable>
      </View>

      <ConnectivityBadge />

      <ScrollView style={{ flex: 1 }} contentContainerStyle={{ paddingVertical: 12 }}>
        {navSections.map((section) => (
          <SectionBlock
            key={section.title}
            section={section}
            activeRoute={currentRouteName}
            collapsed={collapsed}
            onNavigate={(screen) => props.navigation.navigate(screen as never)}
          />
        ))}
      </ScrollView>

      <View style={{ borderTopWidth: 1, borderTopColor: 'rgba(255,255,255,0.1)', padding: 12 }}>
        <Pressable
          onPress={handleLogout}
          disabled={loggingOut}
          style={{
            flexDirection: 'row',
            alignItems: 'center',
            justifyContent: collapsed ? 'center' : 'flex-start',
            gap: collapsed ? 0 : 12,
            paddingHorizontal: collapsed ? 0 : 12,
            paddingVertical: 10,
            borderRadius: 10,
            opacity: loggingOut ? 0.6 : 1,
          }}
        >
          {loggingOut ? (
            <ActivityIndicator size="small" color={colors.sidebar.muted} />
          ) : (
            <Ionicons name="log-out-outline" size={20} color={colors.sidebar.muted} />
          )}
          {!collapsed && (
            <Text style={{ fontSize: 14, fontWeight: '500', color: colors.sidebar.muted }}>
              {loggingOut ? 'Deconnexion...' : 'Deconnexion'}
            </Text>
          )}
        </Pressable>
      </View>
    </View>
  );
}
