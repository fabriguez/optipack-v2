import { useEffect, useState } from 'react';
import { Stack } from 'expo-router';
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
import { AuthProvider } from '@/lib/auth/AuthContext';
import { AuthGate } from '@/components/auth/AuthGate';
import { startOfflineDrain } from '@/lib/api/offlineDrain';
import { colors } from '@/lib/theme/colors';

export default function RootLayout() {
  const [queryClient] = useState(() => createQueryClient());
  // Pre-load font Ionicons (sinon @expo/vector-icons rend des carres vides).
  const [fontsLoaded] = useFonts({
    ...Ionicons.font,
    Poppins_400Regular,
    Poppins_500Medium,
    Poppins_600SemiBold,
    Poppins_700Bold,
  });

  useEffect(() => {
    if (!fontsLoaded) return;
    const TextAny = Text as unknown as { defaultProps?: { style?: object } };
    TextAny.defaultProps = TextAny.defaultProps ?? {};
    TextAny.defaultProps.style = [{ fontFamily: 'Poppins_400Regular' }, TextAny.defaultProps.style];
    const InputAny = TextInput as unknown as { defaultProps?: { style?: object } };
    InputAny.defaultProps = InputAny.defaultProps ?? {};
    InputAny.defaultProps.style = [{ fontFamily: 'Poppins_400Regular' }, InputAny.defaultProps.style];
  }, [fontsLoaded]);

  useEffect(() => {
    const stop = startOfflineDrain();
    return () => stop();
  }, []);

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
          <AuthProvider>
            <StatusBar style="light" />
            <AuthGate>
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
          </AuthProvider>
        </PersistQueryClientProvider>
      </SafeAreaProvider>
    </GestureHandlerRootView>
  );
}
