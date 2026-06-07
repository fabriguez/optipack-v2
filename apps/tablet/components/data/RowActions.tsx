import { useState, type ReactNode } from 'react';
import { View, Text, Pressable, Modal } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { colors } from '@/lib/theme/colors';
import { radius, spacing } from '@/lib/theme/spacing';

export interface RowAction {
  label: string;
  icon?: ReactNode;
  onPress: () => void;
  variant?: 'default' | 'destructive';
  disabled?: boolean;
}

/** Menu d'actions de ligne (mirror web RowActions) via action-sheet. */
export function RowActions({ actions }: { actions: RowAction[] }) {
  const [open, setOpen] = useState(false);

  return (
    <View>
      <Pressable
        onPress={() => setOpen(true)}
        hitSlop={8}
        style={({ pressed }) => ({
          width: 32,
          height: 32,
          borderRadius: radius.sm,
          alignItems: 'center',
          justifyContent: 'center',
          backgroundColor: pressed ? colors.gray[100] : 'transparent',
        })}
      >
        <Ionicons name="ellipsis-horizontal" size={18} color={colors.gray[500]} />
      </Pressable>

      <Modal visible={open} transparent animationType="fade" onRequestClose={() => setOpen(false)}>
        <Pressable
          style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.35)', justifyContent: 'flex-end' }}
          onPress={() => setOpen(false)}
        >
          <Pressable
            style={{
              backgroundColor: colors.white,
              borderTopLeftRadius: radius.xl,
              borderTopRightRadius: radius.xl,
              padding: spacing.lg,
              paddingBottom: spacing['3xl'],
              gap: 4,
            }}
          >
            {actions.map((a, i) => (
              <Pressable
                key={i}
                disabled={a.disabled}
                onPress={() => {
                  setOpen(false);
                  a.onPress();
                }}
                style={({ pressed }) => ({
                  flexDirection: 'row',
                  alignItems: 'center',
                  gap: spacing.md,
                  paddingVertical: 14,
                  paddingHorizontal: spacing.lg,
                  borderRadius: radius.md,
                  opacity: a.disabled ? 0.4 : 1,
                  backgroundColor: pressed ? colors.gray[50] : 'transparent',
                })}
              >
                {a.icon}
                <Text
                  style={{
                    fontSize: 15,
                    fontWeight: '500',
                    color: a.variant === 'destructive' ? colors.error : colors.gray[800],
                  }}
                >
                  {a.label}
                </Text>
              </Pressable>
            ))}
          </Pressable>
        </Pressable>
      </Modal>
    </View>
  );
}
