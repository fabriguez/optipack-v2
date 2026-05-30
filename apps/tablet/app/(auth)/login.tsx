import { useState } from 'react';
import { View, Text, KeyboardAvoidingView, Platform, Image, Pressable, useWindowDimensions } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { Input } from '@/components/ui/Input';
import { Button } from '@/components/ui/Button';
import { useAuth } from '@/lib/auth/AuthContext';
import { useTenant } from '@/lib/tenant/TenantContext';
import { colors } from '@/lib/theme/colors';

/**
 * Login tablette : split-screen pour valoriser l'identite marque.
 *  - Gauche : visuel branding (logo + slogan + gradient teinte primaire).
 *  - Droite : form contenu dans une carte ~40% de la largeur, bornee [300, 400].
 */
export default function LoginScreen() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [showPwd, setShowPwd] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const { login } = useAuth();
  const { meta } = useTenant();
  const router = useRouter();
  const { width } = useWindowDimensions();

  // Form : 40% de la largeur, contraint entre 300 et 400 px.
  const formWidth = Math.max(300, Math.min(400, Math.round(width * 0.4)));
  const tenantName = meta?.name ?? 'TransitSoftServices';

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
      style={{ flex: 1, flexDirection: 'row', backgroundColor: colors.white }}
    >
      {/* Panneau gauche : branding */}
      <LinearGradient
        colors={[colors.primary[700], colors.primary[500], colors.primary[400]]}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={{ flex: 1, padding: 48, justifyContent: 'space-between' }}
      >
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
          <View style={{ width: 56, height: 56, borderRadius: 16, backgroundColor: 'rgba(255,255,255,0.15)', alignItems: 'center', justifyContent: 'center', overflow: 'hidden' }}>
            {meta?.logoUrl ? (
              <Image source={{ uri: meta.logoUrl }} style={{ width: 48, height: 48 }} />
            ) : (
              <Image source={require('@/assets/icon.png')} style={{ width: 48, height: 48 }} />
            )}
          </View>
          <Text style={{ fontSize: 18, fontWeight: '700', color: colors.white }}>{tenantName}</Text>
        </View>

        <View style={{ gap: 12 }}>
          <Text style={{ fontSize: 32, fontWeight: '800', color: colors.white, lineHeight: 40 }}>
            Backoffice{'\n'}agence.
          </Text>
          <Text style={{ fontSize: 14, color: 'rgba(255,255,255,0.85)', maxWidth: 420, lineHeight: 22 }}>
            Tableau de bord, colis, paiements, personnel — tout sur la tablette, en ligne et hors ligne.
          </Text>
        </View>

        <View style={{ flexDirection: 'row', gap: 16 }}>
          {['Colis', 'Caisse', 'Personnel', 'Statistiques'].map((tag) => (
            <View key={tag} style={{ paddingHorizontal: 12, paddingVertical: 6, borderRadius: 999, backgroundColor: 'rgba(255,255,255,0.15)' }}>
              <Text style={{ color: colors.white, fontSize: 12, fontWeight: '600' }}>{tag}</Text>
            </View>
          ))}
        </View>
      </LinearGradient>

      {/* Panneau droit : form */}
      <View style={{ flex: 1, backgroundColor: colors.gray[50], alignItems: 'center', justifyContent: 'center', padding: 24 }}>
        <View style={{ width: formWidth, gap: 24 }}>
          <View style={{ gap: 6 }}>
            <Text style={{ fontSize: 22, fontWeight: '700', color: colors.gray[900] }}>Connexion</Text>
            <Text style={{ fontSize: 13, color: colors.gray[500] }}>Accedez a votre espace agent.</Text>
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
            <View>
              <Input
                label="Mot de passe"
                value={password}
                onChangeText={setPassword}
                placeholder="Votre mot de passe"
                secureTextEntry={!showPwd}
              />
              <Pressable
                onPress={() => setShowPwd((v) => !v)}
                hitSlop={8}
                style={{ position: 'absolute', right: 12, top: 32, padding: 4 }}
              >
                <Ionicons name={showPwd ? 'eye-off-outline' : 'eye-outline'} size={18} color={colors.gray[500]} />
              </Pressable>
            </View>
            <Button onPress={handleLogin} loading={submitting}>
              {submitting ? 'Connexion...' : 'Se connecter'}
            </Button>
            <Pressable onPress={() => router.push('/(auth)/forgot-password')} style={{ alignItems: 'center' }}>
              <Text style={{ fontSize: 13, color: colors.primary[600], fontWeight: '500' }}>Mot de passe oublie ?</Text>
            </Pressable>
          </View>

          <Text style={{ fontSize: 11, color: colors.gray[400], textAlign: 'center' }}>
            En vous connectant, vous acceptez les conditions d'utilisation.
          </Text>
        </View>
      </View>
    </KeyboardAvoidingView>
  );
}
