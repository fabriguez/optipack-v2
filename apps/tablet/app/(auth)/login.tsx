import { useState } from 'react';
import { View, Text, KeyboardAvoidingView, Platform } from 'react-native';
import { useRouter } from 'expo-router';
import { Input } from '@/components/ui/Input';
import { Button } from '@/components/ui/Button';
import { useAuth } from '@/lib/auth/AuthContext';
import { colors } from '@/lib/theme/colors';

export default function LoginScreen() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const { login } = useAuth();
  const router = useRouter();

  const handleLogin = async () => {
    setError(null);
    setSubmitting(true);
    try {
      await login(email, password);
      router.replace('/(dashboard)');
    } catch {
      setError('Email ou mot de passe incorrect');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <KeyboardAvoidingView
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      style={{ flex: 1, backgroundColor: colors.gray[50], justifyContent: 'center', alignItems: 'center' }}
    >
      <View style={{ width: 400, padding: 32 }}>
        <View style={{ alignItems: 'center', marginBottom: 40 }}>
          <View style={{ width: 64, height: 64, borderRadius: 16, backgroundColor: colors.primary[500], alignItems: 'center', justifyContent: 'center', marginBottom: 16 }}>
            <Text style={{ fontSize: 24, fontWeight: '700', color: colors.white }}>OP</Text>
          </View>
          <Text style={{ fontSize: 24, fontWeight: '700', color: colors.gray[900] }}>TransitSoftServices</Text>
          <Text style={{ fontSize: 14, color: colors.gray[500], marginTop: 4 }}>Connectez-vous a votre compte</Text>
        </View>

        <View style={{ backgroundColor: colors.white, borderRadius: 16, padding: 32, shadowColor: '#000', shadowOpacity: 0.05, shadowRadius: 10, elevation: 2 }}>
          {error && (
            <View style={{ backgroundColor: '#FEF2F2', borderRadius: 12, padding: 12, marginBottom: 16 }}>
              <Text style={{ fontSize: 13, color: '#B91C1C' }}>{error}</Text>
            </View>
          )}

          <View style={{ gap: 16 }}>
            <Input label="Email" value={email} onChangeText={setEmail} placeholder="votre@email.com" keyboardType="email-address" autoCapitalize="none" />
            <Input label="Mot de passe" value={password} onChangeText={setPassword} placeholder="Votre mot de passe" secureTextEntry />
            <Button onPress={handleLogin} loading={submitting}>
              {submitting ? 'Connexion...' : 'Se connecter'}
            </Button>
          </View>
        </View>
      </View>
    </KeyboardAvoidingView>
  );
}
