import { useState } from 'react';
import { View, Text, TextInput, Pressable, type TextInputProps } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { colors, radius, spacing } from '@/lib/theme/colors';

interface InputProps extends TextInputProps {
  label?: string;
  error?: string;
}

export function Input({ label, error, style, secureTextEntry, ...props }: InputProps) {
  // Champ password : oeil pour basculer la visibilite. On gere `secureTextEntry`
  // en interne pour pouvoir l'inverser au tap.
  const isPassword = !!secureTextEntry;
  const [visible, setVisible] = useState(false);

  return (
    <View style={{ gap: 6 }}>
      {label && <Text style={{ fontSize: 13, fontWeight: '500', color: colors.gray[700] }}>{label}</Text>}
      <View style={{ justifyContent: 'center' }}>
        <TextInput
          style={[
            {
              height: 48,
              borderWidth: 1,
              borderColor: error ? colors.error : colors.gray[300],
              borderRadius: radius.md,
              paddingHorizontal: spacing.lg,
              paddingRight: isPassword ? 46 : spacing.lg,
              fontSize: 15,
              color: colors.gray[900],
              backgroundColor: colors.white,
            },
            style,
          ]}
          placeholderTextColor={colors.gray[400]}
          secureTextEntry={isPassword && !visible}
          {...props}
        />
        {isPassword && (
          <Pressable
            onPress={() => setVisible((v) => !v)}
            hitSlop={8}
            accessibilityLabel={visible ? 'Masquer le mot de passe' : 'Afficher le mot de passe'}
            style={{ position: 'absolute', right: spacing.md, padding: 4 }}
          >
            <Ionicons
              name={visible ? 'eye-off-outline' : 'eye-outline'}
              size={20}
              color={colors.gray[500]}
            />
          </Pressable>
        )}
      </View>
      {error && <Text style={{ fontSize: 11, color: colors.error }}>{error}</Text>}
    </View>
  );
}
