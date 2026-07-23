'use client';

import { useState } from 'react';
import { Download } from 'lucide-react';
import { AppButton } from '@/components/ui/AppButton';
import { Can } from '@/lib/components/Can';
import { apiClient } from '@/lib/api/client';
import { toast } from 'sonner';

interface XlsxExportButtonProps {
  /** Endpoint sous /exports (ex: "parcels", "employees", "clients", "agencies") */
  endpoint: string;
  /** Nom de fichier (sans extension), defaut = endpoint */
  fileName?: string;
  /** Query params additionnels (ex: { agencyId }) */
  params?: Record<string, string | number | boolean | undefined>;
  label?: string;
}

/**
 * Bouton qui declenche un download XLSX depuis l'API. L'XLSX contient toutes
 * les colonnes (y compris les images, embarquees dans les cellules image).
 */
export function XlsxExportButton({ endpoint, fileName, params, label }: XlsxExportButtonProps) {
  const [busy, setBusy] = useState(false);

  const onClick = async () => {
    setBusy(true);
    try {
      const res = await apiClient.get(`/exports/${endpoint}`, {
        params,
        responseType: 'blob',
      });
      const blob = new Blob([res.data], {
        type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      const date = new Date().toISOString().slice(0, 10);
      a.download = `${fileName ?? endpoint}-${date}.xlsx`;
      a.click();
      URL.revokeObjectURL(url);
    } catch (e: any) {
      toast.error(e?.response?.data?.message || "Echec de l'export");
    } finally {
      setBusy(false);
    }
  };

  // L'API /exports impose deja report.export ; on aligne l'UI pour ne pas
  // afficher un bouton qui repondrait 403.
  return (
    <Can permission="report.export">
      <AppButton variant="outline" size="sm" onClick={onClick} loading={busy}>
        <Download className="h-3.5 w-3.5" />
        {label ?? 'Exporter (XLSX)'}
      </AppButton>
    </Can>
  );
}
