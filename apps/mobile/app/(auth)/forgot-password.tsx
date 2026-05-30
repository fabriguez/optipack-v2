import { useState } from 'react';
import { View, Text, KeyboardAvoidingView, Platform, Pressable, ScrollView } from 'react-native';
import { useRouter } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Input } from '@/components/ui/Input';
import { Button } from '@/components/ui/Button';
import { authApi } from '@/lib/api/auth';
import { colors, spacing } from '@/lib/theme/colors';
import { toast } from '@/lib/toast';

export default function ForgotPasswordScreen() {
  const router = useRouter();
  const [email, setEmail] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const handleSubmit = async () => {
    setSubmitting(true);
    try {
      await authApi.forgotPassword(email.trim());
      toast.success('Si le compte existe, un code a ete envoye par email.');
      router.push({ pathname: '/(auth)/reset-password', params: { email: email.trim() } });
    } catch (e: any) {
      toast.error(e?.response?.data?.message ?? 'Erreur');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: colors.gray[50] }}>
      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <ScrollView contentContainerStyle={{ flexGrow: 1, justifyContent: 'center', padding: spacing['2xl'] }}>
          <View style={{ marginBottom: 24 }}>
            <Text style={{ fontSize: 22, fontWeight: '700', color: colors.gray[900] }}>Mot de passe oublie</Text>
            <Text style={{ fontSize: 13, color: colors.gray[500], marginTop: 6 }}>
              Entrez votre email, nous vous enverrons un code de verification valable 10 minutes.
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
            <Button onPress={handleSubmit} loading={submitting} disabled={!email.trim()}>
              {submitting ? 'Envoi...' : 'Envoyer le code'}
            </Button>
          </View>

          <Pressable onPress={() => router.back()} style={{ marginTop: 24, alignItems: 'center' }}>
            <Text style={{ fontSize: 13, color: colors.primary[600], fontWeight: '500' }}>Retour a la connexion</Text>
          </Pressable>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}
