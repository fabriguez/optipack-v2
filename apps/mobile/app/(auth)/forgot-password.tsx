import { useState } from 'react';
import { View, Text, KeyboardAvoidingView, Platform, Pressable, ScrollView } from 'react-native';
import { useRouter } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Input } from '@/components/ui/Input';
import { Button } from '@/components/ui/Button';
import { AppPhoneInput } from '@/components/ui/AppPhoneInput';
import { portalApi } from '@/lib/api/portal';
import { colors, radius, spacing } from '@/lib/theme/colors';
import { toast } from '@/lib/toast';

type IdentifierMode = 'phone' | 'email';

export default function ForgotPasswordScreen() {
  const router = useRouter();
  const [mode, setMode] = useState<IdentifierMode>('phone');
  const [phone, setPhone] = useState('');
  const [email, setEmail] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const identifier = mode === 'phone' ? phone.replace(/\s/g, '') : email.trim();

  const handleSubmit = async () => {
    if (!identifier) return;
    setSubmitting(true);
    try {
      await portalApi.forgotPassword(identifier);
      // Message generique : on ne revele pas si le compte existe.
      toast.success('Si un compte existe, un code vous a ete envoye.');
      router.push({ pathname: '/(auth)/reset-password', params: { identifier } });
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
              Entrez votre email ou telephone. Si un compte existe, nous vous enverrons un code
              valable 10 minutes par email, SMS et WhatsApp.
            </Text>
          </View>

          <View style={{ gap: 14 }}>
            {/* Toggle phone vs email : aligne sur l'ecran de connexion. */}
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
                keyboardType="email-address"
                autoCapitalize="none"
                autoComplete="email"
              />
            )}

            <Button onPress={handleSubmit} loading={submitting} disabled={!identifier}>
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
