import { useEffect, type ReactNode } from 'react';
import { View, ActivityIndicator } from 'react-native';
import { useRouter, useSegments } from 'expo-router';
import { useAuth } from '@/lib/auth/AuthContext';
import { colors } from '@/lib/theme/colors';

export function AuthGate({ children }: { children: ReactNode }) {
  const { accessToken, loading } = useAuth();
  const segments = useSegments();
  const router = useRouter();

  useEffect(() => {
    if (loading) return;
    const inAuth = segments[0] === '(auth)';
    const authed = !!accessToken;
    if (!authed && !inAuth) {
      router.replace('/(auth)/login');
    } else if (authed && inAuth) {
      router.replace('/(dashboard)');
    }
  }, [loading, accessToken, segments, router]);

  if (loading) {
    return (
      <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: 'transparent' }}>
        <ActivityIndicator size="large" color={colors.primary[500]} />
      </View>
    );
  }
  return <>{children}</>;
}
