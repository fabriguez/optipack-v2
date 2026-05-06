'use client';

import { use, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { ArrowLeft, ScanLine, CheckCircle2, AlertTriangle, Package, Camera, MessageSquarePlus, Hand } from 'lucide-react';
import { AppDialog } from '@/components/ui/AppDialog';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { PageTransition } from '@/components/shared/PageTransition';
import { AppCard } from '@/components/ui/AppCard';
import { AppButton } from '@/components/ui/AppButton';
import { AppBadge } from '@/components/ui/AppBadge';
import { AppInput } from '@/components/ui/AppInput';
import { ConfirmDialog } from '@/components/shared/ConfirmDialog';
import { QRScannerDialog } from '@/components/shared/QRScannerDialog';
import { DashboardSkeleton } from '@/components/ui/AppSkeleton';
import { apiClient } from '@/lib/api/client';
import { formatDateTime } from '@transitsoftservices/shared';
import { toast } from 'sonner';

export default function InventoryDetailPage({
  params,
}: {
  params: Promise<{ id: string; inventoryId: string }>;
}) {
  const { id, inventoryId } = use(params);
  const router = useRouter();
  const qc = useQueryClient();
  const [scanInput, setScanInput] = useState('');
  const [scanBusy, setScanBusy] = useState(false);
  const [scanObservation, setScanObservation] = useState('');
  const [showCloseConfirm, setShowCloseConfirm] = useState(false);
  const [closing, setClosing] = useState(false);
  const [showCamera, setShowCamera] = useState(false);
  // Marquage manuel
  const [manualTarget, setManualTarget] = useState<any | null>(null);
  const [manualObservation, setManualObservation] = useState('');
  const [manualBusy, setManualBusy] = useState(false);

  const { data, isLoading } = useQuery({
    queryKey: ['inventory', inventoryId],
    queryFn: () => apiClient.get(`/warehouses/inventories/${inventoryId}`).then((r) => r.data),
    enabled: !!inventoryId,
  });

  // Liste des colis du magasin pas encore inventories.
  const { data: uninventoriedData } = useQuery({
    queryKey: ['inventory', inventoryId, 'uninventoried'],
    queryFn: () => apiClient.get(`/warehouses/inventories/${inventoryId}/uninventoried`).then((r) => r.data),
    enabled: !!inventoryId,
  });
  const uninventoried: any[] = uninventoriedData?.data || [];

  const inventory = data?.data;
  if (isLoading) return <DashboardSkeleton />;
  if (!inventory) return <p className="p-6 text-gray-500">Inventaire introuvable</p>;

  const isOpen = inventory.status === 'IN_PROGRESS';
  const counts = inventory.counts;

  const items: any[] = inventory.items || [];
  const matched = items.filter((i) => i.expected && i.scanned);
  const missing = items.filter((i) => i.expected && !i.scanned);
  const extra = items.filter((i) => !i.expected && i.scanned);

  const submitScan = async (raw: string) => {
    const v = raw.trim();
    if (!v) return;
    setScanBusy(true);
    try {
      const res = await apiClient.post(`/warehouses/inventories/${inventoryId}/scan`, {
        trackingNumber: v,
        observation: scanObservation.trim() || undefined,
      });
      const status = res.data.data.status;
      if (status === 'scanned') toast.success(`Scanne : ${res.data.data.parcel.trackingNumber}`);
      else if (status === 'extra') toast.warning(`Inattendu : ${res.data.data.parcel.trackingNumber}`);
      else if (status === 'already_scanned') toast.info('Deja scanne');
      setScanInput('');
      setScanObservation('');
      qc.invalidateQueries({ queryKey: ['inventory', inventoryId] });
      qc.invalidateQueries({ queryKey: ['inventory', inventoryId, 'uninventoried'] });
    } catch (e: any) {
      toast.error(e?.response?.data?.message || 'Colis introuvable');
    }
    setScanBusy(false);
  };

  const handleManualMark = async () => {
    if (!manualTarget) return;
    setManualBusy(true);
    try {
      await apiClient.post(`/warehouses/inventories/${inventoryId}/mark`, {
        parcelId: manualTarget.id,
        present: true,
        observation: manualObservation.trim() || undefined,
      });
      toast.success(`Marque present sans scan : ${manualTarget.trackingNumber}`);
      setManualTarget(null);
      setManualObservation('');
      qc.invalidateQueries({ queryKey: ['inventory', inventoryId] });
      qc.invalidateQueries({ queryKey: ['inventory', inventoryId, 'uninventoried'] });
    } catch (e: any) {
      toast.error(e?.response?.data?.message || 'Erreur');
    }
    setManualBusy(false);
  };

  const handleScan = () => submitScan(scanInput);

  const handleClose = async () => {
    setClosing(true);
    try {
      await apiClient.post(`/warehouses/inventories/${inventoryId}/close`);
      toast.success('Inventaire cloture');
      qc.invalidateQueries({ queryKey: ['inventory', inventoryId] });
      qc.invalidateQueries({ queryKey: ['warehouses', id, 'inventories'] });
    } catch (e: any) {
      toast.error(e?.response?.data?.message || 'Cloture impossible');
    }
    setClosing(false);
    setShowCloseConfirm(false);
  };

  return (
    <PageTransition>
      <div className="space-y-6">
        <div className="flex items-center gap-4">
          <button onClick={() => router.back()} className="rounded-xl p-2 hover:bg-gray-100 transition-colors">
            <ArrowLeft className="h-5 w-5 text-gray-500" />
          </button>
          <div>
            <div className="flex items-center gap-3">
              <h1 className="text-2xl font-bold text-gray-900">
                Inventaire &mdash;{' '}
                <Link href={`/warehouses/${id}`} className="text-primary-700 hover:underline">
                  {inventory.warehouse?.name}
                </Link>
              </h1>
              {isOpen && <AppBadge variant="warning">En cours</AppBadge>}
              {inventory.status === 'CLOSED' && <AppBadge variant="success">Cloture</AppBadge>}
              {inventory.status === 'CANCELLED' && <AppBadge variant="error">Annule</AppBadge>}
            </div>
            <p className="text-sm text-gray-500 mt-0.5">
              Demarre le {formatDateTime(inventory.startedAt)}
              {inventory.startedBy && ` par ${inventory.startedBy.firstName} ${inventory.startedBy.lastName}`}
              {inventory.closedAt && ` - Cloture le ${formatDateTime(inventory.closedAt)}`}
            </p>
          </div>
        </div>

        <div className="grid grid-cols-2 gap-4 sm:grid-cols-5">
          <AppCard>
            <p className="text-xs text-gray-500">Attendus</p>
            <p className="mt-1 text-lg font-bold">{counts.expected}</p>
          </AppCard>
          <AppCard>
            <p className="text-xs text-gray-500">Scannes</p>
            <p className="mt-1 text-lg font-bold">{counts.scanned}</p>
          </AppCard>
          <AppCard>
            <p className="text-xs text-gray-500">Conformes</p>
            <p className="mt-1 text-lg font-bold text-primary-700">{counts.matched}</p>
          </AppCard>
          <AppCard>
            <p className="text-xs text-gray-500">Manquants</p>
            <p className="mt-1 text-lg font-bold text-red-600">{counts.missing}</p>
          </AppCard>
          <AppCard>
            <p className="text-xs text-gray-500">En plus</p>
            <p className="mt-1 text-lg font-bold text-amber-600">{counts.extra}</p>
          </AppCard>
        </div>

        {isOpen && (
          <AppCard>
            <h3 className="text-base font-semibold text-gray-900 mb-3">Scanner un colis</h3>
            <div className="flex gap-2">
              <AppInput
                placeholder="Scanner ou coller un QR / code-barres / numero de tracking..."
                value={scanInput}
                onChange={(e) => setScanInput(e.target.value)}
                onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); handleScan(); } }}
                autoFocus
              />
              <AppButton variant="outline" onClick={() => setShowCamera(true)} type="button">
                <Camera className="h-4 w-4" />
                Camera
              </AppButton>
              <AppButton onClick={handleScan} loading={scanBusy} disabled={!scanInput.trim()}>
                <ScanLine className="h-4 w-4" />
                Valider
              </AppButton>
            </div>
            <div className="mt-2">
              <AppInput
                label="Observation (optionnelle)"
                placeholder="Ex : emballage abime, poids different..."
                value={scanObservation}
                onChange={(e) => setScanObservation(e.target.value)}
              />
            </div>
            <div className="mt-4 flex justify-end">
              <AppButton variant="outline" onClick={() => setShowCloseConfirm(true)}>
                <CheckCircle2 className="h-4 w-4" />
                Cloturer l&apos;inventaire
              </AppButton>
            </div>
          </AppCard>
        )}

        {/* Liste des colis non inventories : marquage rapide manuel */}
        {isOpen && (
          <AppCard>
            <div className="mb-3 flex items-center justify-between">
              <h3 className="flex items-center gap-2 text-base font-semibold text-gray-900">
                <Package className="h-4 w-4 text-amber-600" />
                Colis non inventories ({uninventoried.length})
              </h3>
              <p className="text-xs text-gray-500">
                Cliquez sur un colis pour le marquer present manuellement (sans scan).
              </p>
            </div>
            {uninventoried.length === 0 ? (
              <p className="py-6 text-center text-sm text-gray-400">
                Tous les colis du magasin ont ete inventories.
              </p>
            ) : (
              <div className="max-h-80 overflow-y-auto">
                <table className="w-full text-sm">
                  <thead className="sticky top-0 bg-gray-50 text-left text-xs text-gray-500">
                    <tr>
                      <th className="p-2">Tracking</th>
                      <th className="p-2">Designation</th>
                      <th className="p-2">Categorie</th>
                      <th className="p-2">Client</th>
                      <th className="p-2 text-right"></th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-50">
                    {uninventoried.map((p) => (
                      <tr key={p.id} className="hover:bg-gray-50">
                        <td className="p-2 font-mono text-xs font-bold text-primary-700">{p.trackingNumber}</td>
                        <td className="p-2">{p.designation}</td>
                        <td className="p-2 text-gray-500">{p.category}</td>
                        <td className="p-2 text-gray-500">{p.client?.fullName ?? '-'}</td>
                        <td className="p-2 text-right">
                          <AppButton size="sm" variant="outline" onClick={() => { setManualTarget(p); setManualObservation(''); }}>
                            <Hand className="h-3.5 w-3.5" />
                            Marquer present
                          </AppButton>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </AppCard>
        )}

        <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
          <AppCard>
            <h3 className="flex items-center gap-2 text-base font-semibold text-gray-900 mb-3">
              <CheckCircle2 className="h-4 w-4 text-primary-600" />
              Conformes ({matched.length})
            </h3>
            <ul className="divide-y divide-gray-50">
              {matched.length === 0 && <li className="py-2 text-sm text-gray-400">Aucun colis</li>}
              {matched.map((it) => (
                <li key={it.id} className="py-2 text-sm">
                  <div className="flex items-center gap-2">
                    <p className="font-mono text-xs text-primary-700 font-bold">{it.parcel?.trackingNumber}</p>
                    {it.markedManually && (
                      <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded bg-amber-50 text-amber-700">
                        Manuel (sans scan)
                      </span>
                    )}
                  </div>
                  <p className="text-gray-600">{it.parcel?.designation}</p>
                  {it.observation && (
                    <p className="mt-0.5 text-xs italic text-gray-500">
                      <MessageSquarePlus className="inline h-3 w-3 mr-1" />
                      {it.observation}
                    </p>
                  )}
                </li>
              ))}
            </ul>
          </AppCard>

          <AppCard>
            <h3 className="flex items-center gap-2 text-base font-semibold text-gray-900 mb-3">
              <Package className="h-4 w-4 text-red-600" />
              Manquants ({missing.length})
            </h3>
            <ul className="divide-y divide-gray-50">
              {missing.length === 0 && <li className="py-2 text-sm text-gray-400">Aucun colis</li>}
              {missing.map((it) => (
                <li key={it.id} className="py-2 text-sm">
                  <p className="font-mono text-xs text-red-700 font-bold">{it.parcel?.trackingNumber}</p>
                  <p className="text-gray-600">{it.parcel?.designation}</p>
                </li>
              ))}
            </ul>
          </AppCard>

          <AppCard>
            <h3 className="flex items-center gap-2 text-base font-semibold text-gray-900 mb-3">
              <AlertTriangle className="h-4 w-4 text-amber-600" />
              En plus ({extra.length})
            </h3>
            <ul className="divide-y divide-gray-50">
              {extra.length === 0 && <li className="py-2 text-sm text-gray-400">Aucun colis</li>}
              {extra.map((it) => (
                <li key={it.id} className="py-2 text-sm">
                  <p className="font-mono text-xs text-amber-700 font-bold">{it.parcel?.trackingNumber}</p>
                  <p className="text-gray-600">{it.parcel?.designation}</p>
                  {it.comment && <p className="text-xs text-gray-400 italic">{it.comment}</p>}
                </li>
              ))}
            </ul>
          </AppCard>
        </div>
      </div>

      <ConfirmDialog
        open={showCloseConfirm}
        onClose={() => setShowCloseConfirm(false)}
        onConfirm={handleClose}
        title="Cloturer l'inventaire"
        message={`Confirmer la cloture ? ${counts.missing} colis manquant(s) et ${counts.extra} colis inattendu(s).`}
        confirmLabel="Cloturer"
        loading={closing}
      />

      <QRScannerDialog
        open={showCamera}
        onClose={() => setShowCamera(false)}
        onDetected={(decoded) => {
          setShowCamera(false);
          submitScan(decoded);
        }}
        title="Scanner pour inventorier un colis"
      />

      {/* Marquage manuel sans scan */}
      <AppDialog
        open={!!manualTarget}
        onClose={() => setManualTarget(null)}
        title={manualTarget ? `Marquer present : ${manualTarget.trackingNumber}` : 'Marquage manuel'}
        size="md"
        footer={
          <>
            <AppButton variant="ghost" onClick={() => setManualTarget(null)}>Annuler</AppButton>
            <AppButton onClick={handleManualMark} loading={manualBusy}>
              <Hand className="h-4 w-4" />
              Confirmer (sans scan)
            </AppButton>
          </>
        }
      >
        <div className="space-y-3">
          <div className="rounded-xl bg-amber-50 border border-amber-200 p-3 text-xs text-amber-800">
            Ce colis sera marque present <strong>sans avoir ete scanne</strong>. Il sera flagge
            &quot;Manuel (sans scan)&quot; dans le rapport. Utilisez plutot le scanner si possible.
          </div>
          {manualTarget && (
            <div className="rounded-xl bg-gray-50 p-3">
              <p className="font-mono text-xs font-bold text-primary-700">{manualTarget.trackingNumber}</p>
              <p className="text-sm text-gray-700">{manualTarget.designation}</p>
              <p className="text-xs text-gray-500">
                {manualTarget.client?.fullName} &middot; {manualTarget.category}
              </p>
            </div>
          )}
          <AppInput
            label="Observation (recommandee)"
            placeholder="Pourquoi sans scan ? Etat du colis ?"
            value={manualObservation}
            onChange={(e) => setManualObservation(e.target.value)}
          />
        </div>
      </AppDialog>
    </PageTransition>
  );
}
