'use client';

import { useEffect, useState } from 'react';
import { AppDialog } from '@/components/ui/AppDialog';
import { AppButton } from '@/components/ui/AppButton';
import { AppInput } from '@/components/ui/AppInput';
import { ClientPickerList } from '@/components/shared/ClientPickerList';
import { useAssignPromoCode } from '@/lib/hooks/usePromoCodes';

interface Props {
  open: boolean;
  onClose: () => void;
  promoCodeId: string;
  /** Clients deja attribues : masques de la liste pour eviter les doublons. */
  alreadyAssignedIds: string[];
  /** Quota par client du code, propose par defaut dans le champ. */
  defaultMaxUses: number | null;
}

export function AssignClientsDialog({
  open,
  onClose,
  promoCodeId,
  alreadyAssignedIds,
  defaultMaxUses,
}: Props) {
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [maxUses, setMaxUses] = useState<string>('');
  const assign = useAssignPromoCode(promoCodeId);

  useEffect(() => {
    if (open) {
      setSelectedIds([]);
      setMaxUses(defaultMaxUses != null ? String(defaultMaxUses) : '');
    }
  }, [open, defaultMaxUses]);

  const submit = () => {
    const parsed = maxUses.trim() === '' ? null : Number(maxUses);
    assign.mutate(
      {
        clientIds: selectedIds,
        maxUses: parsed != null && Number.isFinite(parsed) && parsed > 0 ? parsed : null,
        replace: false,
      },
      { onSuccess: onClose },
    );
  };

  return (
    <AppDialog
      open={open}
      onClose={onClose}
      title="Attribuer le code a des clients"
      size="lg"
      footer={
        <>
          <AppButton variant="ghost" type="button" onClick={onClose}>
            Annuler
          </AppButton>
          <AppButton
            onClick={submit}
            loading={assign.isPending}
            disabled={selectedIds.length === 0}
          >
            Attribuer{selectedIds.length > 0 ? ` (${selectedIds.length})` : ''}
          </AppButton>
        </>
      }
    >
      <div className="space-y-4">
        <AppInput
          label="Utilisations autorisees par client (vide = illimite)"
          type="number"
          min={1}
          value={maxUses}
          onChange={(e) => setMaxUses(e.target.value)}
        />
        <ClientPickerList
          selectedIds={selectedIds}
          onSelectedChange={setSelectedIds}
          excludeIds={alreadyAssignedIds}
          emptyText="Tous les clients ont deja ce code, ou aucun client ne correspond."
        />
      </div>
    </AppDialog>
  );
}
