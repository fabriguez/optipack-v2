import { View, Text, Pressable, StyleSheet } from 'react-native';
import { usePathname } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { usePermission, useIsTenantAdmin } from '@/lib/hooks/usePermission';
import { useAuth } from '@/lib/auth/AuthContext';
import { navSections } from '@/lib/nav/nav-config';
import { colors } from '@/lib/theme/colors';

// Derive permission map from nav-config: segment slug -> required keys.
// Segment = screen value without "/index" suffix, e.g. "parcels/index" -> "parcels".
const SCREEN_PERMISSION_MAP: Map<string, string[]> = new Map(
  navSections
    .flatMap((s) => s.items)
    .filter((it) => it.permissions && it.permissions.length > 0)
    .map((it) => {
      const slug = it.screen.replace('/index', '').replace(/^index$/, '');
      return [slug, it.permissions!];
    }),
);

function requiredKeysForPath(pathname: string): string[] {
  // pathname from expo-router: "/(dashboard)/parcels" or "/(dashboard)/parcels/detail/123"
  // Strip the group prefix to get the screen slug.
  const withoutGroup = pathname.replace(/^\/\(dashboard\)\/?/, '');
  // Match the leading segment against our map.
  const topSegment = withoutGroup.split('/')[0] ?? '';
  return SCREEN_PERMISSION_MAP.get(topSegment) ?? [];
}

export function PermissionGate() {
  const pathname = usePathname();
  const { loading } = useAuth();
  const isAdmin = useIsTenantAdmin();
  const requiredKeys = requiredKeysForPath(pathname);
  const allowed = usePermission(requiredKeys, 'any');

  // Loading or admin or no constraint -> render nothing (screen shows normally).
  if (loading || isAdmin || allowed) return null;

  // Overlay covers the entire screen content area.
  return (
    <View style={styles.overlay} pointerEvents="box-none">
      <View style={styles.card}>
        <View style={styles.iconWrap}>
          <Ionicons name="shield-outline" size={32} color={colors.primary[600] ?? '#16a34a'} />
        </View>
        <Text style={styles.code}>404</Text>
        <Text style={styles.title}>Page introuvable</Text>
        <Text style={styles.sub}>
          Cette page n'existe pas ou vous n'avez pas les droits d'acces necessaires.
        </Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  overlay: {
    ...StyleSheet.absoluteFillObject,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(249,250,251,0.97)',
    zIndex: 999,
  },
  card: {
    backgroundColor: '#fff',
    borderRadius: 16,
    padding: 32,
    maxWidth: 380,
    alignItems: 'center',
    shadowColor: '#000',
    shadowOpacity: 0.08,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 4 },
    elevation: 4,
  },
  iconWrap: {
    width: 60,
    height: 60,
    borderRadius: 30,
    backgroundColor: '#f0fdf4',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 12,
  },
  code: {
    fontSize: 48,
    fontWeight: '700',
    color: '#e5e7eb',
    lineHeight: 52,
  },
  title: {
    fontSize: 18,
    fontWeight: '600',
    color: '#111827',
    marginTop: 4,
  },
  sub: {
    fontSize: 13,
    color: '#6b7280',
    textAlign: 'center',
    marginTop: 8,
    lineHeight: 20,
  },
});
