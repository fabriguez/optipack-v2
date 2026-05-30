import { useState } from 'react';
import { View, Text, KeyboardAvoidingView, Platform, Pressable, useWindowDimensions } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { Input } from '@/components/ui/Input';
import { Button } from '@/components/ui/Button';
import { authApi } from '@/lib/api/auth';
import { useTenant } from '@/lib/tenant/TenantContext';
import { colors } from '@/lib/theme/colors';

/** Demande de code de reinitialisation (split-screen, coherent avec le login). */
export default function ForgotPasswordScreen() {
  const [email, setEmail] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const { meta } = useTenant();
  const router = useRouter();
  const { width } = useWindowDimensions();

  const formWidth = Math.max(300, Math.min(400, Math.round(width * 0.4)));
  const tenantName = meta?.name ?? 'TransitSoftServices';

  const handleSubmit = async () => {
    setError(null);
    setSubmitting(true);
    try {
      await authApi.forgotPassword(email.trim());
      router.push({ pathname: '/(auth)/reset-password', params: { email: email.trim() } });
    } catch (e: any) {
      setError(e?.response?.data?.message ?? 'Erreur');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <KeyboardAvoidingView
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      style={{ flex: 1, flexDirection: 'row', backgroundColor: colors.white }}
    >
      <LinearGradient
        colors={[colors.primary[700], colors.primary[500], colors.primary[400]]}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={{ flex: 1, padding: 48, justifyContent: 'center', gap: 12 }}
      >
        <Text style={{ fontSize: 32, fontWeight: '800', color: colors.white, lineHeight: 40 }}>
          Mot de passe{'\n'}oublie.
        </Text>
        <Text style={{ fontSize: 14, color: 'rgba(255,255,255,0.85)', maxWidth: 420, lineHeight: 22 }}>
          Recevez un code de verification par email pour reinitialiser votre acces a {tenantName}.
        </Text>
      </LinearGradient>

      <View style={{ flex: 1, backgroundColor: colors.gray[50], alignItems: 'center', justifyContent: 'center', padding: 24 }}>
        <View style={{ width: formWidth, gap: 24 }}>
          <View style={{ gap: 6 }}>
            <Text style={{ fontSize: 22, fontWeight: '700', color: colors.gray[900] }}>Code de reinitialisation</Text>
            <Text style={{ fontSize: 13, color: colors.gray[500] }}>
              Entrez votre email, code valable 10 minutes.
            </Text>
          </View>

          {error && (
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, backgroundColor: '#FEE2E2', borderRadius: 12, padding: 12 }}>
              <Ionicons name="alert-circle" size={16} color="#B91C1C" />
              <Text style={{ flex: 1, fontSize: 12, color: '#B91C1C' }}>{error}</Text>
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
            <Button onPress={handleSubmit} loading={submitting} disabled={!email.trim()}>
              {submitting ? 'Envoi...' : 'Envoyer le code'}
            </Button>
          </View>

          <Pressable onPress={() => router.replace('/(auth)/login')} style={{ alignItems: 'center' }}>
            <Text style={{ fontSize: 13, color: colors.primary[600], fontWeight: '500' }}>Retour a la connexion</Text>
          </Pressable>
        </View>
      </View>
    </KeyboardAvoidingView>
  );
}
