'use client';

import { useRef, useState } from 'react';
import { Upload, FileSpreadsheet, CheckCircle, AlertTriangle } from 'lucide-react';
import { AppDialog } from '@/components/ui/AppDialog';
import { AppButton } from '@/components/ui/AppButton';
import { AppBadge } from '@/components/ui/AppBadge';
import { apiClient } from '@/lib/api/client';
import { toast } from 'sonner';

interface XlsxImportDialogProps {
  open: boolean;
  onClose: () => void;
  /** Endpoint sous /imports (ex: "employees", "agencies/<agencyId>/employees") */
  endpoint: string;
  title: string;
  hint?: string;
  /** Appele apres import reussi (refresh listing) */
  onDone?: () => void;
}

interface ImportSummary {
  imported: number;
  skipped: number;
  errors: { row: number; message: string }[];
}

/**
 * Dialog d'import XLSX avec images embarquees. Envoie le fichier en multipart
 * a l'endpoint indique. L'API gere l'extraction + l'upload des images.
 */
export function XlsxImportDialog({ open, onClose, endpoint, title, hint, onDone }: XlsxImportDialogProps) {
  const [step, setStep] = useState<'upload' | 'importing' | 'done'>('upload');
  const [summary, setSummary] = useState<ImportSummary | null>(null);
  const [fileName, setFileName] = useState('');
  const fileRef = useRef<HTMLInputElement>(null);

  const reset = () => {
    setStep('upload');
    setSummary(null);
    setFileName('');
  };

  const handleClose = () => {
    reset();
    onClose();
  };

  const handleFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setFileName(file.name);
    setStep('importing');
    try {
      const formData = new FormData();
      formData.append('file', file);
      const res = await apiClient.post(`/imports/${endpoint}`, formData, {
        headers: { 'Content-Type': 'multipart/form-data' },
      });
      setSummary(res.data?.data as ImportSummary);
      setStep('done');
      if (onDone) onDone();
    } catch (e: any) {
      toast.error(e?.response?.data?.message || "Echec de l'import");
      setStep('upload');
    } finally {
      e.target.value = '';
    }
  };

  return (
    <AppDialog open={open} onClose={handleClose} title={title} size="lg">
      {step === 'upload' && (
        <div className="py-6">
          <div
            onClick={() => fileRef.current?.click()}
            className="mx-auto flex max-w-md cursor-pointer flex-col items-center rounded-2xl border-2 border-dashed border-gray-300 p-10 transition-colors hover:border-primary-400 hover:bg-primary-50/30"
          >
            <Upload className="h-10 w-10 text-gray-400 mb-3" />
            <p className="text-sm font-medium text-gray-700">Cliquer pour choisir un fichier XLSX</p>
            <p className="text-xs text-gray-400 mt-1">avec images embarquees</p>
            {hint && <p className="text-xs text-gray-400 mt-3 text-center max-w-xs">{hint}</p>}
          </div>
          <input ref={fileRef} type="file" accept=".xlsx" onChange={handleFile} className="hidden" />
        </div>
      )}

      {step === 'importing' && (
        <div className="flex flex-col items-center py-12">
          <div className="h-10 w-10 animate-spin rounded-full border-4 border-gray-200 border-t-primary-500" />
          <p className="mt-4 text-sm text-gray-500">Import en cours... ({fileName})</p>
        </div>
      )}

      {step === 'done' && summary && (
        <div className="py-6">
          <div className="flex flex-col items-center">
            <CheckCircle className="h-12 w-12 text-primary-500" />
            <p className="mt-3 text-lg font-semibold text-gray-900">{summary.imported} lignes importees</p>
            <div className="mt-2 flex items-center gap-2">
              <AppBadge variant="success">{summary.imported} ok</AppBadge>
              {summary.skipped > 0 && <AppBadge>{summary.skipped} ignorees</AppBadge>}
              {summary.errors.length > 0 && (
                <AppBadge variant="error">{summary.errors.length} erreurs</AppBadge>
              )}
            </div>
          </div>

          {summary.errors.length > 0 && (
            <div className="mt-4 max-h-64 overflow-auto rounded-xl border border-amber-200 bg-amber-50 p-3">
              <p className="mb-2 flex items-center gap-1 text-xs font-medium text-amber-800">
                <AlertTriangle className="h-3 w-3" /> Lignes en erreur
              </p>
              <ul className="space-y-1 text-xs text-amber-700">
                {summary.errors.slice(0, 50).map((e, i) => (
                  <li key={i}>
                    <span className="font-mono">Ligne {e.row}</span> : {e.message}
                  </li>
                ))}
              </ul>
              {summary.errors.length > 50 && (
                <p className="mt-2 text-xs text-amber-600">... et {summary.errors.length - 50} autres</p>
              )}
            </div>
          )}

          <div className="mt-6 flex justify-center">
            <AppButton onClick={handleClose}>
              <FileSpreadsheet className="h-4 w-4" />
              Fermer
            </AppButton>
          </div>
        </div>
      )}
    </AppDialog>
  );
}
