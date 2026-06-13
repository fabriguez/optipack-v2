import { View, Text, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import type { ReactNode } from 'react';

export interface MaskedRef {
  id?: string | null;
  masked: true;
}

export function isMasked(value: unknown): value is MaskedRef {
  return (
    typeof value === 'object' &&
    value !== null &&
    (value as MaskedRef).masked === true
  );
}

interface MaskedValueProps {
  value: unknown;
  children?: (value: NonNullable<unknown>) => ReactNode;
  label?: string;
}

export function MaskedValue({ value, children, label = 'Acces restreint' }: MaskedValueProps) {
  if (isMasked(value)) {
    return (
      <View style={styles.row}>
        <Ionicons name="lock-closed-outline" size={12} color="#9ca3af" />
        <Text style={styles.label}>{label}</Text>
      </View>
    );
  }

  if (value == null) return <Text style={styles.empty}>—</Text>;

  return <>{children ? children(value) : null}</>;
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  label: {
    fontSize: 12,
    color: '#9ca3af',
  },
  empty: {
    fontSize: 12,
    color: '#9ca3af',
  },
});
