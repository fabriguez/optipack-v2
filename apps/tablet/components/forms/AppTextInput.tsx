import { TextInput, type TextInputProps } from 'react-native';
import { Controller, type Control, type FieldValues, type Path } from 'react-hook-form';
import { FormField } from './FormField';
import { colors } from '@/lib/theme/colors';
import { radius, spacing } from '@/lib/theme/spacing';

interface AppTextInputProps<T extends FieldValues> extends Omit<TextInputProps, 'value' | 'onChangeText'> {
  name: Path<T>;
  control: Control<T>;
  label?: string;
  hint?: string;
  required?: boolean;
  multiline?: boolean;
}

export function AppTextInput<T extends FieldValues>({
  name,
  control,
  label,
  hint,
  required,
  multiline,
  style,
  ...rest
}: AppTextInputProps<T>) {
  return (
    <Controller
      control={control}
      name={name}
      render={({ field: { value, onChange, onBlur }, fieldState: { error } }) => (
        <FormField label={label} error={error?.message} hint={hint} required={required}>
          <TextInput
            value={value == null ? '' : String(value)}
            onChangeText={onChange}
            onBlur={onBlur}
            multiline={multiline}
            placeholderTextColor={colors.gray[400]}
            style={[
              {
                minHeight: multiline ? 88 : 44,
                borderWidth: 1,
                borderColor: error ? colors.error : colors.gray[300],
                borderRadius: radius.md,
                paddingHorizontal: spacing.lg,
                paddingVertical: multiline ? spacing.md : 0,
                fontSize: 14,
                color: colors.gray[900],
                backgroundColor: colors.white,
                textAlignVertical: multiline ? 'top' : 'center',
              },
              style,
            ]}
            {...rest}
          />
        </FormField>
      )}
    />
  );
}
