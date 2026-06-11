import { useState } from 'react';
import { AppDialog } from '@/components/ui/AppDialog';
import { AppButton } from '@/components/ui/AppButton';
import { AppSelect } from '@/components/ui/AppSelect';
import { AppInput } from '@/components/ui/AppInput';
import {
  useWarehouseSpaces,
  useMoveParcelToSpace,
} from '@/lib/hooks/useWarehouseSpaces';
import type { WarehouseSpaceDTO } from '@/lib/api/warehouseSpaces';

interface Props {
  open: boolean;
  onClose: () => void;
  warehouseId: string;
  parcel: { id: string; trackingNumber: string; designation?: string; spaceId?: string | null; space?: { id: string; name: string } | null } | null;
}

export function MoveToSpaceDialog({ open, onClose, warehouseId, parcel }: Props) {
  const { data } = useWarehouseSpaces(warehouseId);
  const move = useMoveParcelToSpace(warehouseId);
  const [target, setTarget] = useState<string>('');
  const [comment, setComment] = useState('');

  const spaces: WarehouseSpaceDTO[] = ((data as any)?.data ?? []).filter((s: WarehouseSpaceDTO) => s.isActive);
  // "" = aucune (retirer la zone). On expose explicitement cette option.
  const options = [
    { value: '__none__', label: 'Aucune (retirer la zone)' },
    ...spaces.map((s) => ({
      value: s.id,
      label: `${s.name}${s.parcelCount != null ? ` (${s.parcelCount})` : ''}`,
    })),
  ];

  const currentSpaceLabel = parcel?.space?.name ?? '(aucune zone)';

  const onConfirm = () => {
    if (!parcel) return;
    const spaceId = target === '__none__' ? null : target;
    move.mutate(
      { parcelId: parcel.id, spaceId, comment: comment.trim() || undefined },
      {
        onSuccess: () => {
          setTarget('');
          setComment('');
          onClose();
        },
      },
    );
  };

  return (
    <AppDialog
      open={open}
      onClose={onClose}
      title="Deplacer vers une zone"
      size="md"
      footer={
        <>
          <AppButton variant="ghost" onClick={onClose}>Annuler</AppButton>
          <AppButton
            onClick={onConfirm}
            loading={move.isPending}
            disabled={!target || (target !== '__none__' && target === parcel?.spaceId)}
          >
            Deplacer
          </AppButton>
        </>
      }
    >
      <div className="space-y-3">
        <div className="rounded-lg bg-gray-50 p-3 text-sm">
          <div className="font-mono text-xs font-bold text-primary-700">{parcel?.trackingNumber}</div>
          {parcel?.designation && <div className="text-gray-700">{parcel.designation}</div>}
          <div className="mt-1 text-xs text-gray-500">
            Zone actuelle : <span className="font-medium text-gray-700">{currentSpaceLabel}</span>
          </div>
        </div>
        {spaces.length === 0 ? (
          <p className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-800">
            Aucune zone active dans ce magasin. Creez-en d&apos;abord depuis la section
            &quot;Zones de rangement&quot; ci-dessus.
          </p>
        ) : (
          <AppSelect
            label="Nouvelle zone"
            placeholder="Selectionner une zone"
            options={options}
            value={target}
            onValueChange={setTarget}
          />
        )}
        <AppInput
          label="Commentaire (optionnel)"
          placeholder="Motif du deplacement..."
          value={comment}
          onChange={(e) => setComment(e.target.value)}
        />
      </div>
    </AppDialog>
  );
}
