'use client';

import { AppDialog } from '@/components/ui/AppDialog';
import { AppButton } from '@/components/ui/AppButton';

interface ConfirmDialogProps {
  open: boolean;
  onClose: () => void;
  onConfirm: () => void;
  title: string;
  message: string;
  confirmLabel?: string;
  loading?: boolean;
  variant?: 'primary' | 'destructive';
}

export function ConfirmDialog({
  open,
  onClose,
  onConfirm,
  title,
  message,
  confirmLabel = 'Confirmer',
  loading,
  variant = 'primary',
}: ConfirmDialogProps) {
  return (
    <AppDialog open={open} onClose={onClose} title={title} size="sm">
      <p className="text-sm text-gray-600 mb-6">{message}</p>
      <div className="flex justify-end gap-3">
        <AppButton variant="ghost" onClick={onClose} disabled={loading}>
          Annuler
        </AppButton>
        <AppButton variant={variant} onClick={onConfirm} loading={loading}>
          {confirmLabel}
        </AppButton>
      </div>
    </AppDialog>
  );
}
