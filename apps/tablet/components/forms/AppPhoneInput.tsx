import { TextInput } from 'react-native';
import { Controller, type Control, type FieldValues, type Path } from 'react-hook-form';
import { FormField } from './FormField';
import { colors } from '@/lib/theme/colors';
import { radius, spacing } from '@/lib/theme/spacing';

interface AppPhoneInputProps<T extends FieldValues> {
  name: Path<T>;
  control: Control<T>;
  label?: string;
  required?: boolean;
  placeholder?: string;
}

function normalize(input: string): string {
  // Keep leading + and digits only
  const trimmed = input.replace(/[^\d+]/g, '');
  if (trimmed.startsWith('+')) return '+' + trimmed.slice(1).replace(/\+/g, '');
  return trimmed.replace(/\+/g, '');
}

export function AppPhoneInput<T extends FieldValues>({ name, control, label, required, placeholder }: AppPhoneInputProps<T>) {
  return (
    <Controller
      control={control}
      name={name}
      render={({ field: { value, onChange, onBlur }, fieldState: { error } }) => (
        <FormField label={label} error={error?.message} required={required}>
          <TextInput
            value={value == null ? '' : String(value)}
            onChangeText={(t) => onChange(normalize(t))}
            onBlur={onBlur}
            keyboardType="phone-pad"
            placeholder={placeholder ?? '+225 0X XX XX XX XX'}
            placeholderTextColor={colors.gray[400]}
            style={{
              height: 44,
              borderWidth: 1,
              borderColor: error ? colors.error : colors.gray[300],
              borderRadius: radius.md,
              paddingHorizontal: spacing.lg,
              fontSize: 14,
              color: colors.gray[900],
              backgroundColor: colors.white,
            }}
          />
        </FormField>
      )}
    />
  );
}
