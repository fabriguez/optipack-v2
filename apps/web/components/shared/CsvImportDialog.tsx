'use client';

import { useState, useCallback, useRef } from 'react';
import { Upload, FileText, CheckCircle, AlertTriangle, X } from 'lucide-react';
import { AppDialog } from '@/components/ui/AppDialog';
import { AppButton } from '@/components/ui/AppButton';
import { AppBadge } from '@/components/ui/AppBadge';

interface CsvImportDialogProps {
  open: boolean;
  onClose: () => void;
  onImport: (rows: Record<string, string>[]) => Promise<void>;
  title: string;
  requiredColumns: string[];
  columnLabels?: Record<string, string>;
}

type Step = 'upload' | 'preview' | 'importing' | 'done';

export function CsvImportDialog({
  open,
  onClose,
  onImport,
  title,
  requiredColumns,
  columnLabels = {},
}: CsvImportDialogProps) {
  const [step, setStep] = useState<Step>('upload');
  const [rows, setRows] = useState<Record<string, string>[]>([]);
  const [headers, setHeaders] = useState<string[]>([]);
  const [errors, setErrors] = useState<string[]>([]);
  const [fileName, setFileName] = useState('');
  const fileRef = useRef<HTMLInputElement>(null);

  const reset = () => {
    setStep('upload');
    setRows([]);
    setHeaders([]);
    setErrors([]);
    setFileName('');
  };

  const handleClose = () => {
    reset();
    onClose();
  };

  const parseCsv = useCallback(
    (text: string) => {
      const lines = text.trim().split('\n');
      if (lines.length < 2) {
        setErrors(['Le fichier doit contenir au moins un en-tete et une ligne de donnees']);
        return;
      }

      const separator = lines[0].includes(';') ? ';' : ',';
      const csvHeaders = lines[0].split(separator).map((h) => h.trim().replace(/"/g, ''));
      setHeaders(csvHeaders);

      // Validate required columns
      const missing = requiredColumns.filter((col) => !csvHeaders.includes(col));
      if (missing.length > 0) {
        setErrors([`Colonnes manquantes : ${missing.join(', ')}`]);
        return;
      }

      const parsed: Record<string, string>[] = [];
      const parseErrors: string[] = [];

      for (let i = 1; i < lines.length; i++) {
        const values = lines[i].split(separator).map((v) => v.trim().replace(/"/g, ''));
        if (values.length !== csvHeaders.length) {
          parseErrors.push(`Ligne ${i + 1} : nombre de colonnes incorrect (${values.length} au lieu de ${csvHeaders.length})`);
          continue;
        }
        const row: Record<string, string> = {};
        csvHeaders.forEach((h, j) => {
          row[h] = values[j];
        });
        parsed.push(row);
      }

      setErrors(parseErrors);
      setRows(parsed);
      setStep('preview');
    },
    [requiredColumns],
  );

  const handleFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setFileName(file.name);
    const reader = new FileReader();
    reader.onload = (ev) => parseCsv(ev.target?.result as string);
    reader.readAsText(file);
  };

  const handleImport = async () => {
    setStep('importing');
    try {
      await onImport(rows);
      setStep('done');
    } catch {
      setErrors(['Erreur lors de l\'import']);
      setStep('preview');
    }
  };

  return (
    <AppDialog open={open} onClose={handleClose} title={title} size="xl">
      {step === 'upload' && (
        <div className="py-8">
          <div
            onClick={() => fileRef.current?.click()}
            className="mx-auto flex max-w-md cursor-pointer flex-col items-center rounded-2xl border-2 border-dashed border-gray-300 p-10 transition-colors hover:border-primary-400 hover:bg-primary-50/30"
          >
            <Upload className="h-10 w-10 text-gray-400 mb-3" />
            <p className="text-sm font-medium text-gray-700">Cliquer pour choisir un fichier CSV</p>
            <p className="text-xs text-gray-400 mt-1">ou glisser-deposer ici</p>
            <p className="text-xs text-gray-400 mt-3">
              Colonnes requises : {requiredColumns.map((c) => columnLabels[c] || c).join(', ')}
            </p>
          </div>
          <input ref={fileRef} type="file" accept=".csv,.txt" onChange={handleFile} className="hidden" />
        </div>
      )}

      {step === 'preview' && (
        <div>
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-2">
              <FileText className="h-4 w-4 text-primary-600" />
              <span className="text-sm font-medium">{fileName}</span>
              <AppBadge variant="success">{rows.length} lignes</AppBadge>
            </div>
            <AppButton variant="ghost" size="sm" onClick={reset}>Changer de fichier</AppButton>
          </div>

          {errors.length > 0 && (
            <div className="mb-4 rounded-xl bg-amber-50 border border-amber-200 p-3">
              {errors.map((err, i) => (
                <div key={i} className="flex items-center gap-2 text-xs text-amber-700">
                  <AlertTriangle className="h-3 w-3 shrink-0" />
                  <span>{err}</span>
                </div>
              ))}
            </div>
          )}

          <div className="max-h-72 overflow-auto rounded-xl border border-gray-200">
            <table className="w-full text-xs">
              <thead>
                <tr className="bg-gray-50">
                  <th className="px-3 py-2 text-left font-semibold text-gray-500">#</th>
                  {headers.map((h) => (
                    <th key={h} className="px-3 py-2 text-left font-semibold text-gray-500">
                      {columnLabels[h] || h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {rows.slice(0, 50).map((row, i) => (
                  <tr key={i} className="hover:bg-gray-50">
                    <td className="px-3 py-1.5 text-gray-400">{i + 1}</td>
                    {headers.map((h) => (
                      <td key={h} className="px-3 py-1.5 text-gray-700">{row[h]}</td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
            {rows.length > 50 && (
              <p className="px-3 py-2 text-xs text-gray-400 text-center bg-gray-50">
                ... et {rows.length - 50} lignes de plus
              </p>
            )}
          </div>

          <div className="flex justify-end gap-3 mt-4 pt-4 border-t border-gray-100">
            <AppButton variant="ghost" onClick={handleClose}>Annuler</AppButton>
            <AppButton onClick={handleImport} disabled={rows.length === 0}>
              Importer {rows.length} lignes
            </AppButton>
          </div>
        </div>
      )}

      {step === 'importing' && (
        <div className="flex flex-col items-center py-12">
          <div className="h-10 w-10 animate-spin rounded-full border-4 border-gray-200 border-t-primary-500" />
          <p className="mt-4 text-sm text-gray-500">Import en cours...</p>
        </div>
      )}

      {step === 'done' && (
        <div className="flex flex-col items-center py-12">
          <CheckCircle className="h-12 w-12 text-primary-500" />
          <p className="mt-3 text-lg font-semibold text-gray-900">{rows.length} lignes importees</p>
          <p className="text-sm text-gray-500 mt-1">L'import a ete effectue avec succes.</p>
          <AppButton className="mt-6" onClick={handleClose}>Fermer</AppButton>
        </div>
      )}
    </AppDialog>
  );
}
