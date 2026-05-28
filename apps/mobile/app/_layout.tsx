import { useEffect, useState } from 'react';
import { Slot, useRouter, useSegments } from 'expo-router';
import { PersistQueryClientProvider } from '@tanstack/react-query-persist-client';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { StatusBar } from 'expo-status-bar';
import { View, ActivityIndicator } from 'react-native';
import { createQueryClient, queryPersister } from '@/lib/queryClient';
import { AuthProvider, useAuth } from '@/lib/auth/AuthContext';
import { TenantProvider, useTenant } from '@/lib/tenant/TenantContext';
import { startOfflineDrain } from '@/lib/api/offlineDrain';
import { setTenantSlug } from '@/lib/api/client';
import { colors } from '@/lib/theme/colors';

function AuthGate({ children }: { children: React.ReactNode }) {
  const { accessToken, loading } = useAuth();
  const { slug } = useTenant();
  const segments = useSegments();
  const router = useRouter();

  useEffect(() => {
    setTenantSlug(slug);
  }, [slug]);

  useEffect(() => {
    if (loading) return;
    // Pas de slug = main tenant (API fallback sur premiere Organization).
    // L'utilisateur peut basculer manuellement via /tenant-setup depuis le profil
    // s'il veut un autre tenant.
    const inAuth = segments[0] === '(auth)';
    const inPublic = segments[0] === 'track' || segments[0] === 'tenant-setup';
    const authed = !!accessToken;
    if (!authed && !inAuth && !inPublic) {
      router.replace('/(auth)/login');
    } else if (authed && inAuth) {
      router.replace('/(tabs)');
    }
  }, [loading, accessToken, segments, router, slug]);

  if (loading) {
    return (
      <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.background }}>
        <ActivityIndicator size="large" color={colors.primary[500]} />
      </View>
    );
  }
  return <>{children}</>;
}

export default function RootLayout() {
  const [queryClient] = useState(() => createQueryClient());

  useEffect(() => startOfflineDrain(), []);

  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <PersistQueryClientProvider
        client={queryClient}
        persistOptions={{
          persister: queryPersister,
          maxAge: 1000 * 60 * 60 * 24 * 7,
          buster: 'v1',
        }}
      >
        <TenantProvider>
          <AuthProvider>
            <StatusBar style="dark" />
            <AuthGate>
              <Slot />
            </AuthGate>
          </AuthProvider>
        </TenantProvider>
      </PersistQueryClientProvider>
    </GestureHandlerRootView>
  );
}
