'use client';

import { useState, useCallback, useRef } from 'react';
import { Upload, FileText, CheckCircle, AlertTriangle, Download } from 'lucide-react';
import { AppDialog } from '@/components/ui/AppDialog';
import { AppButton } from '@/components/ui/AppButton';
import { AppBadge } from '@/components/ui/AppBadge';
import { toast } from 'sonner';

interface CsvImportDialogProps {
  open: boolean;
  onClose: () => void;
  onImport: (rows: Record<string, string>[]) => Promise<void>;
  title: string;
  requiredColumns: string[];
  /** Libelles humains pour chaque colonne (utilise dans le modele et la preview). */
  columnLabels?: Record<string, string>;
  /** Nom du fichier modele (sans extension). Defaut = title slugifie. */
  templateFileName?: string;
  /** Lignes d'exemple pour le modele (optionnel). */
  templateExamples?: Record<string, string>[];
}

type Step = 'upload' | 'preview' | 'importing' | 'done';

/**
 * Dialog d'import de donnees tabulaires. Accepte XLSX (.xlsx, .xls) ET CSV (.csv,
 * .txt) -- le parsing detecte le format via le mimetype / extension.
 *
 * Note : le composant garde son nom historique CsvImportDialog pour ne pas
 * casser les imports existants. La verite metier est qu'il importe du XLSX en
 * priorite.
 */
export function CsvImportDialog({
  open,
  onClose,
  onImport,
  title,
  requiredColumns,
  columnLabels = {},
  templateFileName,
  templateExamples,
}: CsvImportDialogProps) {
  const [step, setStep] = useState<Step>('upload');
  const [rows, setRows] = useState<Record<string, string>[]>([]);
  const [headers, setHeaders] = useState<string[]>([]);
  const [errors, setErrors] = useState<string[]>([]);
  const [fileName, setFileName] = useState('');
  const [downloadingTemplate, setDownloadingTemplate] = useState(false);
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

  const validateAndStore = (rawHeaders: string[], parsedRows: Record<string, string>[]) => {
    setHeaders(rawHeaders);
    const missing = requiredColumns.filter((col) => !rawHeaders.includes(col));
    if (missing.length > 0) {
      setErrors([`Colonnes manquantes : ${missing.join(', ')}`]);
      setRows([]);
      setStep('preview');
      return;
    }
    setErrors([]);
    setRows(parsedRows);
    setStep('preview');
  };

  const parseCsvText = useCallback(
    (text: string) => {
      const lines = text.trim().split(/\r?\n/);
      if (lines.length < 2) {
        setErrors(['Le fichier doit contenir au moins un en-tete et une ligne de donnees']);
        setStep('preview');
        return;
      }
      const separator = lines[0].includes(';') ? ';' : ',';
      const csvHeaders = lines[0].split(separator).map((h) => h.trim().replace(/"/g, ''));

      const parsed: Record<string, string>[] = [];
      const parseErrors: string[] = [];

      for (let i = 1; i < lines.length; i++) {
        if (!lines[i].trim()) continue;
        const values = lines[i].split(separator).map((v) => v.trim().replace(/"/g, ''));
        if (values.length !== csvHeaders.length) {
          parseErrors.push(
            `Ligne ${i + 1} : nombre de colonnes incorrect (${values.length} au lieu de ${csvHeaders.length})`,
          );
          continue;
        }
        const row: Record<string, string> = {};
        csvHeaders.forEach((h, j) => {
          row[h] = values[j];
        });
        parsed.push(row);
      }

      setErrors(parseErrors);
      validateAndStore(csvHeaders, parsed);
    },
    [requiredColumns],
  );

  /** Lit un .xlsx via ExcelJS (chargement dynamique pour ne pas peser sur le bundle initial). */
  const parseXlsxBuffer = useCallback(
    async (buffer: ArrayBuffer) => {
      try {
        const ExcelJS = (await import('exceljs')).default;
        const wb = new ExcelJS.Workbook();
        await wb.xlsx.load(buffer);
        const ws = wb.worksheets[0];
        if (!ws) {
          setErrors(['Fichier vide : aucune feuille trouvee.']);
          setStep('preview');
          return;
        }
        const xHeaders: string[] = [];
        const headerRow = ws.getRow(1);
        headerRow.eachCell((cell, col) => {
          xHeaders[col - 1] = String(cell.value ?? '').trim();
        });
        // Compact headers (skip undefined indexes)
        const cleanHeaders = xHeaders.filter((h) => h && h.length > 0);

        const parsed: Record<string, string>[] = [];
        for (let r = 2; r <= ws.rowCount; r++) {
          const row = ws.getRow(r);
          if (!row.hasValues) continue;
          const obj: Record<string, string> = {};
          cleanHeaders.forEach((h, idx) => {
            const cell = row.getCell(idx + 1);
            const v = cell.value;
            if (v == null) {
              obj[h] = '';
            } else if (typeof v === 'object' && 'text' in (v as any)) {
              // RichText / Hyperlink
              obj[h] = String((v as any).text ?? '');
            } else if (v instanceof Date) {
              obj[h] = v.toISOString().slice(0, 10);
            } else {
              obj[h] = String(v);
            }
          });
          // Skip purely empty rows
          if (Object.values(obj).some((s) => s && s.trim().length > 0)) {
            parsed.push(obj);
          }
        }
        validateAndStore(cleanHeaders, parsed);
      } catch (e: any) {
        setErrors([`Erreur de lecture XLSX : ${e?.message ?? 'fichier illisible'}`]);
        setStep('preview');
      }
    },
    [requiredColumns],
  );

  const handleFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setFileName(file.name);

    const lower = file.name.toLowerCase();
    const isXlsx =
      file.type === 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' ||
      file.type === 'application/vnd.ms-excel' ||
      lower.endsWith('.xlsx') ||
      lower.endsWith('.xls');

    const reader = new FileReader();
    if (isXlsx) {
      reader.onload = (ev) => {
        const buf = ev.target?.result;
        if (buf instanceof ArrayBuffer) parseXlsxBuffer(buf);
      };
      reader.readAsArrayBuffer(file);
    } else {
      // CSV / TXT (compat retro)
      reader.onload = (ev) => parseCsvText(ev.target?.result as string);
      reader.readAsText(file);
    }
    // Reset l'input pour pouvoir re-uploader le meme fichier
    e.target.value = '';
  };

  const handleImport = async () => {
    setStep('importing');
    try {
      await onImport(rows);
      setStep('done');
    } catch (err: any) {
      setErrors([err?.message || "Erreur lors de l'import"]);
      setStep('preview');
    }
  };

  const downloadTemplate = async () => {
    setDownloadingTemplate(true);
    try {
      const ExcelJS = (await import('exceljs')).default;
      const wb = new ExcelJS.Workbook();
      wb.creator = 'Export';
      wb.created = new Date();
      const sheetName = (templateFileName ?? title).slice(0, 31).replace(/[\\/?*[\]:]/g, '_');
      const ws = wb.addWorksheet(sheetName);

      // En-tetes : on prend les requiredColumns (ordre garanti) + leurs labels.
      ws.columns = requiredColumns.map((key) => ({
        header: key,
        key,
        width: Math.max(14, Math.min(40, (columnLabels[key] ?? key).length + 6)),
      }));
      // Style de l'en-tete + ligne 2 explicative (libelle humain).
      ws.getRow(1).font = { bold: true };
      ws.getRow(1).fill = {
        type: 'pattern',
        pattern: 'solid',
        fgColor: { argb: 'FFE8F5E9' },
      };
      ws.getRow(1).alignment = { vertical: 'middle' };

      // Ligne 2 : description (libelles) en italique gris, sera retiree par
      // l'utilisateur avant import (ou ignoree car colonne `key` non requise).
      const desc = ws.addRow(
        Object.fromEntries(requiredColumns.map((k) => [k, columnLabels[k] ?? k])),
      );
      desc.font = { italic: true, color: { argb: 'FF9E9E9E' } };
      desc.eachCell((cell) => {
        cell.alignment = { vertical: 'middle' };
      });

      // Lignes d'exemple (si fournies) sinon une ligne vide pour la saisie.
      if (templateExamples && templateExamples.length > 0) {
        for (const ex of templateExamples) {
          ws.addRow(Object.fromEntries(requiredColumns.map((k) => [k, ex[k] ?? ''])));
        }
      } else {
        ws.addRow(Object.fromEntries(requiredColumns.map((k) => [k, ''])));
      }

      // Auto-filter sur l'en-tete.
      ws.autoFilter = {
        from: { row: 1, column: 1 },
        to: { row: 1, column: requiredColumns.length },
      };

      const buffer = await wb.xlsx.writeBuffer();
      const blob = new Blob([buffer], {
        type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      const slug = (templateFileName ?? title)
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/(^-|-$)/g, '');
      a.download = `modele-${slug || 'import'}.xlsx`;
      a.click();
      URL.revokeObjectURL(url);
    } catch (e: any) {
      toast.error(e?.message ?? 'Echec de la generation du modele');
    } finally {
      setDownloadingTemplate(false);
    }
  };

  return (
    <AppDialog open={open} onClose={handleClose} title={title} size="xl">
      {step === 'upload' && (
        <div className="py-8 space-y-4">
          {/* Bouton modele : telecharge un XLSX pre-rempli avec les en-tetes
              attendues + une ligne d'exemple. */}
          <div className="flex items-center justify-end">
            <AppButton variant="outline" size="sm" onClick={downloadTemplate} loading={downloadingTemplate}>
              <Download className="h-3.5 w-3.5" />
              Telecharger le modele
            </AppButton>
          </div>

          <div
            onClick={() => fileRef.current?.click()}
            className="mx-auto flex max-w-md cursor-pointer flex-col items-center rounded-2xl border-2 border-dashed border-gray-300 p-10 transition-colors hover:border-primary-400 hover:bg-primary-50/30"
          >
            <Upload className="h-10 w-10 text-gray-400 mb-3" />
            <p className="text-sm font-medium text-gray-700">Cliquer pour choisir un fichier</p>
            <p className="text-xs text-gray-400 mt-1">Excel (.xlsx, .xls) ou CSV (.csv)</p>
            <p className="text-xs text-gray-400 mt-3">
              Colonnes requises : {requiredColumns.map((c) => columnLabels[c] || c).join(', ')}
            </p>
          </div>
          <input
            ref={fileRef}
            type="file"
            accept=".xlsx,.xls,.csv,.txt,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,application/vnd.ms-excel,text/csv"
            onChange={handleFile}
            className="hidden"
          />
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
            <div className="mb-4 rounded-xl bg-amber-50 border border-amber-200 p-3 space-y-1">
              {errors.map((err, i) => (
                <div key={i} className="flex items-center gap-2 text-xs text-amber-700">
                  <AlertTriangle className="h-3 w-3 shrink-0" />
                  <span>{err}</span>
                </div>
              ))}
            </div>
          )}

          {rows.length > 0 && (
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
          )}

          <div className="flex justify-end gap-3 mt-4 pt-4 border-t border-gray-100">
            <AppButton variant="ghost" onClick={handleClose}>Annuler</AppButton>
            <AppButton onClick={handleImport} disabled={rows.length === 0 || errors.length > 0}>
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
          <p className="text-sm text-gray-500 mt-1">L&apos;import a ete effectue avec succes.</p>
          <AppButton className="mt-6" onClick={handleClose}>Fermer</AppButton>
        </div>
      )}
    </AppDialog>
  );
}
