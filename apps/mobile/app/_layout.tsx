import { useEffect, useState } from 'react';
import { Stack, useRouter, useSegments } from 'expo-router';
import { PersistQueryClientProvider } from '@tanstack/react-query-persist-client';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { SafeAreaProvider, SafeAreaView } from 'react-native-safe-area-context';
import { LinearGradient } from 'expo-linear-gradient';
import { StatusBar } from 'expo-status-bar';
import { View, ActivityIndicator, Text, TextInput } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useFonts } from 'expo-font';
import {
  Poppins_400Regular,
  Poppins_500Medium,
  Poppins_600SemiBold,
  Poppins_700Bold,
} from '@expo-google-fonts/poppins';
import { createQueryClient, queryPersister } from '@/lib/queryClient';
import { AuthProvider, useAuth } from '@/lib/auth/AuthContext';
import { TenantProvider, useTenant } from '@/lib/tenant/TenantContext';
import { RealtimeProvider } from '@/lib/realtime/RealtimeContext';
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
    const inPublic = segments[0] === 'track' || segments[0] === 'tenant-setup' || segments[0] === 'simulateur';
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
  // Pre-load font Ionicons : sans ca @expo/vector-icons affiche des
  // carres vides sur iOS (la fontFace n'est pas auto-chargee depuis le
  // bundle expo SDK 51 + expo-router 3).
  const [fontsLoaded] = useFonts({
    ...Ionicons.font,
    Poppins_400Regular,
    Poppins_500Medium,
    Poppins_600SemiBold,
    Poppins_700Bold,
  });

  useEffect(() => {
    if (!fontsLoaded) return;
    // Defaut Poppins pour tous les <Text/> + <TextInput/> de l'app.
    // setNativeProps via defaultProps : applique sans toucher chaque
    // composant. Override possible via style explicite par composant.
    const TextAny = Text as unknown as { defaultProps?: { style?: object } };
    TextAny.defaultProps = TextAny.defaultProps ?? {};
    TextAny.defaultProps.style = [{ fontFamily: 'Poppins_400Regular' }, TextAny.defaultProps.style];
    const InputAny = TextInput as unknown as { defaultProps?: { style?: object } };
    InputAny.defaultProps = InputAny.defaultProps ?? {};
    InputAny.defaultProps.style = [{ fontFamily: 'Poppins_400Regular' }, InputAny.defaultProps.style];
  }, [fontsLoaded]);

  useEffect(() => startOfflineDrain(), []);

  if (!fontsLoaded) {
    return (
      <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.background }}>
        <ActivityIndicator size="large" color={colors.primary[500]} />
      </View>
    );
  }

  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <SafeAreaProvider>
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
            <RealtimeProvider>
            <StatusBar style="dark" />
            <AuthGate>
              {/* Gradient global subtil (blanc -> teinte primaire tres pale).
                  Couvre tout l'ecran sous le SafeAreaView. */}
              <LinearGradient
                colors={[
                  colors.primary?.[100] ?? '#DCFCE7',
                  colors.primary?.[50] ?? '#F1FBF4',
                  colors.white,
                  colors.gray?.[100] ?? '#F3F4F6',
                ]}
                locations={[0, 0.3, 0.7, 1]}
                start={{ x: 0, y: 0 }}
                end={{ x: 0.6, y: 1 }}
                style={{ flex: 1 }}
              >
                <SafeAreaView style={{ flex: 1, backgroundColor: 'transparent' }} edges={['top', 'bottom']}>
                  <Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: 'transparent' } }} />
                </SafeAreaView>
              </LinearGradient>
            </AuthGate>
            </RealtimeProvider>
          </AuthProvider>
        </TenantProvider>
      </PersistQueryClientProvider>
      </SafeAreaProvider>
    </GestureHandlerRootView>
  );
}
