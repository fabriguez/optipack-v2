'use client';
import { useEffect, useState } from 'react';
import { AlertTriangle, Loader2 } from 'lucide-react';

interface Props {
  open: boolean;
  title: string;
  description?: string;
  confirmLabel?: string;
  cancelLabel?: string;
  destructive?: boolean;
  /** Si fourni, on demande a l'admin de taper exactement cette valeur pour confirmer. */
  requireText?: string;
  loading?: boolean;
  onConfirm: () => void | Promise<unknown>;
  onCancel: () => void;
}

/**
 * Dialog modal de confirmation reutilisable. Optionnellement bloque tant que
 * l'admin n'a pas tape une valeur exacte (utile pour des actions destructives
 * type "delete" ou "freeze tenant principal").
 */
export function ConfirmDialog({
  open,
  title,
  description,
  confirmLabel = 'Confirmer',
  cancelLabel = 'Annuler',
  destructive,
  requireText,
  loading,
  onConfirm,
  onCancel,
}: Props) {
  const [typed, setTyped] = useState('');

  useEffect(() => {
    if (!open) setTyped('');
  }, [open]);

  if (!open) return null;

  const canConfirm = requireText ? typed.trim() === requireText : true;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
      role="dialog"
      aria-modal="true"
      onClick={onCancel}
    >
      <div
        className="w-full max-w-md rounded-lg bg-white p-5 shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-start gap-3">
          <div
            className={
              'flex h-9 w-9 shrink-0 items-center justify-center rounded-full ' +
              (destructive ? 'bg-red-100 text-red-600' : 'bg-amber-100 text-amber-600')
            }
          >
            <AlertTriangle className="h-5 w-5" />
          </div>
          <div className="flex-1">
            <h2 className="text-base font-semibold text-gray-900">{title}</h2>
            {description && (
              <p className="mt-1 text-sm text-gray-600 whitespace-pre-line">{description}</p>
            )}
          </div>
        </div>

        {requireText && (
          <div className="mt-4">
            <label className="text-xs text-gray-500">
              Pour confirmer, tape exactement : <code className="rounded bg-gray-100 px-1 font-mono">{requireText}</code>
            </label>
            <input
              type="text"
              value={typed}
              onChange={(e) => setTyped(e.target.value)}
              autoFocus
              className="mt-1 w-full rounded-md border px-3 py-2 text-sm font-mono"
              placeholder={requireText}
            />
          </div>
        )}

        <div className="mt-5 flex justify-end gap-2">
          <button
            type="button"
            onClick={onCancel}
            disabled={loading}
            className="rounded-md border bg-white px-3 py-1.5 text-sm hover:bg-gray-50 disabled:opacity-50"
          >
            {cancelLabel}
          </button>
          <button
            type="button"
            onClick={onConfirm}
            disabled={!canConfirm || loading}
            className={
              'inline-flex items-center gap-1.5 rounded-md px-3 py-1.5 text-sm font-medium text-white disabled:cursor-not-allowed disabled:opacity-50 ' +
              (destructive ? 'bg-red-600 hover:bg-red-700' : 'bg-primary-700 hover:bg-primary-900')
            }
          >
            {loading && <Loader2 className="h-4 w-4 animate-spin" />}
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}
