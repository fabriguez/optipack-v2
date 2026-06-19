import { useState } from 'react';
import { View, Text, KeyboardAvoidingView, Platform, Pressable, useWindowDimensions } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { Input } from '@/components/ui/Input';
import { Button } from '@/components/ui/Button';
import { authApi } from '@/lib/api/auth';
import { useTenant } from '@/lib/tenant/TenantContext';
import { colors } from '@/lib/theme/colors';

/** Saisie du code OTP + nouveau mot de passe (split-screen). */
export default function ResetPasswordScreen() {
  const params = useLocalSearchParams<{ email?: string }>();
  const [email, setEmail] = useState(params.email ?? '');
  const [code, setCode] = useState('');
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const { meta } = useTenant();
  const router = useRouter();
  const { width } = useWindowDimensions();

  const formWidth = Math.max(300, Math.min(400, Math.round(width * 0.4)));
  const tenantName = meta?.name ?? '';
  const canSubmit = !!email.trim() && code.length === 6 && !!password && !!confirm;

  const handleSubmit = async () => {
    setError(null);
    if (password !== confirm) {
      setError('Les mots de passe ne correspondent pas');
      return;
    }
    setSubmitting(true);
    try {
      await authApi.resetPassword({ email: email.trim(), code, newPassword: password });
      router.replace('/(auth)/login');
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
          Nouveau{'\n'}mot de passe.
        </Text>
        <Text style={{ fontSize: 14, color: 'rgba(255,255,255,0.85)', maxWidth: 420, lineHeight: 22 }}>
          Saisissez le code recu par email pour securiser votre acces a {tenantName}.
        </Text>
      </LinearGradient>

      <View style={{ flex: 1, backgroundColor: colors.gray[50], alignItems: 'center', justifyContent: 'center', padding: 24 }}>
        <View style={{ width: formWidth, gap: 20 }}>
          <View style={{ gap: 6 }}>
            <Text style={{ fontSize: 22, fontWeight: '700', color: colors.gray[900] }}>Reinitialisation</Text>
            <Text style={{ fontSize: 13, color: colors.gray[500] }}>Code recu par email + nouveau mot de passe.</Text>
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
            <Input
              label="Code de verification"
              value={code}
              onChangeText={(v) => setCode(v.replace(/\D/g, '').slice(0, 6))}
              placeholder="123456"
              keyboardType="number-pad"
              maxLength={6}
              autoComplete="one-time-code"
            />
            <Input
              label="Nouveau mot de passe"
              value={password}
              onChangeText={setPassword}
              placeholder="Min. 8 caracteres"
              secureTextEntry
            />
            <Input
              label="Confirmer"
              value={confirm}
              onChangeText={setConfirm}
              placeholder="Repetez le mot de passe"
              secureTextEntry
            />
            <Button onPress={handleSubmit} loading={submitting} disabled={!canSubmit}>
              {submitting ? 'Reinitialisation...' : 'Reinitialiser'}
            </Button>
          </View>

          <Pressable onPress={() => router.replace('/(auth)/forgot-password')} style={{ alignItems: 'center' }}>
            <Text style={{ fontSize: 13, color: colors.primary[600], fontWeight: '500' }}>Renvoyer un code</Text>
          </Pressable>
        </View>
      </View>
    </KeyboardAvoidingView>
  );
}
