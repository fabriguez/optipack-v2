import { useState } from 'react';
import { View, Text, Pressable, Modal, FlatList } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Controller, type Control, type FieldValues, type Path } from 'react-hook-form';
import { FormField } from './FormField';
import { colors } from '@/lib/theme/colors';
import { radius, spacing } from '@/lib/theme/spacing';

export interface SelectOption {
  value: string;
  label: string;
}

interface AppSelectProps<T extends FieldValues> {
  name: Path<T>;
  control: Control<T>;
  label?: string;
  hint?: string;
  required?: boolean;
  options: SelectOption[];
  placeholder?: string;
}

export function AppSelect<T extends FieldValues>({
  name,
  control,
  label,
  hint,
  required,
  options,
  placeholder = 'Selectionner...',
}: AppSelectProps<T>) {
  const [open, setOpen] = useState(false);
  return (
    <Controller
      control={control}
      name={name}
      render={({ field: { value, onChange }, fieldState: { error } }) => {
        const current = options.find((o) => o.value === value);
        return (
          <FormField label={label} error={error?.message} hint={hint} required={required}>
            <Pressable
              onPress={() => setOpen(true)}
              style={{
                height: 44,
                borderWidth: 1,
                borderColor: error ? colors.error : colors.gray[300],
                borderRadius: radius.md,
                paddingHorizontal: spacing.lg,
                flexDirection: 'row',
                alignItems: 'center',
                justifyContent: 'space-between',
                backgroundColor: colors.white,
              }}
            >
              <Text style={{ fontSize: 14, color: current ? colors.gray[900] : colors.gray[400] }}>
                {current?.label ?? placeholder}
              </Text>
              <Ionicons name="chevron-down" size={18} color={colors.gray[500]} />
            </Pressable>
            <Modal visible={open} transparent animationType="fade" onRequestClose={() => setOpen(false)}>
              <Pressable
                onPress={() => setOpen(false)}
                style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.45)', alignItems: 'center', justifyContent: 'center', padding: 24 }}
              >
                <Pressable
                  onPress={(e) => e.stopPropagation()}
                  style={{
                    width: 480,
                    maxWidth: '100%',
                    maxHeight: '70%',
                    backgroundColor: colors.white,
                    borderRadius: radius.lg,
                    overflow: 'hidden',
                  }}
                >
                  <View style={{ padding: spacing.lg, borderBottomWidth: 1, borderBottomColor: colors.gray[200] }}>
                    <Text style={{ fontSize: 16, fontWeight: '600', color: colors.gray[900] }}>
                      {label ?? 'Selectionner'}
                    </Text>
                  </View>
                  <FlatList
                    data={options}
                    keyExtractor={(o) => o.value}
                    renderItem={({ item }) => {
                      const active = item.value === value;
                      return (
                        <Pressable
                          onPress={() => {
                            onChange(item.value);
                            setOpen(false);
                          }}
                          style={{
                            flexDirection: 'row',
                            alignItems: 'center',
                            justifyContent: 'space-between',
                            padding: spacing.lg,
                            backgroundColor: active ? colors.primary[50] : colors.white,
                          }}
                        >
                          <Text style={{ fontSize: 14, color: colors.gray[900] }}>{item.label}</Text>
                          {active && <Ionicons name="checkmark" size={18} color={colors.primary[600]} />}
                        </Pressable>
                      );
                    }}
                    ItemSeparatorComponent={() => (
                      <View style={{ height: 1, backgroundColor: colors.gray[100] }} />
                    )}
                  />
                </Pressable>
              </Pressable>
            </Modal>
          </FormField>
        );
      }}
    />
  );
}
