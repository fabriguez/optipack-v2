import { useEffect, useState } from 'react';
import { View, Text, Pressable } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { AppDialog } from '@/components/forms/AppDialog';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { colors } from '@/lib/theme/colors';
import { radius, spacing } from '@/lib/theme/spacing';

export interface FilterField {
  key: string;
  label: string;
  type?: 'text';
  placeholder?: string;
}

interface FilterDialogProps {
  fields: FilterField[];
  values: Record<string, string>;
  onApply: (values: Record<string, string>) => void;
  onClear: () => void;
}

/** Bouton + dialog de filtres (mirror web FilterDialog). */
export function FilterDialog({ fields, values, onApply, onClear }: FilterDialogProps) {
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState<Record<string, string>>(values);

  useEffect(() => {
    if (open) setDraft(values);
  }, [open, values]);

  const activeCount = Object.values(values).filter(Boolean).length;

  return (
    <>
      <Pressable
        onPress={() => setOpen(true)}
        style={({ pressed }) => ({
          flexDirection: 'row',
          alignItems: 'center',
          gap: 6,
          height: 40,
          paddingHorizontal: spacing.lg,
          borderRadius: radius.md,
          borderWidth: 1,
          borderColor: activeCount > 0 ? colors.primary[300] : colors.gray[300],
          backgroundColor: pressed ? colors.gray[50] : activeCount > 0 ? colors.primary[50] : colors.white,
        })}
      >
        <Ionicons name="filter" size={16} color={activeCount > 0 ? colors.primary[600] : colors.gray[700]} />
        <Text style={{ fontSize: 13, fontWeight: '600', color: activeCount > 0 ? colors.primary[700] : colors.gray[700] }}>
          Filtres
        </Text>
        {activeCount > 0 && (
          <View
            style={{
              minWidth: 18,
              height: 18,
              borderRadius: 9,
              paddingHorizontal: 4,
              backgroundColor: colors.primary[500],
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            <Text style={{ fontSize: 11, fontWeight: '700', color: colors.white }}>{activeCount}</Text>
          </View>
        )}
      </Pressable>

      <AppDialog
        open={open}
        onClose={() => setOpen(false)}
        title="Filtres"
        width={440}
        footer={
          <>
            <Button
              variant="ghost"
              onPress={() => {
                onClear();
                setOpen(false);
              }}
            >
              Effacer
            </Button>
            <Button
              onPress={() => {
                onApply(draft);
                setOpen(false);
              }}
            >
              Appliquer
            </Button>
          </>
        }
      >
        {fields.map((f) => (
          <Input
            key={f.key}
            label={f.label}
            value={draft[f.key] ?? ''}
            onChangeText={(v) => setDraft((prev) => ({ ...prev, [f.key]: v }))}
            placeholder={f.placeholder ?? f.label}
          />
        ))}
      </AppDialog>
    </>
  );
}
