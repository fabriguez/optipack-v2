'use client';

import { useState } from 'react';
import { Camera, Trash2, X, ScanLine } from 'lucide-react';
import { AppInput } from '@/components/ui/AppInput';
import { AppButton } from '@/components/ui/AppButton';
import { QRScannerDialog } from './QRScannerDialog';
import { scanSound } from '@/lib/utils/scanSound';
import { toast } from 'sonner';

export interface BatchScanCollectorProps {
  /** Codes deja accumules (controle externe — permet a l'appelant de filtrer / dedupliquer). */
  codes: string[];
  /** Appele a chaque ajout/suppression. Le parent decide d'accepter ou non (ex: dedup). */
  onChange: (next: string[]) => void;
  /** Texte du bouton principal (ex: "Charger 3 colis"). */
  submitLabel: string;
  /** Action declenchee au submit. Recoit la liste finale. */
  onSubmit: (codes: string[]) => Promise<void> | void;
  /** Si fourni, valide chaque code avant ajout (ex: tracking number existant). Throw pour rejeter. */
  validate?: (code: string) => Promise<void> | void;
  submitting?: boolean;
  placeholder?: string;
  helperText?: string;
  cameraTitle?: string;
}

/**
 * Saisie + scan QR multiple. Empile les codes scannes / saisis dans une liste
 * et delegue le traitement batch a l'appelant. Le scanner reste ouvert apres
 * chaque detection (closeOnDetect=false) pour fluidifier le scan en chaine.
 */
export function BatchScanCollector({
  codes,
  onChange,
  submitLabel,
  onSubmit,
  validate,
  submitting,
  placeholder = 'Scanner ou coller un tracking...',
  helperText,
  cameraTitle = 'Scanner les colis',
}: BatchScanCollectorProps) {
  const [input, setInput] = useState('');
  const [cameraOpen, setCameraOpen] = useState(false);
  const [busy, setBusy] = useState(false);

  const addCode = async (raw: string) => {
    const v = raw.trim();
    if (!v) return;
    if (codes.includes(v)) {
      // Doublon : son d'avertissement (deja scanne) plutot qu'un succes ou
      // une erreur franche.
      scanSound.warning();
      toast.info(`Deja dans la liste : ${v}`);
      return;
    }
    if (validate) {
      try {
        setBusy(true);
        await validate(v);
      } catch (e: any) {
        scanSound.error();
        toast.error(e?.message || `Code invalide : ${v}`);
        setBusy(false);
        return;
      } finally {
        setBusy(false);
      }
    }
    scanSound.success();
    onChange([...codes, v]);
    setInput('');
  };

  const removeCode = (c: string) => onChange(codes.filter((x) => x !== c));

  const handleSubmit = async () => {
    if (codes.length === 0) return;
    await onSubmit(codes);
  };

  return (
    <div className="space-y-3">
      <div className="flex flex-col gap-2 sm:flex-row">
        <div className="flex flex-1 gap-2">
          <AppInput
            placeholder={placeholder}
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                e.preventDefault();
                addCode(input);
              }
            }}
          />
          <AppButton variant="outline" type="button" onClick={() => setCameraOpen(true)} title="Scanner">
            <Camera className="h-4 w-4" />
          </AppButton>
          <AppButton
            type="button"
            variant="outline"
            onClick={() => addCode(input)}
            disabled={!input.trim() || busy}
            loading={busy}
          >
            Ajouter
          </AppButton>
        </div>
      </div>

      {helperText && <p className="text-xs text-gray-500">{helperText}</p>}

      <div className="rounded-xl border border-gray-100 bg-gray-50">
        <div className="flex items-center justify-between border-b border-gray-100 px-3 py-2">
          <span className="inline-flex items-center gap-1.5 text-xs font-medium text-gray-600">
            <ScanLine className="h-3.5 w-3.5" />
            {codes.length} code{codes.length > 1 ? 's' : ''} en attente
          </span>
          {codes.length > 0 && (
            <button
              type="button"
              onClick={() => onChange([])}
              className="inline-flex items-center gap-1 text-[11px] text-red-600 hover:underline"
            >
              <Trash2 className="h-3 w-3" />
              Tout vider
            </button>
          )}
        </div>
        {codes.length === 0 ? (
          <div className="p-4 text-center text-xs text-gray-400">Aucun code scanne pour le moment.</div>
        ) : (
          <ul className="divide-y divide-gray-100 max-h-56 overflow-auto">
            {codes.map((c, i) => (
              <li key={c} className="flex items-center justify-between px-3 py-1.5 text-xs">
                <span className="font-mono text-gray-700">
                  <span className="mr-2 text-gray-400">#{i + 1}</span>
                  {c}
                </span>
                <button
                  type="button"
                  onClick={() => removeCode(c)}
                  className="rounded p-1 text-gray-400 hover:bg-red-50 hover:text-red-600"
                  aria-label="Retirer"
                >
                  <X className="h-3.5 w-3.5" />
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>

      <div className="flex justify-end">
        <AppButton onClick={handleSubmit} disabled={codes.length === 0 || submitting} loading={submitting}>
          {submitLabel}
        </AppButton>
      </div>

      <QRScannerDialog
        open={cameraOpen}
        onClose={() => setCameraOpen(false)}
        onDetected={(decoded) => {
          // closeOnDetect=false : on accumule sans fermer le scanner. On ferme
          // manuellement quand l'utilisateur clique "Fermer".
          void addCode(decoded);
        }}
        closeOnDetect={false}
        title={cameraTitle}
      />
    </div>
  );
}
