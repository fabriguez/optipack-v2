import { useEffect, useState } from 'react';
import { Image, View, ActivityIndicator, type ImageStyle, type StyleProp } from 'react-native';
import * as FileSystem from 'expo-file-system';
import { storage, STORAGE_KEYS } from '@/lib/storage/storage';
import { mediaUri } from '@/lib/media';
import { colors } from '@/lib/theme/colors';

/**
 * <AuthedImage uri="..." /> : fetch l'image avec Authorization: Bearer <token>,
 * la met en cache locale et la rend via <Image>. Indispensable pour les images
 * servies par /api/v1/uploads/object/* qui requierent une authent JWT.
 *
 * Cache : derive un nom unique du chemin URL (encode URI). Bouchee si url change.
 */

const cache = new Map<string, string>();

interface Props {
  uri: string;
  style?: StyleProp<ImageStyle>;
  placeholderBg?: string;
}

function pathToFilename(url: string): string {
  return url.replace(/[^a-zA-Z0-9.]/g, '_').slice(-180);
}

export function AuthedImage({ uri: rawUri, style, placeholderBg }: Props) {
  // Resout les URLs relatives (`/uploads/object/...`) en absolu avant fetch.
  const uri = mediaUri(rawUri) ?? rawUri;
  const [localUri, setLocalUri] = useState<string | null>(() => cache.get(uri) ?? null);
  const [loading, setLoading] = useState(!cache.has(uri));

  useEffect(() => {
    let cancelled = false;
    const cached = cache.get(uri);
    if (cached) {
      setLocalUri(cached);
      setLoading(false);
      return;
    }
    setLoading(true);
    (async () => {
      try {
        const token = await storage.get<string>(STORAGE_KEYS.accessToken);
        const target = `${FileSystem.cacheDirectory}img_${pathToFilename(uri)}`;
        const headers: Record<string, string> = {};
        if (token) headers.Authorization = `Bearer ${token}`;
        console.log('[AuthedImage] download start', {
          rawUri,
          uri,
          hasToken: !!token,
          target,
        });
        const res = await FileSystem.downloadAsync(uri, target, { headers });
        if (cancelled) return;
        console.log('[AuthedImage] download done', { uri, status: res.status, localUri: res.uri });
        if (res.status >= 400) throw new Error(`HTTP ${res.status}`);
        cache.set(uri, res.uri);
        setLocalUri(res.uri);
      } catch (err) {
        console.warn('[AuthedImage] download FAIL', { rawUri, uri, error: String(err) });
        if (!cancelled) setLocalUri(null);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [uri]);

  if (loading) {
    return (
      <View style={[{ backgroundColor: placeholderBg ?? colors.gray[100], alignItems: 'center', justifyContent: 'center' }, style as object]}>
        <ActivityIndicator size="small" color={colors.primary[500]} />
      </View>
    );
  }
  if (!localUri) {
    return <View style={[{ backgroundColor: placeholderBg ?? colors.gray[100] }, style as object]} />;
  }
  return <Image source={{ uri: localUri }} style={style} />;
}
