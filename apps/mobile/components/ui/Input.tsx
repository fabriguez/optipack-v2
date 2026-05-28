import { View, Text, TextInput, type TextInputProps } from 'react-native';
import { colors, radius, spacing } from '@/lib/theme/colors';

interface InputProps extends TextInputProps {
  label?: string;
  error?: string;
}

export function Input({ label, error, style, ...props }: InputProps) {
  return (
    <View style={{ gap: 6 }}>
      {label && <Text style={{ fontSize: 13, fontWeight: '500', color: colors.gray[700] }}>{label}</Text>}
      <TextInput
        style={[
          {
            height: 48,
            borderWidth: 1,
            borderColor: error ? colors.error : colors.gray[300],
            borderRadius: radius.md,
            paddingHorizontal: spacing.lg,
            fontSize: 15,
            color: colors.gray[900],
            backgroundColor: colors.white,
          },
          style,
        ]}
        placeholderTextColor={colors.gray[400]}
        {...props}
      />
      {error && <Text style={{ fontSize: 11, color: colors.error }}>{error}</Text>}
    </View>
  );
}
