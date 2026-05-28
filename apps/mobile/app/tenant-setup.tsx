import { useState } from 'react';
import { View, Text, KeyboardAvoidingView, Platform, ScrollView } from 'react-native';
import { useRouter } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Input } from '@/components/ui/Input';
import { Button } from '@/components/ui/Button';
import { useTenant } from '@/lib/tenant/TenantContext';
import { setTenantSlug } from '@/lib/api/client';
import { apiClient } from '@/lib/api/client';
import { colors, spacing } from '@/lib/theme/colors';
import { toast } from '@/lib/toast';

export default function TenantSetupScreen() {
  const router = useRouter();
  const { setSlug } = useTenant();
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const submit = async () => {
    const slug = input.trim().toLowerCase();
    if (!slug) return;
    setError(null);
    setLoading(true);
    try {
      // Verifie que le tenant existe avant d'enregistrer
      setTenantSlug(slug);
      const { data } = await apiClient.get('/tenant-meta/public', {
        headers: { 'X-Tenant': slug },
      });
      if (!data?.data) throw new Error('Tenant introuvable');
      await setSlug(slug);
      toast.success('Tenant configure');
      router.replace('/(auth)/login');
    } catch (e: any) {
      setError(e?.response?.data?.message ?? 'Tenant introuvable ou indisponible');
      setTenantSlug(null);
    } finally {
      setLoading(false);
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
            <Text style={{ fontSize: 22, fontWeight: '700', color: colors.gray[900] }}>Configurer l'application</Text>
            <Text style={{ fontSize: 13, color: colors.gray[500], marginTop: 4, textAlign: 'center' }}>
              Saisissez le code de votre organisation pour continuer.
            </Text>
          </View>

          {error && (
            <View style={{ backgroundColor: '#FEE2E2', borderRadius: 12, padding: 12, marginBottom: 16 }}>
              <Text style={{ fontSize: 13, color: '#B91C1C' }}>{error}</Text>
            </View>
          )}

          <View style={{ gap: 14 }}>
            <Input
              label="Code organisation"
              value={input}
              onChangeText={setInput}
              placeholder="ex: acme"
              autoCapitalize="none"
              autoCorrect={false}
            />
            <Button onPress={submit} loading={loading}>
              {loading ? 'Verification...' : 'Continuer'}
            </Button>
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}
