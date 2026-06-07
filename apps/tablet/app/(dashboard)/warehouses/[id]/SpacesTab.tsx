import { useEffect, useState } from 'react';
import { View, Text, TextInput, Switch, Pressable } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { SectionCard, EmptyState } from '@/components/data/DetailCards';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { useWarehouseSpaces, useUpsertWarehouseSpaces } from '@/lib/hooks/useWarehouseSpaces';
import { colors } from '@/lib/theme/colors';
import { radius, spacing } from '@/lib/theme/spacing';

interface Space {
  id?: string;
  name: string;
  description?: string;
  isActive?: boolean;
  parcelCount?: number;
}

export function SpacesTab({ warehouseId }: { warehouseId: string }) {
  const { data } = useWarehouseSpaces(warehouseId);
  const upsert = useUpsertWarehouseSpaces(warehouseId);
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState<Space[]>([]);

  const spaces: Space[] = data?.data ?? data ?? [];

  useEffect(() => {
    if (editing) setDraft(spaces.map((s) => ({ ...s })));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [editing]);

  const updateDraft = (i: number, patch: Partial<Space>) => setDraft((p) => p.map((s, idx) => (idx === i ? { ...s, ...patch } : s)));
  const addRow = () => setDraft((p) => [...p, { name: '', description: '', isActive: true }]);
  const removeRow = (i: number) => setDraft((p) => p.filter((_, idx) => idx !== i));

  const save = () => {
    upsert.mutate(
      draft.filter((s) => s.name.trim()).map((s) => ({ id: s.id, name: s.name, description: s.description, isActive: s.isActive })) as never,
      { onSuccess: () => setEditing(false) },
    );
  };

  return (
    <SectionCard
      title={`Zones de rangement (${spaces.length})`}
      action={
        editing ? (
          <View style={{ flexDirection: 'row', gap: spacing.sm }}>
            <Button size="sm" variant="ghost" onPress={() => setEditing(false)}>Annuler</Button>
            <Button size="sm" loading={upsert.isPending} onPress={save}>Enregistrer</Button>
          </View>
        ) : (
          <Button size="sm" variant="outline" onPress={() => setEditing(true)}>Gerer</Button>
        )
      }
    >
      {editing ? (
        <View style={{ gap: spacing.sm }}>
          {draft.map((s, i) => (
            <View key={i} style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.sm }}>
              <TextInput
                value={s.name}
                onChangeText={(v) => updateDraft(i, { name: v })}
                placeholder="Nom"
                placeholderTextColor={colors.gray[400]}
                style={{ flex: 1, height: 40, borderWidth: 1, borderColor: colors.gray[300], borderRadius: radius.md, paddingHorizontal: spacing.md, fontSize: 14, color: colors.gray[900] }}
              />
              <TextInput
                value={s.description ?? ''}
                onChangeText={(v) => updateDraft(i, { description: v })}
                placeholder="Description"
                placeholderTextColor={colors.gray[400]}
                style={{ flex: 1, height: 40, borderWidth: 1, borderColor: colors.gray[300], borderRadius: radius.md, paddingHorizontal: spacing.md, fontSize: 14, color: colors.gray[900] }}
              />
              <Switch value={s.isActive !== false} onValueChange={(v) => updateDraft(i, { isActive: v })} trackColor={{ true: colors.primary[400], false: colors.gray[300] }} thumbColor={colors.white} />
              <Pressable onPress={() => removeRow(i)} hitSlop={6}>
                <Ionicons name="trash-outline" size={18} color={colors.error} />
              </Pressable>
            </View>
          ))}
          <Button size="sm" variant="outline" onPress={addRow}>Ajouter une zone</Button>
        </View>
      ) : spaces.length === 0 ? (
        <EmptyState text="Aucune zone" />
      ) : (
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: spacing.md }}>
          {spaces.map((s) => (
            <View key={s.id} style={{ minWidth: 200, flexGrow: 1, borderWidth: 1, borderColor: colors.gray[100], borderRadius: radius.md, padding: spacing.lg, gap: 6 }}>
              <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
                <Text style={{ fontSize: 14, fontWeight: '600', color: colors.gray[900] }}>{s.name}</Text>
                <Badge variant={s.isActive === false ? 'error' : (s.parcelCount ?? 0) > 0 ? 'success' : 'default'}>
                  {s.isActive === false ? 'Desactivee' : (s.parcelCount ?? 0) > 0 ? `${s.parcelCount} colis` : 'Vide'}
                </Badge>
              </View>
              {!!s.description && <Text style={{ fontSize: 12, color: colors.gray[500] }}>{s.description}</Text>}
            </View>
          ))}
        </View>
      )}
    </SectionCard>
  );
}
