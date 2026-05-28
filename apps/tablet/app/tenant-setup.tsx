import { useState } from 'react';
import { View, Text, KeyboardAvoidingView, Platform } from 'react-native';
import { useRouter } from 'expo-router';
import { Input } from '@/components/ui/Input';
import { Button } from '@/components/ui/Button';
import { useTenant } from '@/lib/tenant/TenantContext';
import { apiClient, setTenantSlug } from '@/lib/api/client';
import { colors } from '@/lib/theme/colors';

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
      setTenantSlug(slug);
      const { data } = await apiClient.get('/tenant-meta/public', {
        headers: { 'X-Tenant': slug },
      });
      if (!data?.data) throw new Error('Tenant introuvable');
      await setSlug(slug);
      router.replace('/(auth)/login');
    } catch (e: any) {
      setError(e?.response?.data?.message ?? 'Tenant introuvable ou indisponible');
      setTenantSlug(null);
    } finally {
      setLoading(false);
    }
  };

  return (
    <KeyboardAvoidingView
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      style={{ flex: 1, backgroundColor: colors.gray[50], alignItems: 'center', justifyContent: 'center' }}
    >
      <View style={{ width: 460, padding: 32, gap: 18 }}>
        <View style={{ alignItems: 'center', marginBottom: 16 }}>
          <View style={{ width: 72, height: 72, borderRadius: 18, backgroundColor: colors.primary[500], alignItems: 'center', justifyContent: 'center', marginBottom: 12 }}>
            <Text style={{ fontSize: 28, fontWeight: '700', color: colors.white }}>TS</Text>
          </View>
          <Text style={{ fontSize: 22, fontWeight: '700', color: colors.gray[900] }}>Configurer l'application</Text>
          <Text style={{ fontSize: 13, color: colors.gray[500], marginTop: 4, textAlign: 'center' }}>
            Saisissez le code de votre organisation
          </Text>
        </View>

        {error && (
          <View style={{ backgroundColor: '#FEE2E2', borderRadius: 12, padding: 12 }}>
            <Text style={{ fontSize: 13, color: '#B91C1C' }}>{error}</Text>
          </View>
        )}

        <Input
          label="Code organisation"
          value={input}
          onChangeText={setInput}
          placeholder="ex: acme"
          autoCapitalize="none"
        />
        <Button onPress={submit} loading={loading}>
          {loading ? 'Verification...' : 'Continuer'}
        </Button>
      </View>
    </KeyboardAvoidingView>
  );
}
