import { useState } from 'react';
import { Text, Pressable, Modal, FlatList } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { SearchBar } from '@/components/data/SearchBar';
import { useAgencies } from '@/lib/hooks/useAgencies';
import { colors } from '@/lib/theme/colors';
import { radius, spacing } from '@/lib/theme/spacing';

/** Selecteur d'agence (modal recherche) reutilisable pour les filtres de liste. */
export function AgencyPicker({
  value,
  name,
  onChange,
  width = 220,
  placeholder = 'Toutes les agences',
}: {
  value: string;
  name: string;
  onChange: (id: string, name: string) => void;
  width?: number;
  placeholder?: string;
}) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState('');
  const { data } = useAgencies({ search: search || undefined, limit: 20 } as any);
  const agencies: any[] = data?.data ?? [];

  return (
    <>
      <Pressable
        onPress={() => setOpen(true)}
        style={{ width, height: 44, borderWidth: 1, borderColor: value ? colors.primary[300] : colors.gray[300], borderRadius: radius.md, paddingHorizontal: spacing.md, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', backgroundColor: value ? colors.primary[50] : colors.white }}
      >
        <Text style={{ fontSize: 14, color: value ? colors.primary[700] : colors.gray[400], flex: 1 }} numberOfLines={1}>
          {value ? name : placeholder}
        </Text>
        {value ? (
          <Pressable onPress={() => onChange('', '')} hitSlop={8}>
            <Ionicons name="close-circle" size={16} color={colors.primary[400]} />
          </Pressable>
        ) : (
          <Ionicons name="chevron-down" size={16} color={colors.gray[400]} />
        )}
      </Pressable>

      <Modal visible={open} transparent animationType="fade" onRequestClose={() => setOpen(false)}>
        <Pressable style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.4)', justifyContent: 'center', padding: spacing['2xl'] }} onPress={() => setOpen(false)}>
          <Pressable style={{ backgroundColor: colors.white, borderRadius: radius.lg, padding: spacing.xl, maxHeight: '70%', gap: spacing.md }}>
            <SearchBar value={search} onChange={setSearch} placeholder="Rechercher une agence..." />
            <Pressable onPress={() => { onChange('', ''); setOpen(false); }} style={{ paddingVertical: 12, paddingHorizontal: spacing.md, borderRadius: radius.md }}>
              <Text style={{ fontSize: 14, color: colors.gray[600] }}>{placeholder}</Text>
            </Pressable>
            <FlatList
              data={agencies}
              keyExtractor={(a) => a.id}
              nestedScrollEnabled
              renderItem={({ item }) => (
                <Pressable
                  onPress={() => { onChange(item.id, item.name); setOpen(false); }}
                  style={({ pressed }) => ({ paddingVertical: 12, paddingHorizontal: spacing.md, borderRadius: radius.md, backgroundColor: pressed ? colors.gray[50] : 'transparent' })}
                >
                  <Text style={{ fontSize: 14, color: colors.gray[900] }}>{item.name}</Text>
                  {!!item.city && <Text style={{ fontSize: 12, color: colors.gray[400] }}>{item.city}</Text>}
                </Pressable>
              )}
            />
          </Pressable>
        </Pressable>
      </Modal>
    </>
  );
}
