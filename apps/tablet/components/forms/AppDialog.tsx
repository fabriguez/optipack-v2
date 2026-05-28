import type { ReactNode } from 'react';
import { Modal, View, Text, Pressable, ScrollView } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { colors } from '@/lib/theme/colors';
import { radius, spacing } from '@/lib/theme/spacing';

interface AppDialogProps {
  open: boolean;
  onClose: () => void;
  title: string;
  description?: string;
  children: ReactNode;
  footer?: ReactNode;
  width?: number;
}

export function AppDialog({
  open,
  onClose,
  title,
  description,
  children,
  footer,
  width = 720,
}: AppDialogProps) {
  return (
    <Modal visible={open} transparent animationType="fade" onRequestClose={onClose}>
      <View
        style={{
          flex: 1,
          backgroundColor: 'rgba(0,0,0,0.45)',
          alignItems: 'center',
          justifyContent: 'center',
          padding: 24,
        }}
      >
        <View
          style={{
            width,
            maxWidth: '100%',
            maxHeight: '90%',
            backgroundColor: colors.white,
            borderRadius: radius.lg,
            overflow: 'hidden',
            shadowColor: '#000',
            shadowOpacity: 0.2,
            shadowRadius: 24,
            elevation: 8,
          }}
        >
          <View
            style={{
              flexDirection: 'row',
              alignItems: 'flex-start',
              padding: spacing.xl,
              borderBottomWidth: 1,
              borderBottomColor: colors.gray[200],
            }}
          >
            <View style={{ flex: 1 }}>
              <Text style={{ fontSize: 18, fontWeight: '600', color: colors.gray[900] }}>{title}</Text>
              {description && (
                <Text style={{ fontSize: 13, color: colors.gray[500], marginTop: 4 }}>{description}</Text>
              )}
            </View>
            <Pressable onPress={onClose} hitSlop={10} style={{ padding: 4 }}>
              <Ionicons name="close" size={22} color={colors.gray[500]} />
            </Pressable>
          </View>
          <ScrollView contentContainerStyle={{ padding: spacing.xl, gap: spacing.lg }}>
            {children}
          </ScrollView>
          {footer && (
            <View
              style={{
                flexDirection: 'row',
                justifyContent: 'flex-end',
                gap: spacing.md,
                padding: spacing.xl,
                borderTopWidth: 1,
                borderTopColor: colors.gray[200],
                backgroundColor: colors.gray[50],
              }}
            >
              {footer}
            </View>
          )}
        </View>
      </View>
    </Modal>
  );
}
