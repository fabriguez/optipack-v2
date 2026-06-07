import { useEffect, useState } from 'react';
import { View, TextInput, Pressable } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { colors } from '@/lib/theme/colors';
import { radius, spacing } from '@/lib/theme/spacing';

interface SearchBarProps {
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  debounceMs?: number;
}

/** Champ de recherche debounce (mirror web SearchBar). */
export function SearchBar({ value, onChange, placeholder = 'Rechercher...', debounceMs = 400 }: SearchBarProps) {
  const [local, setLocal] = useState(value);

  useEffect(() => {
    setLocal(value);
  }, [value]);

  useEffect(() => {
    const t = setTimeout(() => {
      if (local !== value) onChange(local);
    }, debounceMs);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [local]);

  return (
    <View
      style={{
        flexDirection: 'row',
        alignItems: 'center',
        gap: spacing.sm,
        backgroundColor: colors.white,
        borderRadius: radius.md,
        borderWidth: 1,
        borderColor: colors.gray[200],
        paddingHorizontal: spacing.lg,
        height: 44,
      }}
    >
      <Ionicons name="search" size={18} color={colors.gray[400]} />
      <TextInput
        value={local}
        onChangeText={setLocal}
        placeholder={placeholder}
        placeholderTextColor={colors.gray[400]}
        style={{ flex: 1, fontSize: 14, color: colors.gray[900] }}
      />
      {local.length > 0 && (
        <Pressable onPress={() => { setLocal(''); onChange(''); }} hitSlop={10}>
          <Ionicons name="close-circle" size={18} color={colors.gray[400]} />
        </Pressable>
      )}
    </View>
  );
}
