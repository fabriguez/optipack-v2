'use client';

import { useState } from 'react';
import { Download } from 'lucide-react';
import { AppButton } from '@/components/ui/AppButton';
import { toast } from 'sonner';

interface ExportButtonProps {
  data: Record<string, any>[];
  columns: { key: string; label: string }[];
  fileName: string;
  /** Nom de l'onglet du classeur (defaut = fileName tronque a 31 caracteres). */
  sheetName?: string;
}

/**
 * Bouton d'export XLSX cote client. Utilise ExcelJS en import dynamique pour
 * ne pas alourdir le bundle initial (la lib ne se charge qu'au premier clic).
 *
 * Compatible avec les anciens appels qui produisaient un CSV : meme API
 * (data + columns + fileName).
 */
export function ExportButton({ data, columns, fileName, sheetName }: ExportButtonProps) {
  const [exporting, setExporting] = useState(false);

  const exportXlsx = async () => {
    setExporting(true);
    try {
      const ExcelJS = (await import('exceljs')).default;
      const workbook = new ExcelJS.Workbook();
      workbook.creator = 'Export';
      workbook.created = new Date();
      // Excel limite les noms d'onglet a 31 caracteres et interdit certains symboles.
      const safeSheetName = (sheetName ?? fileName)
        .slice(0, 31)
        .replace(/[\\/?*[\]:]/g, '_');
      const ws = workbook.addWorksheet(safeSheetName);

      // En-tetes (ligne 1) + style.
      ws.columns = columns.map((c) => ({
        header: c.label,
        key: c.key,
        width: Math.max(12, Math.min(40, c.label.length + 4)),
      }));
      ws.getRow(1).font = { bold: true };
      ws.getRow(1).fill = {
        type: 'pattern',
        pattern: 'solid',
        fgColor: { argb: 'FFE8F5E9' }, // primary-50 (vert clair)
      };
      ws.getRow(1).alignment = { vertical: 'middle' };

      for (const row of data) {
        const flat: Record<string, any> = {};
        for (const c of columns) {
          let val = row[c.key];
          if (val && typeof val === 'object') {
            // Aplatissage : nom/fullName/reference si dispo, sinon JSON.
            val = val.name ?? val.fullName ?? val.reference ?? JSON.stringify(val);
          }
          flat[c.key] = val ?? '';
        }
        ws.addRow(flat);
      }

      // Auto-filter sur l'en-tete.
      ws.autoFilter = {
        from: { row: 1, column: 1 },
        to: { row: 1, column: columns.length },
      };

      const buffer = await workbook.xlsx.writeBuffer();
      const blob = new Blob([buffer], {
        type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `${fileName}-${new Date().toISOString().split('T')[0]}.xlsx`;
      a.click();
      URL.revokeObjectURL(url);
    } catch (err: any) {
      toast.error(err?.message || "Echec de l'export");
    } finally {
      setExporting(false);
    }
  };

  return (
    <AppButton variant="outline" size="sm" onClick={exportXlsx} loading={exporting}>
      <Download className="h-3.5 w-3.5" />
      Exporter
    </AppButton>
  );
}
