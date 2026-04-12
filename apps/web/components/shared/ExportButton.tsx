'use client';

import { useState } from 'react';
import { Download } from 'lucide-react';
import { AppButton } from '@/components/ui/AppButton';

interface ExportButtonProps {
  data: Record<string, any>[];
  columns: { key: string; label: string }[];
  fileName: string;
}

export function ExportButton({ data, columns, fileName }: ExportButtonProps) {
  const [exporting, setExporting] = useState(false);

  const exportCsv = () => {
    setExporting(true);

    const header = columns.map((c) => c.label).join(',');
    const rows = data.map((row) =>
      columns
        .map((c) => {
          let val = row[c.key];
          // Handle nested objects
          if (val && typeof val === 'object') {
            val = val.name || val.fullName || val.reference || JSON.stringify(val);
          }
          // Escape CSV
          val = String(val ?? '').replace(/"/g, '""');
          return `"${val}"`;
        })
        .join(','),
    );

    const csv = [header, ...rows].join('\n');
    const blob = new Blob(['\ufeff' + csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${fileName}-${new Date().toISOString().split('T')[0]}.csv`;
    a.click();
    URL.revokeObjectURL(url);

    setExporting(false);
  };

  return (
    <AppButton variant="outline" size="sm" onClick={exportCsv} loading={exporting}>
      <Download className="h-3.5 w-3.5" />
      Exporter
    </AppButton>
  );
}
