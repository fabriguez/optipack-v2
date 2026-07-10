import { useEffect, useState } from 'react';
import { Plus, Trash2, MapPin, Edit3, Save, X } from 'lucide-react';
import { AppCard } from '@/components/ui/AppCard';
import { AppButton } from '@/components/ui/AppButton';
import { AppInput } from '@/components/ui/AppInput';
import { AppBadge } from '@/components/ui/AppBadge';
import {
  useWarehouseSpaces,
  useUpsertWarehouseSpaces,
} from '@/lib/hooks/useWarehouseSpaces';
import type { WarehouseSpaceDTO, SpaceUpsertItem } from '@/lib/api/warehouseSpaces';
import { Can } from '@/lib/components/Can';

interface Props {
  warehouseId: string;
}

/**
 * Zones de rangement d'un magasin.
 *
 * Edition en place : on charge la liste serveur, l'utilisateur peut ajouter,
 * modifier nom/description ou marquer pour suppression. La sauvegarde envoie
 * la liste finale au PUT (replace-all). Le backend desactive automatiquement
 * les zones contenant encore des colis au lieu de les supprimer.
 */
export function SpacesSection({ warehouseId }: Props) {
  const { data, isLoading } = useWarehouseSpaces(warehouseId);
  const upsert = useUpsertWarehouseSpaces(warehouseId);
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState<DraftItem[]>([]);

  // Charge le draft a chaque ouverture de l'edition (et au montage initial).
  useEffect(() => {
    const list: WarehouseSpaceDTO[] = (data as any)?.data ?? [];
    setDraft(list.map((s) => ({ id: s.id, name: s.name, description: s.description ?? '', isActive: s.isActive, parcelCount: s.parcelCount ?? 0 })));
  }, [data, editing]);

  const list: WarehouseSpaceDTO[] = (data as any)?.data ?? [];

  const onSave = () => {
    // Validation locale : nom non vide + pas de doublon.
    const cleaned = draft
      .filter((d) => d.name.trim().length > 0)
      .map<SpaceUpsertItem>((d) => ({
        ...(d.id ? { id: d.id } : {}),
        name: d.name.trim(),
        description: d.description.trim() || undefined,
        isActive: d.isActive,
      }));
    const names = new Set<string>();
    for (const c of cleaned) {
      if (names.has(c.name)) {
        // Toast handled by mutation on backend error, but also locally
        return;
      }
      names.add(c.name);
    }
    upsert.mutate(cleaned, { onSuccess: () => setEditing(false) });
  };

  return (
    <AppCard>
      <div className="mb-3 flex items-center justify-between">
        <h3 className="flex items-center gap-2 text-base font-semibold text-gray-900">
          <MapPin className="h-4 w-4 text-primary-600" />
          Zones de rangement ({list.length})
        </h3>
        {!editing ? (
          <Can permission="warehouse.manage">
            <AppButton size="sm" variant="outline" onClick={() => setEditing(true)}>
              <Edit3 className="h-3.5 w-3.5" />
              Gerer
            </AppButton>
          </Can>
        ) : (
          <div className="flex gap-1">
            <AppButton size="sm" variant="ghost" onClick={() => setEditing(false)}>
              Annuler
            </AppButton>
            <AppButton size="sm" onClick={onSave} loading={upsert.isPending}>
              <Save className="h-3.5 w-3.5" />
              Enregistrer
            </AppButton>
          </div>
        )}
      </div>

      {isLoading && <p className="py-3 text-sm text-gray-400">Chargement...</p>}

      {!isLoading && !editing && list.length === 0 && (
        <p className="py-4 text-sm text-gray-400">
          Aucune zone definie. Cliquez sur <strong>Gerer</strong> pour en creer (Allee A,
          Etagere 3, Frigo, ...).
        </p>
      )}

      {!isLoading && !editing && list.length > 0 && (
        <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-3">
          {list.map((s) => (
            <div
              key={s.id}
              className={`rounded-lg border p-3 ${s.isActive ? 'border-gray-200 bg-white' : 'border-gray-100 bg-gray-50'}`}
            >
              <div className="flex items-center justify-between gap-2">
                <div className="font-medium text-gray-900">{s.name}</div>
                {!s.isActive ? (
                  <AppBadge variant="outline">Desactivee</AppBadge>
                ) : (s.parcelCount ?? 0) > 0 ? (
                  <AppBadge variant="info">{s.parcelCount} colis</AppBadge>
                ) : (
                  <AppBadge variant="outline">Vide</AppBadge>
                )}
              </div>
              {s.description && (
                <p className="mt-1 text-xs text-gray-500">{s.description}</p>
              )}
            </div>
          ))}
        </div>
      )}

      {editing && (
        <div className="space-y-2">
          {draft.map((d, i) => (
            <DraftRow
              key={d.id ?? `new-${i}`}
              item={d}
              onChange={(patch) => setDraft((arr) => arr.map((x, j) => (i === j ? { ...x, ...patch } : x)))}
              onRemove={() => setDraft((arr) => arr.filter((_, j) => i !== j))}
            />
          ))}
          <button
            type="button"
            onClick={() =>
              setDraft((arr) => [...arr, { name: '', description: '', isActive: true, parcelCount: 0 }])
            }
            className="inline-flex items-center gap-1 rounded-lg border border-dashed border-gray-300 px-3 py-2 text-xs text-gray-600 hover:bg-gray-50"
          >
            <Plus className="h-3.5 w-3.5" />
            Ajouter une zone
          </button>
          <p className="text-[11px] text-gray-400">
            Les zones contenant encore des colis sont desactivees au lieu d&apos;etre supprimees,
            pour preserver l&apos;historique.
          </p>
        </div>
      )}
    </AppCard>
  );
}

interface DraftItem {
  id?: string;
  name: string;
  description: string;
  isActive: boolean;
  parcelCount: number;
}

function DraftRow({
  item,
  onChange,
  onRemove,
}: {
  item: DraftItem;
  onChange: (patch: Partial<DraftItem>) => void;
  onRemove: () => void;
}) {
  return (
    <div className="grid grid-cols-1 gap-2 rounded-lg border border-gray-100 bg-gray-50/40 p-2 sm:grid-cols-[1fr_2fr_auto_auto]">
      <AppInput
        placeholder="Nom (Allee A, Etagere 3, ...)"
        value={item.name}
        onChange={(e) => onChange({ name: e.target.value })}
      />
      <AppInput
        placeholder="Description (optionnelle)"
        value={item.description}
        onChange={(e) => onChange({ description: e.target.value })}
      />
      <label className="inline-flex items-center gap-1 text-xs text-gray-600">
        <input
          type="checkbox"
          className="h-4 w-4 rounded"
          checked={item.isActive}
          onChange={(e) => onChange({ isActive: e.target.checked })}
        />
        Active
      </label>
      <button
        type="button"
        onClick={onRemove}
        title={item.parcelCount > 0 ? `Contient ${item.parcelCount} colis : sera desactivee au lieu d'etre supprimee` : 'Supprimer'}
        className="inline-flex items-center justify-center rounded p-1.5 text-gray-500 hover:bg-red-50 hover:text-red-600"
      >
        {item.parcelCount > 0 ? <X className="h-4 w-4" /> : <Trash2 className="h-4 w-4" />}
      </button>
    </div>
  );
}
