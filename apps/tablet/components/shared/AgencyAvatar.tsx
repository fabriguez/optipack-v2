import { useEffect, useState } from 'react';
import { View, Image } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { storage, STORAGE_KEYS } from '@/lib/storage/storage';
import { colors } from '@/lib/theme/colors';
import { radius } from '@/lib/theme/spacing';

const env = (globalThis as { process?: { env?: Record<string, string | undefined> } }).process?.env;
const API_URL = env?.EXPO_PUBLIC_API_URL ?? 'https://api.transitsoftservices.com/api/v1';

/** Resout une URL d'image (absolue ou relative /api) cote tablette. */
export function resolveTabletImageUrl(url?: string | null): string | null {
  if (!url) return null;
  if (/^https?:\/\//i.test(url) || /^blob:|^data:|^file:/i.test(url)) return url;
  if (url.startsWith('/api/')) {
    const origin = API_URL.replace(/\/api\/v\d+\/?$/, '');
    return `${origin}${url}`;
  }
  return url;
}

interface AgencyLike {
  id?: string;
  name?: string;
  imageUrl?: string | null;
}

const ROUNDED: Record<string, number> = {
  sm: radius.sm,
  md: radius.md,
  lg: radius.lg,
  full: 9999,
};

/** Avatar d'agence avec image authentifiee + fallback icone (mirror web AgencyAvatar). */
export function AgencyAvatar({
  agency,
  size = 36,
  rounded = 'md',
}: {
  agency?: AgencyLike | null;
  size?: number;
  rounded?: 'sm' | 'md' | 'lg' | 'full';
}) {
  const [token, setToken] = useState<string | null>(null);
  const [err, setErr] = useState(false);

  useEffect(() => {
    storage.get<string>(STORAGE_KEYS.accessToken).then((t) => setToken(t ?? null));
  }, []);

  const url = resolveTabletImageUrl(agency?.imageUrl);
  const br = ROUNDED[rounded] ?? radius.md;

  if (url && !err) {
    return (
      <Image
        source={{ uri: url, headers: token ? { Authorization: `Bearer ${token}` } : undefined }}
        onError={() => setErr(true)}
        style={{ width: size, height: size, borderRadius: br, backgroundColor: colors.gray[100] }}
      />
    );
  }

  return (
    <View
      style={{
        width: size,
        height: size,
        borderRadius: br,
        backgroundColor: colors.primary[50],
        alignItems: 'center',
        justifyContent: 'center',
        borderWidth: 1,
        borderColor: colors.gray[100],
      }}
    >
      <Ionicons name="business" size={size * 0.5} color={colors.primary[600]} />
    </View>
  );
}
