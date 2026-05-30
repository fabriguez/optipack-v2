import { useState } from 'react';
import { View, Text, KeyboardAvoidingView, Platform, Pressable, ScrollView } from 'react-native';
import { Link, useRouter } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Input } from '@/components/ui/Input';
import { Button } from '@/components/ui/Button';
import { useAuth } from '@/lib/auth/AuthContext';
import { colors, spacing } from '@/lib/theme/colors';
import { toast } from '@/lib/toast';

export default function LoginScreen() {
  const { login } = useAuth();
  const router = useRouter();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleLogin = async () => {
    setError(null);
    setSubmitting(true);
    try {
      await login(email.trim(), password);
      router.replace('/(tabs)');
    } catch (e: any) {
      const msg = e?.response?.data?.message ?? 'Email ou mot de passe incorrect';
      setError(msg);
      toast.error(msg);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: colors.gray[50] }}>
      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <ScrollView contentContainerStyle={{ flexGrow: 1, justifyContent: 'center', padding: spacing['2xl'] }}>
          <View style={{ alignItems: 'center', marginBottom: 32 }}>
            <View style={{ width: 72, height: 72, borderRadius: 18, backgroundColor: colors.primary[500], alignItems: 'center', justifyContent: 'center', marginBottom: 16 }}>
              <Text style={{ fontSize: 28, fontWeight: '700', color: colors.white }}>TS</Text>
            </View>
            <Text style={{ fontSize: 22, fontWeight: '700', color: colors.gray[900] }}>TransitSoftServices</Text>
            <Text style={{ fontSize: 13, color: colors.gray[500], marginTop: 4 }}>Espace client</Text>
          </View>

          {error && (
            <View style={{ backgroundColor: '#FEE2E2', borderRadius: 12, padding: 12, marginBottom: 16 }}>
              <Text style={{ fontSize: 13, color: '#B91C1C' }}>{error}</Text>
            </View>
          )}

          <View style={{ gap: 14 }}>
            <Input
              label="Email"
              value={email}
              onChangeText={setEmail}
              placeholder="vous@email.com"
              keyboardType="email-address"
              autoCapitalize="none"
              autoComplete="email"
            />
            <Input
              label="Mot de passe"
              value={password}
              onChangeText={setPassword}
              placeholder="Votre mot de passe"
              secureTextEntry
            />
            <Button onPress={handleLogin} loading={submitting}>
              {submitting ? 'Connexion...' : 'Se connecter'}
            </Button>
            <Pressable onPress={() => router.push('/(auth)/forgot-password')} style={{ alignItems: 'center' }}>
              <Text style={{ fontSize: 13, color: colors.primary[600], fontWeight: '500' }}>Mot de passe oublie ?</Text>
            </Pressable>
          </View>

          <Pressable onPress={() => router.push('/(auth)/register')} style={{ marginTop: 24, alignItems: 'center' }}>
            <Text style={{ fontSize: 13, color: colors.gray[600] }}>
              Pas de compte ? <Text style={{ color: colors.primary[600], fontWeight: '600' }}>Creer un compte</Text>
            </Text>
          </Pressable>

          <Link href="/track" asChild>
            <Pressable style={{ marginTop: 16, alignItems: 'center' }}>
              <Text style={{ fontSize: 13, color: colors.primary[600], fontWeight: '500' }}>Suivre un colis (sans compte)</Text>
            </Pressable>
          </Link>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}
