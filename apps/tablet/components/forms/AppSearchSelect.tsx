import { useMemo, useState } from 'react';
import { View, Text, Pressable, Modal, FlatList, TextInput, ActivityIndicator } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Controller, type Control, type FieldValues, type Path } from 'react-hook-form';
import { FormField } from './FormField';
import { colors } from '@/lib/theme/colors';
import { radius, spacing } from '@/lib/theme/spacing';

export interface SearchSelectItem {
  value: string;
  label: string;
  hint?: string;
}

interface AppSearchSelectProps<T extends FieldValues> {
  name: Path<T>;
  control: Control<T>;
  label?: string;
  required?: boolean;
  /** Either static items or an async loader. */
  items?: SearchSelectItem[];
  search?: (query: string) => Promise<SearchSelectItem[]>;
  placeholder?: string;
  /** Cached label for the current value (so we can render even before items load). */
  selectedLabel?: string;
}

export function AppSearchSelect<T extends FieldValues>({
  name,
  control,
  label,
  required,
  items: staticItems,
  search,
  placeholder = 'Rechercher...',
  selectedLabel,
}: AppSearchSelectProps<T>) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [remote, setRemote] = useState<SearchSelectItem[] | null>(null);
  const [loading, setLoading] = useState(false);

  const filteredStatic = useMemo(() => {
    if (!staticItems) return [];
    const q = query.trim().toLowerCase();
    if (!q) return staticItems;
    return staticItems.filter((i) => i.label.toLowerCase().includes(q));
  }, [staticItems, query]);

  const runRemoteSearch = async (q: string) => {
    if (!search) return;
    setLoading(true);
    try {
      const res = await search(q);
      setRemote(res);
    } catch {
      setRemote([]);
    } finally {
      setLoading(false);
    }
  };

  return (
    <Controller
      control={control}
      name={name}
      render={({ field: { value, onChange }, fieldState: { error } }) => {
        const display =
          (staticItems?.find((i) => i.value === value)?.label) ?? selectedLabel ?? (value ? String(value) : '');
        return (
          <FormField label={label} error={error?.message} required={required}>
            <Pressable
              onPress={() => {
                setOpen(true);
                setQuery('');
                if (search) runRemoteSearch('');
              }}
              style={{
                minHeight: 44,
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
              <Text style={{ flex: 1, fontSize: 14, color: display ? colors.gray[900] : colors.gray[400] }} numberOfLines={1}>
                {display || placeholder}
              </Text>
              <Ionicons name="search" size={18} color={colors.gray[500]} />
            </Pressable>
            <Modal visible={open} transparent animationType="fade" onRequestClose={() => setOpen(false)}>
              <Pressable
                onPress={() => setOpen(false)}
                style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.45)', alignItems: 'center', justifyContent: 'center', padding: 24 }}
              >
                <Pressable
                  onPress={(e) => e.stopPropagation()}
                  style={{
                    width: 560,
                    maxWidth: '100%',
                    maxHeight: '80%',
                    backgroundColor: colors.white,
                    borderRadius: radius.lg,
                    overflow: 'hidden',
                  }}
                >
                  <View style={{ padding: spacing.lg, gap: spacing.md, borderBottomWidth: 1, borderBottomColor: colors.gray[200] }}>
                    <Text style={{ fontSize: 16, fontWeight: '600', color: colors.gray[900] }}>{label ?? 'Rechercher'}</Text>
                    <TextInput
                      value={query}
                      onChangeText={(t) => {
                        setQuery(t);
                        if (search) runRemoteSearch(t);
                      }}
                      placeholder={placeholder}
                      placeholderTextColor={colors.gray[400]}
                      autoFocus
                      style={{
                        height: 40,
                        borderWidth: 1,
                        borderColor: colors.gray[300],
                        borderRadius: radius.md,
                        paddingHorizontal: spacing.lg,
                        fontSize: 14,
                        color: colors.gray[900],
                      }}
                    />
                  </View>
                  {loading ? (
                    <View style={{ padding: 24, alignItems: 'center' }}>
                      <ActivityIndicator color={colors.primary[500]} />
                    </View>
                  ) : (
                    <FlatList
                      data={search ? remote ?? [] : filteredStatic}
                      keyExtractor={(o) => o.value}
                      ListEmptyComponent={
                        <View style={{ padding: 24, alignItems: 'center' }}>
                          <Text style={{ fontSize: 13, color: colors.gray[500] }}>Aucun resultat</Text>
                        </View>
                      }
                      renderItem={({ item }) => {
                        const active = item.value === value;
                        return (
                          <Pressable
                            onPress={() => {
                              onChange(item.value);
                              setOpen(false);
                            }}
                            style={{
                              padding: spacing.lg,
                              backgroundColor: active ? colors.primary[50] : colors.white,
                            }}
                          >
                            <Text style={{ fontSize: 14, color: colors.gray[900] }}>{item.label}</Text>
                            {item.hint && (
                              <Text style={{ fontSize: 12, color: colors.gray[500], marginTop: 2 }}>{item.hint}</Text>
                            )}
                          </Pressable>
                        );
                      }}
                      ItemSeparatorComponent={() => (
                        <View style={{ height: 1, backgroundColor: colors.gray[100] }} />
                      )}
                    />
                  )}
                </Pressable>
              </Pressable>
            </Modal>
          </FormField>
        );
      }}
    />
  );
}
