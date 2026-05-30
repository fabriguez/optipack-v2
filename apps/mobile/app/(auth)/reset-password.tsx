import { useState } from 'react';
import { View, Text, KeyboardAvoidingView, Platform, Pressable, ScrollView } from 'react-native';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Input } from '@/components/ui/Input';
import { Button } from '@/components/ui/Button';
import { authApi } from '@/lib/api/auth';
import { colors, spacing } from '@/lib/theme/colors';
import { toast } from '@/lib/toast';

export default function ResetPasswordScreen() {
  const router = useRouter();
  const params = useLocalSearchParams<{ email?: string }>();
  const [email, setEmail] = useState(params.email ?? '');
  const [code, setCode] = useState('');
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const handleSubmit = async () => {
    if (password !== confirm) {
      toast.error('Les mots de passe ne correspondent pas');
      return;
    }
    setSubmitting(true);
    try {
      await authApi.resetPassword({ email: email.trim(), code, newPassword: password });
      toast.success('Mot de passe reinitialise. Connectez-vous.');
      router.replace('/(auth)/login');
    } catch (e: any) {
      toast.error(e?.response?.data?.message ?? 'Erreur');
    } finally {
      setSubmitting(false);
    }
  };

  const canSubmit = !!email.trim() && code.length === 6 && !!password && !!confirm;

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: colors.gray[50] }}>
      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <ScrollView contentContainerStyle={{ flexGrow: 1, justifyContent: 'center', padding: spacing['2xl'] }}>
          <View style={{ marginBottom: 24 }}>
            <Text style={{ fontSize: 22, fontWeight: '700', color: colors.gray[900] }}>Nouveau mot de passe</Text>
            <Text style={{ fontSize: 13, color: colors.gray[500], marginTop: 6 }}>
              Saisissez le code recu par email puis votre nouveau mot de passe.
            </Text>
          </View>

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

          <Pressable
            onPress={() => router.push({ pathname: '/(auth)/forgot-password', params: { } })}
            style={{ marginTop: 20, alignItems: 'center' }}
          >
            <Text style={{ fontSize: 13, color: colors.primary[600], fontWeight: '500' }}>Renvoyer un code</Text>
          </Pressable>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}
