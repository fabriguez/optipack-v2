import { View, Text, Pressable, Alert } from 'react-native';
import { Ionicons, FontAwesome } from '@expo/vector-icons';
import { colors, spacing } from '@/lib/theme/colors';

interface Props {
  /** Adapte le libellé ("Continuer avec…" vs "Se connecter avec…"). */
  intent: 'register' | 'login';
}

/**
 * Boutons OAuth Google / Apple / Facebook pour le portail client mobile.
 * Decoration uniquement : aucun provider n'est encore branche cote backend.
 * Le tap affiche une alerte "bientot disponible". Le jour ou les endpoints
 * /api/v1/client-portal/oauth/<provider>/start sont prets, remplacer
 * handlePress par un `expo-web-browser` ou `expo-auth-session`.
 */
export function SocialAuthButtons({ intent }: Props) {
  const verb = intent === 'register' ? 'Continuer avec' : 'Se connecter avec';

  const handlePress = (provider: 'google' | 'apple' | 'facebook') => {
    const label =
      provider === 'google' ? 'Google' : provider === 'apple' ? 'Apple' : 'Facebook';
    Alert.alert(
      `${label} bientot disponible`,
      `L'authentification ${label} sera activee dans une prochaine mise a jour. Utilisez le formulaire ci-dessous pour le moment.`,
    );
  };

  const SIZE = 44;

  return (
    <View>
      {/* Boutons icon-only, alignes en ligne. */}
      <View style={{ flexDirection: 'row', justifyContent: 'center', gap: 16 }}>
        <Pressable
          onPress={() => handlePress('google')}
          accessibilityLabel={`${verb} Google`}
          style={({ pressed }) => ({
            width: SIZE,
            height: SIZE,
            alignItems: 'center',
            justifyContent: 'center',
            borderRadius: SIZE / 2,
            borderWidth: 1,
            borderColor: colors.gray[200],
            backgroundColor: pressed ? colors.gray[50] : colors.white,
          })}
        >
          <FontAwesome name="google" size={18} color="#DB4437" />
        </Pressable>
        <Pressable
          onPress={() => handlePress('apple')}
          accessibilityLabel={`${verb} Apple`}
          style={({ pressed }) => ({
            width: SIZE,
            height: SIZE,
            alignItems: 'center',
            justifyContent: 'center',
            borderRadius: SIZE / 2,
            backgroundColor: pressed ? '#222' : '#111',
          })}
        >
          <Ionicons name="logo-apple" size={20} color={colors.white} />
        </Pressable>
        <Pressable
          onPress={() => handlePress('facebook')}
          accessibilityLabel={`${verb} Facebook`}
          style={({ pressed }) => ({
            width: SIZE,
            height: SIZE,
            alignItems: 'center',
            justifyContent: 'center',
            borderRadius: SIZE / 2,
            backgroundColor: pressed ? '#1664d6' : '#1877F2',
          })}
        >
          <FontAwesome name="facebook" size={18} color={colors.white} />
        </Pressable>
      </View>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginVertical: spacing.md }}>
        <View style={{ flex: 1, height: 1, backgroundColor: colors.gray[200] }} />
        <Text style={{ fontSize: 11, color: colors.gray[500] }}>OU</Text>
        <View style={{ flex: 1, height: 1, backgroundColor: colors.gray[200] }} />
      </View>
    </View>
  );
}
