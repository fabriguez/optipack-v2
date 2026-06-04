import { useState } from 'react';
import { View, Text, KeyboardAvoidingView, Platform, Pressable, ScrollView } from 'react-native';
import { useRouter } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { Input } from '@/components/ui/Input';
import { AppPhoneInput } from '@/components/ui/AppPhoneInput';
import { Button } from '@/components/ui/Button';
import { useAuth } from '@/lib/auth/AuthContext';
import { colors, spacing } from '@/lib/theme/colors';
import { toast } from '@/lib/toast';

export default function RegisterScreen() {
  const { register } = useAuth();
  const router = useRouter();
  const [form, setForm] = useState({ fullName: '', email: '', phone: '', password: '' });
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const submit = async () => {
    setError(null);
    if (!form.fullName.trim() || !form.email.trim() || !form.phone.trim() || form.password.length < 6) {
      setError('Tous les champs sont obligatoires (mot de passe >= 6).');
      return;
    }
    setSubmitting(true);
    try {
      await register({ ...form, email: form.email.trim() });
      router.replace('/(tabs)');
    } catch (e: any) {
      const msg = e?.response?.data?.message ?? 'Inscription impossible';
      setError(msg);
      toast.error(msg);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: colors.gray[50] }}>
      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <View style={{ flexDirection: 'row', alignItems: 'center', padding: spacing.lg }}>
          <Pressable onPress={() => router.back()} hitSlop={10}>
            <Ionicons name="arrow-back" size={22} color={colors.gray[700]} />
          </Pressable>
          <Text style={{ fontSize: 17, fontWeight: '600', color: colors.gray[900], marginLeft: 12 }}>Creer un compte</Text>
        </View>
        <ScrollView contentContainerStyle={{ padding: spacing['2xl'], gap: 14 }}>
          {error && (
            <View style={{ backgroundColor: '#FEE2E2', borderRadius: 12, padding: 12 }}>
              <Text style={{ fontSize: 13, color: '#B91C1C' }}>{error}</Text>
            </View>
          )}
          <Input label="Nom complet" value={form.fullName} onChangeText={(t) => setForm((f) => ({ ...f, fullName: t }))} placeholder="Jean Dupont" />
          <Input label="Email" value={form.email} onChangeText={(t) => setForm((f) => ({ ...f, email: t }))} placeholder="vous@email.com" keyboardType="email-address" autoCapitalize="none" />
          <AppPhoneInput
            label="Telephone"
            value={form.phone}
            onChange={(v) => setForm((f) => ({ ...f, phone: v }))}
            placeholder="6XX XX XX XX"
          />
          <Input label="Mot de passe" value={form.password} onChangeText={(t) => setForm((f) => ({ ...f, password: t }))} placeholder="Min. 6 caracteres" secureTextEntry />
          <Button onPress={submit} loading={submitting}>
            {submitting ? 'Creation...' : 'Creer mon compte'}
          </Button>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}
