import { useEffect, useState } from 'react';
import { Slot } from 'expo-router';
import { PersistQueryClientProvider } from '@tanstack/react-query-persist-client';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { StatusBar } from 'expo-status-bar';
import { createQueryClient, queryPersister } from '@/lib/queryClient';
import { AuthProvider } from '@/lib/auth/AuthContext';
import { AuthGate } from '@/components/auth/AuthGate';
import { startOfflineDrain } from '@/lib/api/offlineDrain';

export default function RootLayout() {
  const [queryClient] = useState(() => createQueryClient());

  useEffect(() => {
    const stop = startOfflineDrain();
    return () => stop();
  }, []);

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
        <AuthProvider>
          <StatusBar style="light" />
          <AuthGate>
            <Slot />
          </AuthGate>
        </AuthProvider>
      </PersistQueryClientProvider>
    </GestureHandlerRootView>
  );
}
