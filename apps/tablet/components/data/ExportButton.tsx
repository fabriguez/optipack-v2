import { useState } from 'react';
import { Text, Pressable, ActivityIndicator } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import * as FileSystem from 'expo-file-system';
import * as Sharing from 'expo-sharing';
import { colors } from '@/lib/theme/colors';
import { radius, spacing } from '@/lib/theme/spacing';
import { toast } from '@/lib/toast';

export interface ExportColumn {
  key: string;
  label: string;
}

function cellValue(row: Record<string, any>, key: string): string {
  let v = row[key];
  if (v && typeof v === 'object') {
    v = v.name ?? v.fullName ?? v.reference ?? v.code ?? JSON.stringify(v);
  }
  return String(v ?? '');
}

function toCsv(data: Record<string, any>[], columns: ExportColumn[]): string {
  const esc = (s: string) => `"${s.replace(/"/g, '""')}"`;
  const header = columns.map((c) => esc(c.label)).join(',');
  const rows = data.map((row) => columns.map((c) => esc(cellValue(row, c.key))).join(','));
  // BOM pour Excel + accents
  return '﻿' + [header, ...rows].join('\n');
}

/** Export CSV partage via la feuille de partage native (mirror web ExportButton). */
export function ExportButton({
  data,
  columns,
  fileName,
}: {
  data: Record<string, any>[];
  columns: ExportColumn[];
  fileName: string;
}) {
  const [busy, setBusy] = useState(false);

  const onExport = async () => {
    if (!data.length) {
      toast.info('Aucune donnee a exporter');
      return;
    }
    setBusy(true);
    try {
      const csv = toCsv(data, columns);
      const uri = `${FileSystem.cacheDirectory}${fileName}.csv`;
      await FileSystem.writeAsStringAsync(uri, csv, { encoding: FileSystem.EncodingType.UTF8 });
      if (await Sharing.isAvailableAsync()) {
        await Sharing.shareAsync(uri, { mimeType: 'text/csv', dialogTitle: fileName, UTI: 'public.comma-separated-values-text' });
      } else {
        toast.error('Partage indisponible sur cet appareil');
      }
    } catch {
      toast.error("Echec de l'export");
    } finally {
      setBusy(false);
    }
  };

  return (
    <Pressable
      onPress={onExport}
      disabled={busy}
      style={({ pressed }) => ({
        flexDirection: 'row',
        alignItems: 'center',
        gap: 6,
        height: 40,
        paddingHorizontal: spacing.lg,
        borderRadius: radius.md,
        borderWidth: 1,
        borderColor: colors.gray[300],
        backgroundColor: pressed ? colors.gray[50] : colors.white,
        opacity: busy ? 0.6 : 1,
      })}
    >
      {busy ? (
        <ActivityIndicator size="small" color={colors.gray[600]} />
      ) : (
        <Ionicons name="download-outline" size={16} color={colors.gray[700]} />
      )}
      <Text style={{ fontSize: 13, fontWeight: '600', color: colors.gray[700] }}>Exporter</Text>
    </Pressable>
  );
}
