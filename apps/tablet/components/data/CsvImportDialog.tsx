import { useState } from 'react';
import { View, Text, Pressable, ActivityIndicator } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import * as DocumentPicker from 'expo-document-picker';
import * as FileSystem from 'expo-file-system';
import { AppDialog } from '@/components/forms/AppDialog';
import { Button } from '@/components/ui/Button';
import { toast } from '@/lib/toast';
import { colors } from '@/lib/theme/colors';
import { radius, spacing } from '@/lib/theme/spacing';

interface CsvImportDialogProps {
  open: boolean;
  onClose: () => void;
  onImport: (rows: Record<string, string>[]) => Promise<void>;
  title?: string;
  requiredColumns?: string[];
  columnLabels?: Record<string, string>;
}

/** Parse CSV simple (gere les guillemets et virgules echappees). */
function parseCsv(text: string): Record<string, string>[] {
  const clean = text.replace(/^﻿/, '');
  const lines = clean.split(/\r?\n/).filter((l) => l.trim().length > 0);
  if (lines.length < 2) return [];
  const parseLine = (line: string): string[] => {
    const out: string[] = [];
    let cur = '';
    let inQuotes = false;
    for (let i = 0; i < line.length; i++) {
      const c = line[i];
      if (inQuotes) {
        if (c === '"' && line[i + 1] === '"') { cur += '"'; i++; }
        else if (c === '"') inQuotes = false;
        else cur += c;
      } else if (c === '"') inQuotes = true;
      else if (c === ',') { out.push(cur); cur = ''; }
      else cur += c;
    }
    out.push(cur);
    return out.map((s) => s.trim());
  };
  const headers = parseLine(lines[0]).map((h) => h.toLowerCase());
  return lines.slice(1).map((line) => {
    const cells = parseLine(line);
    const row: Record<string, string> = {};
    headers.forEach((h, i) => { row[h] = cells[i] ?? ''; });
    return row;
  });
}

/** Import CSV via DocumentPicker (mirror web CsvImportDialog). */
export function CsvImportDialog({
  open,
  onClose,
  onImport,
  title = 'Importer un fichier CSV',
  requiredColumns = [],
  columnLabels = {},
}: CsvImportDialogProps) {
  const [busy, setBusy] = useState(false);
  const [fileName, setFileName] = useState<string | null>(null);
  const [rows, setRows] = useState<Record<string, string>[]>([]);

  const reset = () => {
    setFileName(null);
    setRows([]);
  };

  const pickFile = async () => {
    try {
      const res = await DocumentPicker.getDocumentAsync({
        type: ['text/csv', 'text/comma-separated-values', 'application/vnd.ms-excel', '*/*'],
        copyToCacheDirectory: true,
      });
      if (res.canceled || !res.assets?.[0]) return;
      const asset = res.assets[0];
      const text = await FileSystem.readAsStringAsync(asset.uri, { encoding: FileSystem.EncodingType.UTF8 });
      const parsed = parseCsv(text);
      if (parsed.length === 0) {
        toast.error('Fichier vide ou invalide');
        return;
      }
      setFileName(asset.name);
      setRows(parsed);
    } catch {
      toast.error('Impossible de lire le fichier');
    }
  };

  const handleImport = async () => {
    if (rows.length === 0) return;
    setBusy(true);
    try {
      await onImport(rows);
      reset();
      onClose();
    } catch {
      toast.error("Echec de l'import");
    } finally {
      setBusy(false);
    }
  };

  return (
    <AppDialog
      open={open}
      onClose={() => { reset(); onClose(); }}
      title={title}
      width={520}
      footer={
        <>
          <Button variant="ghost" onPress={() => { reset(); onClose(); }} disabled={busy}>
            Annuler
          </Button>
          <Button onPress={handleImport} loading={busy} disabled={rows.length === 0}>
            {rows.length > 0 ? `Importer ${rows.length}` : 'Importer'}
          </Button>
        </>
      }
    >
      {requiredColumns.length > 0 && (
        <Text style={{ fontSize: 13, color: colors.gray[500] }}>
          Colonnes attendues : {requiredColumns.map((c) => columnLabels[c] ?? c).join(', ')}
        </Text>
      )}

      <Pressable
        onPress={pickFile}
        style={({ pressed }) => ({
          borderWidth: 2,
          borderStyle: 'dashed',
          borderColor: pressed ? colors.primary[400] : colors.gray[300],
          borderRadius: radius.lg,
          paddingVertical: spacing['3xl'],
          alignItems: 'center',
          gap: spacing.md,
          backgroundColor: colors.gray[50],
        })}
      >
        <Ionicons name="cloud-upload-outline" size={36} color={colors.primary[500]} />
        <Text style={{ fontSize: 14, fontWeight: '600', color: colors.gray[700] }}>
          {fileName ?? 'Choisir un fichier CSV'}
        </Text>
        {fileName && (
          <Text style={{ fontSize: 12, color: colors.gray[400] }}>{rows.length} lignes detectees</Text>
        )}
      </Pressable>

      {busy && (
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.sm }}>
          <ActivityIndicator size="small" color={colors.primary[500]} />
          <Text style={{ fontSize: 13, color: colors.gray[500] }}>Import en cours...</Text>
        </View>
      )}
    </AppDialog>
  );
}
