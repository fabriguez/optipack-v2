import { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { AlertCircle, Plus, Printer, Trash2, FileDiff } from 'lucide-react';
import { AppDialog } from '@/components/ui/AppDialog';
import { AppButton } from '@/components/ui/AppButton';
import { AppInput } from '@/components/ui/AppInput';
import { AppCard, AppCardHeader } from '@/components/ui/AppCard';
import { ConfirmDialog } from '@/components/shared/ConfirmDialog';
import { manifestsApi } from '@/lib/api/containers';
import { fetchPdfAuthed } from '@/lib/api/pdfDownload';
import { toast } from 'sonner';
import { formatDateTime } from '@transitsoftservices/shared';
import { RegisterExtraParcelDialog } from './RegisterExtraParcelDialog';
import { Can } from '@/lib/components/Can';
import { usePermission } from '@/lib/hooks/usePermission';

interface Props {
  open: boolean;
  onClose: () => void;
  containerId: string;
  containerDesignation: string;
}

const API_BASE = import.meta.env.VITE_API_URL || 'http://localhost:4000/api/v1';

export function ComparisonDialog({ open, onClose, containerId, containerDesignation }: Props) {
  const qc = useQueryClient();
  const [extraDesignation, setExtraDesignation] = useState('');
  const [extraTracking, setExtraTracking] = useState('');
  const [extraWeight, setExtraWeight] = useState('');
  const [extraComment, setExtraComment] = useState('');
  const [missingComment, setMissingComment] = useState<Record<string, string>>({});
  const [discToDelete, setDiscToDelete] = useState<string | null>(null);
  // Dialog d'enregistrement complet d'un colis EXTRA_PHYSICAL.
  const [showRegisterExtra, setShowRegisterExtra] = useState(false);
  // Permission ABAC : creation / suppression d'ecarts et enregistrement
  // de colis trouves physiquement.
  const canManageManifest = usePermission('manifest.manage');

  const { data: comparisonData, isLoading } = useQuery({
    queryKey: ['manifests', 'comparison', containerId],
    queryFn: () => manifestsApi.comparison(containerId),
    enabled: open,
  });

  const { data: discrepancyData } = useQuery({
    queryKey: ['manifests', 'discrepancies', containerId],
    queryFn: () => manifestsApi.listDiscrepancies(containerId),
    enabled: open,
  });

  const comparison = comparisonData?.data;
  const discrepancies = discrepancyData?.data || [];

  const handleAddExtra = async () => {
    if (!extraDesignation.trim()) {
      toast.error('Designation requise pour un colis trouve physiquement');
      return;
    }
    try {
      await manifestsApi.addDiscrepancy(containerId, {
        type: 'EXTRA_PHYSICAL',
        designation: extraDesignation.trim(),
        trackingNumber: extraTracking.trim() || undefined,
        weight: extraWeight ? Number(extraWeight) : undefined,
        comment: extraComment.trim() || undefined,
      });
      toast.success('Ecart enregistre');
      setExtraDesignation('');
      setExtraTracking('');
      setExtraWeight('');
      setExtraComment('');
      qc.invalidateQueries({ queryKey: ['manifests', 'discrepancies', containerId] });
    } catch {
      toast.error("Erreur lors de l'enregistrement de l'ecart");
    }
  };

  const handleMarkMissing = async (parcelId: string, line: { designation: string; weight?: unknown }) => {
    try {
      await manifestsApi.addDiscrepancy(containerId, {
        type: 'MISSING_PHYSICAL',
        parcelId,
        designation: line.designation,
        weight: line.weight != null ? Number(line.weight as never) : undefined,
        comment: missingComment[parcelId] || 'Marque manquant par admin',
      });
      toast.success('Colis marque comme manquant physiquement');
      setMissingComment((prev) => ({ ...prev, [parcelId]: '' }));
      qc.invalidateQueries({ queryKey: ['manifests', 'discrepancies', containerId] });
    } catch {
      toast.error('Erreur lors du marquage');
    }
  };

  const handleRemoveDiscrepancy = async (id: string) => {
    try {
      await manifestsApi.removeDiscrepancy(containerId, id);
      toast.success('Ecart supprime');
      qc.invalidateQueries({ queryKey: ['manifests', 'discrepancies', containerId] });
    } catch {
      toast.error('Erreur lors de la suppression');
    }
    setDiscToDelete(null);
  };

  const handlePrint = () => {
    fetchPdfAuthed(`/manifests/comparison/${containerId}/pdf`, {
      fileName: `comparaison-${containerId}.pdf`,
    });
  };

  if (!open) return null;

  const dispatchById = new Map(
    (comparison?.dispatch || []).map((l: any) => [l.parcelId, l]),
  );
  const receptionById = new Map(
    (comparison?.reception || []).map((l: any) => [l.parcelId, l]),
  );

  const missingAuto = (comparison?.missingParcelIds || []).map((pid: string) => ({
    parcelId: pid,
    line: dispatchById.get(pid),
  }));

  // Nouvelle categorie : colis lies en ligne au conteneur (containerId /
  // lastContainerId) mais ABSENTS du bordereau d'envoi. Cas typique : ajout
  // manuel apres generation du dispatch, ou colis decharge sans avoir ete
  // declare. On les recupere depuis le tableau outOfManifestParcelIds du backend.
  const outOfManifestIds: string[] = comparison?.outOfManifestParcelIds || [];
  // On exclut ceux qui sont deja dans reception (sinon doublon avec "extras")
  // pour ne montrer dans cette section que les colis qui n'apparaissent
  // dans AUCUN bordereau mais qui sont pourtant lies au conteneur.
  const outOfManifestOnly = outOfManifestIds.filter((id) => !receptionById.has(id));

  const adminMissing = discrepancies.filter((d) => d.type === 'MISSING_PHYSICAL');
  const adminExtra = discrepancies.filter((d) => d.type === 'EXTRA_PHYSICAL');

  return (
    <>
      <AppDialog
        open={open}
        onClose={onClose}
        title={`Bordereau de comparaison - ${containerDesignation}`}
        size="xl"
        footer={
          <>
            <AppButton variant="ghost" onClick={onClose}>Fermer</AppButton>
            <AppButton variant="outline" onClick={handlePrint}>
              <Printer className="h-4 w-4" />
              Imprimer / PDF
            </AppButton>
          </>
        }
      >
        {isLoading ? (
          <p className="p-4 text-sm text-gray-400">Chargement...</p>
        ) : !comparison ? (
          <p className="p-4 text-sm text-gray-400">Aucune donnee disponible. Generez d&apos;abord les bordereaux d&apos;envoi et de reception.</p>
        ) : (
          <div className="space-y-5">
            <div className="grid grid-cols-5 gap-3">
              <Stat label="Envoyes" value={comparison.dispatch?.length || 0} />
              <Stat label="Recus" value={comparison.reception?.length || 0} />
              <Stat label="Manquants auto" value={missingAuto.length} accent={missingAuto.length > 0 ? 'red' : undefined} />
              <Stat label="Hors bordereau" value={outOfManifestOnly.length} accent={outOfManifestOnly.length > 0 ? 'orange' : undefined} />
              <Stat label="Ecarts admin" value={discrepancies.length} accent={discrepancies.length > 0 ? 'orange' : undefined} />
            </div>

            <AppCard padding="sm">
              <AppCardHeader title="1. Colis envoyes mais non recus (manquants physiquement)" description="L'admin peut marquer un colis present en ligne mais absent physiquement." />
              {missingAuto.length === 0 && adminMissing.length === 0 ? (
                <p className="text-sm text-gray-400 py-4 text-center">Aucun ecart</p>
              ) : (
                <div className="space-y-3">
                  {missingAuto.map(({ parcelId, line }: any) => {
                    const alreadyMarked = adminMissing.some((d) => d.parcelId === parcelId);
                    return (
                      <div key={parcelId} className="rounded-xl bg-red-50 border border-red-100 p-3">
                        <div className="flex items-start justify-between gap-2">
                          <div>
                            <p className="font-mono text-xs font-bold text-red-800">{parcelId.slice(0, 8)}</p>
                            <p className="text-sm font-medium text-gray-900">{line?.designation}</p>
                            <p className="text-xs text-gray-500 mt-0.5">{line?.weight ? `${Number(line.weight)} kg` : '-'}</p>
                          </div>
                          {!alreadyMarked && canManageManifest && (
                            <div className="flex flex-col gap-1.5 min-w-0 flex-1">
                              <AppInput
                                placeholder="Commentaire admin..."
                                value={missingComment[parcelId] || ''}
                                onChange={(e) => setMissingComment((prev) => ({ ...prev, [parcelId]: e.target.value }))}
                                className="h-8 text-xs"
                              />
                              <AppButton size="sm" variant="outline" onClick={() => handleMarkMissing(parcelId, line)}>
                                Confirmer manquant
                              </AppButton>
                            </div>
                          )}
                          {alreadyMarked && (
                            <span className="text-xs font-medium text-red-700 self-center">Confirme par admin</span>
                          )}
                        </div>
                      </div>
                    );
                  })}
                  {adminMissing
                    .filter((d) => !missingAuto.some((m: any) => m.parcelId === d.parcelId))
                    .map((d) => (
                      <DiscrepancyRow key={d.id} disc={d} onDelete={() => setDiscToDelete(d.id)} />
                    ))}
                </div>
              )}
            </AppCard>

            {/* Nouvelle section : colis lies au conteneur en ligne mais
                pas presents dans le bordereau d'envoi (manifeste genere
                avant chargement, ou ajout manuel apres coup). */}
            <AppCard padding="sm">
              <AppCardHeader
                title="2. Colis lies au conteneur mais hors bordereau d'envoi"
                description="Colis enregistres en ligne sur ce conteneur mais qui n'apparaissent dans aucun bordereau d'envoi actif. A regulariser."
              />
              {outOfManifestOnly.length === 0 ? (
                <p className="text-sm text-gray-400 py-4 text-center">Aucun colis hors bordereau</p>
              ) : (
                <ul className="space-y-1.5">
                  {outOfManifestOnly.map((pid) => (
                    <li
                      key={pid}
                      className="rounded-lg border border-orange-100 bg-orange-50/60 p-2 font-mono text-xs"
                    >
                      <span className="font-bold text-orange-800">{pid.slice(0, 8)}...</span>
                      <span className="ml-2 text-gray-600">
                        Lie en ligne au conteneur mais absent du bordereau d&apos;envoi.
                      </span>
                    </li>
                  ))}
                </ul>
              )}
            </AppCard>

            <AppCard padding="sm">
              <AppCardHeader
                title="3. Colis trouves physiquement mais non enregistres en ligne"
                description="Marquage rapide (ecart) ou enregistrement complet (colis avec tous les details)."
              />
              <div className="space-y-3">
                <div className="grid grid-cols-1 gap-2 sm:grid-cols-5 rounded-xl bg-orange-50 border border-orange-100 p-3">
                  <AppInput placeholder="Designation *" value={extraDesignation} onChange={(e) => setExtraDesignation(e.target.value)} className="sm:col-span-2" />
                  <AppInput placeholder="Tracking" value={extraTracking} onChange={(e) => setExtraTracking(e.target.value)} />
                  <AppInput placeholder="Poids (kg)" type="number" value={extraWeight} onChange={(e) => setExtraWeight(e.target.value)} />
                  <Can permission="manifest.manage">
                    <AppButton size="sm" onClick={handleAddExtra}><Plus className="h-3.5 w-3.5" />Marquer ecart</AppButton>
                  </Can>
                </div>
                <p className="rounded-lg bg-gray-50 p-2 text-[11px] text-gray-500">
                  Pour <strong>enregistrer un vrai colis</strong> avec tous les details
                  (client, destinataire, route, fragile/dangereux, valeur declaree...),
                  utilisez le bouton ci-dessous. Le colis cree apparaitra dans tous les
                  listings (magasin, historique conteneur, etc.).
                </p>
                <Can permission="manifest.manage">
                  <div className="flex justify-end">
                    <AppButton size="sm" variant="outline" onClick={() => setShowRegisterExtra(true)}>
                      <Plus className="h-3.5 w-3.5" />
                      Enregistrer un colis complet
                    </AppButton>
                  </div>
                </Can>
                <AppInput placeholder="Commentaire (optionnel)" value={extraComment} onChange={(e) => setExtraComment(e.target.value)} />

                {adminExtra.length === 0 ? (
                  <p className="text-sm text-gray-400 py-4 text-center">Aucun excedent enregistre</p>
                ) : (
                  adminExtra.map((d) => (
                    <DiscrepancyRow key={d.id} disc={d} onDelete={() => setDiscToDelete(d.id)} />
                  ))
                )}
              </div>
            </AppCard>

          </div>
        )}
      </AppDialog>

      <ConfirmDialog
        open={!!discToDelete}
        onClose={() => setDiscToDelete(null)}
        onConfirm={() => discToDelete && handleRemoveDiscrepancy(discToDelete)}
        title="Supprimer l'ecart"
        message="Cet ecart sera retire du bordereau de comparaison."
        confirmLabel="Supprimer"
        variant="destructive"
      />

      <RegisterExtraParcelDialog
        open={showRegisterExtra}
        onClose={() => setShowRegisterExtra(false)}
        containerId={containerId}
        containerDesignation={containerDesignation}
      />
    </>
  );
}

function Stat({ label, value, accent }: { label: string; value: number; accent?: 'red' | 'orange' }) {
  const color = accent === 'red' ? 'text-red-600' : accent === 'orange' ? 'text-orange-600' : 'text-gray-900';
  return (
    <div className="rounded-xl bg-gray-50 p-3">
      <p className="text-[10px] uppercase tracking-wider text-gray-400">{label}</p>
      <p className={`text-lg font-bold mt-0.5 ${color}`}>{value}</p>
    </div>
  );
}

function DiscrepancyRow({ disc, onDelete }: { disc: { id: string; designation: string | null; trackingNumber: string | null; weight: unknown; comment: string | null; createdAt: string }; onDelete: () => void }) {
  // Permission ABAC : suppression d'un ecart (DELETE /manifests/discrepancies).
  const canManageManifest = usePermission('manifest.manage');
  return (
    <div className="flex items-start justify-between gap-2 rounded-xl bg-gray-50 p-3">
      <div className="flex items-start gap-2 min-w-0 flex-1">
        <AlertCircle className="h-4 w-4 text-orange-500 mt-0.5 shrink-0" />
        <div className="min-w-0">
          <p className="text-sm font-medium text-gray-900 truncate">{disc.designation || '-'}</p>
          <p className="text-xs text-gray-500 truncate">
            {disc.trackingNumber || 'Sans tracking'} • {disc.weight != null ? `${Number(disc.weight as never)} kg` : '-'} • {formatDateTime(disc.createdAt)}
          </p>
          {disc.comment && <p className="text-xs text-gray-600 mt-0.5 italic">{disc.comment}</p>}
        </div>
      </div>
      {canManageManifest && (
        <button onClick={onDelete} className="rounded-lg p-1.5 hover:bg-red-50" aria-label="Supprimer">
          <Trash2 className="h-3.5 w-3.5 text-red-600" />
        </button>
      )}
    </div>
  );
}
