import { useState } from 'react';
import { View, Text, Image, KeyboardAvoidingView, Platform, Pressable, ScrollView } from 'react-native';
import { Link, useRouter } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Input } from '@/components/ui/Input';
import { Button } from '@/components/ui/Button';
import { AppPhoneInput } from '@/components/ui/AppPhoneInput';
import { SocialAuthButtons } from '@/components/auth/SocialAuthButtons';
import { useAuth } from '@/lib/auth/AuthContext';
import { useTenant } from '@/lib/tenant/TenantContext';
import { colors, radius, spacing } from '@/lib/theme/colors';
import { toast } from '@/lib/toast';

type IdentifierMode = 'phone' | 'email';

export default function LoginScreen() {
  const { login } = useAuth();
  const { meta } = useTenant();
  const router = useRouter();
  const [mode, setMode] = useState<IdentifierMode>('phone');
  const [phone, setPhone] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleLogin = async () => {
    setError(null);
    setSubmitting(true);
    try {
      const identifier = mode === 'phone' ? phone.replace(/\s/g, '') : email.trim();
      await login(identifier, password);
      router.replace('/(tabs)');
    } catch (e: any) {
      const msg = e?.response?.data?.message ?? 'Identifiant ou mot de passe incorrect';
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
            {meta?.logoUrl ? (
              <Image
                source={{ uri: meta.logoUrl }}
                style={{ width: 72, height: 72, borderRadius: 18, marginBottom: 16 }}
                resizeMode="contain"
              />
            ) : (
              <View style={{ width: 72, height: 72, borderRadius: 18, backgroundColor: colors.primary[500], alignItems: 'center', justifyContent: 'center', marginBottom: 16 }}>
                <Text style={{ fontSize: 28, fontWeight: '700', color: colors.white }}>
                  {(meta?.name ?? 'T').charAt(0).toUpperCase()}
                </Text>
              </View>
            )}
            <Text style={{ fontSize: 22, fontWeight: '700', color: colors.gray[900] }}>{meta?.name ?? ''}</Text>
            <Text style={{ fontSize: 13, color: colors.gray[500], marginTop: 4 }}>Espace client</Text>
          </View>

          {error && (
            <View style={{ backgroundColor: '#FEE2E2', borderRadius: 12, padding: 12, marginBottom: 16 }}>
              <Text style={{ fontSize: 13, color: '#B91C1C' }}>{error}</Text>
            </View>
          )}

          <SocialAuthButtons intent="login" />

          <View style={{ gap: 14 }}>
            {/* Toggle phone vs email : segmented control type iOS */}
            <View style={{ flexDirection: 'row', backgroundColor: colors.gray[100], borderRadius: radius.md, padding: 4 }}>
              {(['phone', 'email'] as const).map((m) => {
                const active = mode === m;
                return (
                  <Pressable
                    key={m}
                    onPress={() => setMode(m)}
                    style={{
                      flex: 1,
                      paddingVertical: 10,
                      borderRadius: radius.sm,
                      backgroundColor: active ? colors.white : 'transparent',
                      alignItems: 'center',
                    }}
                  >
                    <Text style={{ fontSize: 14, fontWeight: active ? '600' : '500', color: active ? colors.primary[600] : colors.gray[600] }}>
                      {m === 'phone' ? 'Telephone' : 'Email'}
                    </Text>
                  </Pressable>
                );
              })}
            </View>

            {mode === 'phone' ? (
              <AppPhoneInput
                label="Telephone"
                value={phone}
                onChange={(v) => setPhone(v)}
                placeholder="6XX XX XX XX"
              />
            ) : (
              <Input
                label="Email"
                value={email}
                onChangeText={setEmail}
                placeholder="vous@email.com"
                autoCapitalize="none"
                autoComplete="email"
                keyboardType="email-address"
              />
            )}

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

          <Link href="/simulateur" asChild>
            <Pressable style={{ marginTop: 12, alignItems: 'center' }}>
              <Text style={{ fontSize: 13, color: colors.primary[600], fontWeight: '500' }}>Simuler un prix (sans compte)</Text>
            </Pressable>
          </Link>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}
