import { useState } from 'react';
import { Text, Pressable, Modal, FlatList } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useQuery } from '@tanstack/react-query';
import { SearchBar } from '@/components/data/SearchBar';
import { colors } from '@/lib/theme/colors';
import { radius, spacing } from '@/lib/theme/spacing';

interface Option { value: string; label: string; sublabel?: string | null }

/** Selecteur generique via une fonction de recherche (searchers.*). */
export function EntityPicker({
  value,
  name,
  onChange,
  searcher,
  placeholder = 'Selectionner...',
  queryKey,
  width,
}: {
  value: string;
  name: string;
  onChange: (id: string, name: string) => void;
  searcher: (q: string, limit?: number) => Promise<Option[]>;
  placeholder?: string;
  queryKey: string;
  width?: number;
}) {
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState('');
  const { data } = useQuery({ queryKey: [queryKey, 'pick', q], queryFn: () => searcher(q), enabled: open });
  const options = (data ?? []) as Option[];

  return (
    <>
      <Pressable
        onPress={() => setOpen(true)}
        style={{ width, height: 44, borderWidth: 1, borderColor: value ? colors.primary[300] : colors.gray[300], borderRadius: radius.md, paddingHorizontal: spacing.md, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', backgroundColor: value ? colors.primary[50] : colors.white }}
      >
        <Text style={{ fontSize: 14, color: value ? colors.primary[700] : colors.gray[400], flex: 1 }} numberOfLines={1}>{value ? name : placeholder}</Text>
        <Ionicons name="chevron-down" size={16} color={colors.gray[400]} />
      </Pressable>

      <Modal visible={open} transparent animationType="fade" onRequestClose={() => setOpen(false)}>
        <Pressable style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.4)', justifyContent: 'center', padding: spacing['2xl'] }} onPress={() => setOpen(false)}>
          <Pressable style={{ backgroundColor: colors.white, borderRadius: radius.lg, padding: spacing.xl, maxHeight: '70%', gap: spacing.md }}>
            <SearchBar value={q} onChange={setQ} placeholder="Rechercher..." />
            <FlatList
              data={options}
              keyExtractor={(o) => o.value}
              nestedScrollEnabled
              renderItem={({ item }) => (
                <Pressable onPress={() => { onChange(item.value, item.label); setOpen(false); }} style={({ pressed }) => ({ paddingVertical: 12, paddingHorizontal: spacing.md, borderRadius: radius.md, backgroundColor: pressed ? colors.gray[50] : 'transparent' })}>
                  <Text style={{ fontSize: 14, color: colors.gray[900] }}>{item.label}</Text>
                  {!!item.sublabel && <Text style={{ fontSize: 12, color: colors.gray[400] }}>{item.sublabel}</Text>}
                </Pressable>
              )}
            />
          </Pressable>
        </Pressable>
      </Modal>
    </>
  );
}
