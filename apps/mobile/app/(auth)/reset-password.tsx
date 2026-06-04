import { useState } from 'react';
import { View, Text, KeyboardAvoidingView, Platform, Pressable, ScrollView } from 'react-native';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Input } from '@/components/ui/Input';
import { Button } from '@/components/ui/Button';
import { portalApi } from '@/lib/api/portal';
import { colors, spacing } from '@/lib/theme/colors';
import { toast } from '@/lib/toast';

type Step = 'code' | 'password';

export default function ResetPasswordScreen() {
  const router = useRouter();
  const params = useLocalSearchParams<{ identifier?: string }>();
  const identifier = (params.identifier ?? '').trim();

  const [step, setStep] = useState<Step>('code');
  const [code, setCode] = useState('');
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [submitting, setSubmitting] = useState(false);

  // Etape 1 : valide le code OTP sans le consommer, puis passe a l'ecran mot de passe.
  const handleVerify = async () => {
    if (code.length !== 6) return;
    setSubmitting(true);
    try {
      await portalApi.verifyResetCode({ identifier, code });
      setStep('password');
    } catch (e: any) {
      toast.error(e?.response?.data?.message ?? 'Code invalide ou expire');
    } finally {
      setSubmitting(false);
    }
  };

  // Etape 2 : applique le nouveau mot de passe.
  const handleReset = async () => {
    if (password !== confirm) {
      toast.error('Les mots de passe ne correspondent pas');
      return;
    }
    setSubmitting(true);
    try {
      await portalApi.resetPassword({ identifier, code, newPassword: password });
      toast.success('Mot de passe reinitialise. Connectez-vous.');
      router.replace('/(auth)/login');
    } catch (e: any) {
      toast.error(e?.response?.data?.message ?? 'Erreur');
    } finally {
      setSubmitting(false);
    }
  };

  const handleResend = async () => {
    try {
      await portalApi.forgotPassword(identifier);
      toast.success('Nouveau code envoye.');
    } catch (e: any) {
      toast.error(e?.response?.data?.message ?? 'Erreur');
    }
  };

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: colors.gray[50] }}>
      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <ScrollView contentContainerStyle={{ flexGrow: 1, justifyContent: 'center', padding: spacing['2xl'] }}>
          {step === 'code' ? (
            <>
              <View style={{ marginBottom: 24 }}>
                <Text style={{ fontSize: 22, fontWeight: '700', color: colors.gray[900] }}>Code de verification</Text>
                <Text style={{ fontSize: 13, color: colors.gray[500], marginTop: 6 }}>
                  Saisissez le code a 6 chiffres recu par email, SMS et WhatsApp.
                </Text>
              </View>

              <View style={{ gap: 14 }}>
                <Input
                  label="Code de verification"
                  value={code}
                  onChangeText={(v) => setCode(v.replace(/\D/g, '').slice(0, 6))}
                  placeholder="123456"
                  keyboardType="number-pad"
                  maxLength={6}
                  autoComplete="one-time-code"
                />
                <Button onPress={handleVerify} loading={submitting} disabled={code.length !== 6}>
                  {submitting ? 'Verification...' : 'Verifier le code'}
                </Button>
              </View>

              <Pressable onPress={handleResend} style={{ marginTop: 20, alignItems: 'center' }}>
                <Text style={{ fontSize: 13, color: colors.primary[600], fontWeight: '500' }}>Renvoyer un code</Text>
              </Pressable>
            </>
          ) : (
            <>
              <View style={{ marginBottom: 24 }}>
                <Text style={{ fontSize: 22, fontWeight: '700', color: colors.gray[900] }}>Nouveau mot de passe</Text>
                <Text style={{ fontSize: 13, color: colors.gray[500], marginTop: 6 }}>
                  Choisissez votre nouveau mot de passe.
                </Text>
              </View>

              <View style={{ gap: 14 }}>
                <Input
                  label="Nouveau mot de passe"
                  value={password}
                  onChangeText={setPassword}
                  placeholder="Min. 6 caracteres"
                  secureTextEntry
                />
                <Input
                  label="Confirmer"
                  value={confirm}
                  onChangeText={setConfirm}
                  placeholder="Repetez le mot de passe"
                  secureTextEntry
                />
                <Button
                  onPress={handleReset}
                  loading={submitting}
                  disabled={password.length < 6 || !confirm}
                >
                  {submitting ? 'Reinitialisation...' : 'Reinitialiser'}
                </Button>
              </View>

              <Pressable onPress={() => setStep('code')} style={{ marginTop: 20, alignItems: 'center' }}>
                <Text style={{ fontSize: 13, color: colors.primary[600], fontWeight: '500' }}>Modifier le code</Text>
              </Pressable>
            </>
          )}
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}
