import { View, Text, Switch } from 'react-native';
import { Controller, type Control, type FieldValues, type Path } from 'react-hook-form';
import { colors } from '@/lib/theme/colors';

interface AppSwitchProps<T extends FieldValues> {
  name: Path<T>;
  control: Control<T>;
  label: string;
  hint?: string;
}

export function AppSwitch<T extends FieldValues>({ name, control, label, hint }: AppSwitchProps<T>) {
  return (
    <Controller
      control={control}
      name={name}
      render={({ field: { value, onChange } }) => (
        <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingVertical: 8 }}>
          <View style={{ flex: 1, paddingRight: 12 }}>
            <Text style={{ fontSize: 14, fontWeight: '500', color: colors.gray[900] }}>{label}</Text>
            {hint && <Text style={{ fontSize: 12, color: colors.gray[500], marginTop: 2 }}>{hint}</Text>}
          </View>
          <Switch
            value={!!value}
            onValueChange={onChange}
            trackColor={{ false: colors.gray[300], true: colors.primary[500] }}
            thumbColor={colors.white}
          />
        </View>
      )}
    />
  );
}
