'use client';

import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { toast } from 'sonner';
import { AppDialog } from '@/components/ui/AppDialog';
import { AppButton } from '@/components/ui/AppButton';
import { AppSelect } from '@/components/ui/AppSelect';
import { AppInput } from '@/components/ui/AppInput';
import { apiClient } from '@/lib/api/client';
import { extractApiError } from '@/lib/api/errorMessage';
import { useWarehouseSpaces, useMoveParcelToSpace } from '@/lib/hooks/useWarehouseSpaces';
import type { WarehouseSpaceDTO } from '@/lib/api/warehouseSpaces';

interface BulkProps {
  open: boolean;
  onClose: () => void;
  warehouseId: string;
  parcelIds: string[];
  /** Appele apres succes (pour invalider + vider la selection). */
  onDone: () => void;
}

/**
 * Deplace une SELECTION de colis vers une meme zone du magasin. Reutilise la
 * mutation unitaire useMoveParcelToSpace en boucle (l'API n'a pas d'endpoint
 * bulk dedie ; le volume est faible cote magasin).
 */
export function BulkMoveToSpaceDialog({ open, onClose, warehouseId, parcelIds, onDone }: BulkProps) {
  const { data } = useWarehouseSpaces(warehouseId);
  const move = useMoveParcelToSpace(warehouseId);
  const [target, setTarget] = useState('');
  const [comment, setComment] = useState('');
  const [busy, setBusy] = useState(false);

  const spaces: WarehouseSpaceDTO[] = ((data as any)?.data ?? []).filter((s: WarehouseSpaceDTO) => s.isActive);
  const options = [
    { value: '__none__', label: 'Aucune (retirer la zone)' },
    ...spaces.map((s) => ({ value: s.id, label: `${s.name}${s.parcelCount != null ? ` (${s.parcelCount})` : ''}` })),
  ];

  const onConfirm = async () => {
    if (!target || parcelIds.length === 0) return;
    const spaceId = target === '__none__' ? null : target;
    setBusy(true);
    let ok = 0;
    let firstErr = '';
    for (const parcelId of parcelIds) {
      try {
        await move.mutateAsync({ parcelId, spaceId, comment: comment.trim() || undefined });
        ok++;
      } catch (e) {
        if (!firstErr) firstErr = extractApiError(e, 'echec');
      }
    }
    setBusy(false);
    if (ok > 0) toast.success(`${ok}/${parcelIds.length} colis deplace(s)`);
    if (firstErr) toast.error(`${parcelIds.length - ok} echec(s) : ${firstErr}`);
    setTarget('');
    setComment('');
    onDone();
    onClose();
  };

  return (
    <AppDialog
      open={open}
      onClose={onClose}
      title={`Deplacer ${parcelIds.length} colis vers une zone`}
      size="md"
      footer={
        <>
          <AppButton variant="ghost" onClick={onClose}>Annuler</AppButton>
          <AppButton onClick={onConfirm} loading={busy} disabled={!target}>Deplacer</AppButton>
        </>
      }
    >
      <div className="space-y-3">
        {spaces.length === 0 ? (
          <p className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-800">
            Aucune zone active dans ce magasin. Creez-en d&apos;abord depuis la section &quot;Zones de rangement&quot;.
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

interface BulkLoadProps extends Omit<BulkProps, 'warehouseId'> {
  /** Agence du magasin : ne propose que ses conteneurs chargeables. */
  agencyId?: string | null;
}

/**
 * Charge une SELECTION de colis dans un conteneur (EMPTY / LOADING) via
 * POST /containers/:id/load. Reutilise l'endpoint de chargement existant.
 */
export function BulkLoadContainerDialog({ open, onClose, parcelIds, agencyId, onDone }: BulkLoadProps) {
  const [containerId, setContainerId] = useState('');
  const [busy, setBusy] = useState(false);

  const { data } = useQuery({
    queryKey: ['containers', 'loadable', agencyId],
    enabled: open,
    queryFn: () =>
      apiClient
        .get('/containers', {
          params: { status: 'EMPTY,LOADING', ...(agencyId && { departureAgencyId: agencyId }), limit: 100 },
        })
        .then((r) => r.data),
  });
  const containers: Array<{ id: string; designation: string; status: string }> = (data as any)?.data ?? [];
  const options = containers.map((c) => ({ value: c.id, label: `${c.designation} (${c.status})` }));

  const onConfirm = async () => {
    if (!containerId || parcelIds.length === 0) return;
    setBusy(true);
    try {
      const r = await apiClient.post(`/containers/${containerId}/load`, { parcelIds });
      const loaded = (r.data?.data?.loaded ?? r.data?.loaded ?? []).length ?? 0;
      const errors = (r.data?.data?.errors ?? r.data?.errors ?? []) as { reason: string }[];
      if (loaded > 0) toast.success(`${loaded} colis charge(s) dans le conteneur`);
      if (errors.length > 0) toast.error(`${errors.length} echec(s) : ${errors[0]?.reason ?? ''}`);
      setContainerId('');
      onDone();
      onClose();
    } catch (e) {
      toast.error(extractApiError(e, 'Echec du chargement'));
    } finally {
      setBusy(false);
    }
  };

  return (
    <AppDialog
      open={open}
      onClose={onClose}
      title={`Charger ${parcelIds.length} colis dans un conteneur`}
      size="md"
      footer={
        <>
          <AppButton variant="ghost" onClick={onClose}>Annuler</AppButton>
          <AppButton onClick={onConfirm} loading={busy} disabled={!containerId}>Charger</AppButton>
        </>
      }
    >
      <div className="space-y-3">
        {options.length === 0 ? (
          <p className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-800">
            Aucun conteneur chargeable (vide ou en chargement) pour cette agence.
          </p>
        ) : (
          <AppSelect
            label="Conteneur"
            placeholder="Selectionner un conteneur"
            options={options}
            value={containerId}
            onValueChange={setContainerId}
          />
        )}
      </div>
    </AppDialog>
  );
}
