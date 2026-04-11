import { View, Text, TextInput, type TextInputProps } from 'react-native';
import { colors } from '@/lib/theme/colors';
import { radius, spacing } from '@/lib/theme/spacing';

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
            height: 44,
            borderWidth: 1,
            borderColor: error ? '#FCA5A5' : colors.gray[300],
            borderRadius: radius.md,
            paddingHorizontal: spacing.lg,
            fontSize: 14,
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
