import type { ReactNode } from 'react';
import { View, Text } from 'react-native';
import { colors } from '@/lib/theme/colors';

interface FormFieldProps {
  label?: string;
  error?: string;
  hint?: string;
  required?: boolean;
  children: ReactNode;
}

export function FormField({ label, error, hint, required, children }: FormFieldProps) {
  return (
    <View style={{ gap: 6 }}>
      {label && (
        <Text style={{ fontSize: 13, fontWeight: '500', color: colors.gray[700] }}>
          {label}
          {required ? <Text style={{ color: colors.error }}> *</Text> : null}
        </Text>
      )}
      {children}
      {error ? (
        <Text style={{ fontSize: 11, color: colors.error }}>{error}</Text>
      ) : hint ? (
        <Text style={{ fontSize: 11, color: colors.gray[500] }}>{hint}</Text>
      ) : null}
    </View>
  );
}
