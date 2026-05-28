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
import { usePermission, useIsTenantAdmin } from '@/lib/hooks/usePermission';
import { colors } from '@/lib/theme/colors';
import { OfflineBanner } from './OfflineBanner';

function SectionBlock({
  section,
  activeRoute,
  onNavigate,
}: {
  section: NavSection;
  activeRoute: string | undefined;
  onNavigate: (screen: string) => void;
}) {
  const [open, setOpen] = useState(!!section.defaultOpen);
  const isAdmin = useIsTenantAdmin();

  const visible = section.items.filter((it) => {
    if (it.adminOnly && !isAdmin) return false;
    return true;
  });

  if (visible.length === 0) return null;

  return (
    <View style={{ marginBottom: 4 }}>
      <Pressable
        onPress={() => setOpen((v) => !v)}
        style={{
          flexDirection: 'row',
          alignItems: 'center',
          justifyContent: 'space-between',
          paddingHorizontal: 16,
          paddingVertical: 6,
        }}
      >
        <Text style={{ fontSize: 11, fontWeight: '600', color: colors.sidebar.muted, letterSpacing: 1.2 }}>
          {section.title.toUpperCase()}
        </Text>
        <Ionicons
          name={open ? 'chevron-down' : 'chevron-forward'}
          size={14}
          color={colors.sidebar.muted}
        />
      </Pressable>
      {open && (
        <View style={{ paddingHorizontal: 8, gap: 2 }}>
          {visible.map((item) => (
            <NavLink
              key={item.screen}
              item={item}
              active={activeRoute === item.screen}
              onPress={() => onNavigate(item.screen)}
            />
          ))}
        </View>
      )}
    </View>
  );
}

function NavLink({ item, active, onPress }: { item: NavItem; active: boolean; onPress: () => void }) {
  const allowed = usePermission(item.permissions ?? [], 'any');
  if (item.permissions && item.permissions.length > 0 && !allowed) return null;
  return (
    <Pressable
      onPress={onPress}
      style={{
        flexDirection: 'row',
        alignItems: 'center',
        gap: 12,
        paddingHorizontal: 12,
        paddingVertical: 10,
        borderRadius: 10,
        backgroundColor: active ? colors.sidebar.active : 'transparent',
      }}
    >
      <Ionicons name={item.icon} size={20} color={active ? colors.white : colors.sidebar.muted} />
      <Text
        style={{ fontSize: 14, fontWeight: '500', color: active ? colors.white : colors.sidebar.muted }}
        numberOfLines={1}
      >
        {item.label}
      </Text>
    </Pressable>
  );
}

export function DrawerContent(props: DrawerContentComponentProps) {
  const { user, logout } = useAuth();
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
          paddingHorizontal: 16,
          paddingTop: 24,
          paddingBottom: 16,
          borderBottomWidth: 1,
          borderBottomColor: 'rgba(255,255,255,0.1)',
        }}
      >
        <Text style={{ fontSize: 18, fontWeight: '700', color: colors.white }}>
          TransitSoftServices
        </Text>
        {user && (
          <Text style={{ fontSize: 12, color: colors.sidebar.muted, marginTop: 4 }} numberOfLines={1}>
            {user.email}
          </Text>
        )}
      </View>

      <OfflineBanner />

      <ScrollView style={{ flex: 1 }} contentContainerStyle={{ paddingVertical: 12 }}>
        {navSections.map((section) => (
          <SectionBlock
            key={section.title}
            section={section}
            activeRoute={currentRouteName}
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
            gap: 12,
            paddingHorizontal: 12,
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
          <Text style={{ fontSize: 14, fontWeight: '500', color: colors.sidebar.muted }}>
            {loggingOut ? 'Deconnexion...' : 'Deconnexion'}
          </Text>
        </Pressable>
      </View>
    </View>
  );
}
