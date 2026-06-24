'use client';

import { use, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import {
  ArrowLeft, Package, MapPin, User, Truck, FileText, Clock,
  CreditCard, Edit, History, Warehouse, Route, Printer, ImageIcon, Plus, Trash2,
  Banknote,
} from 'lucide-react';
import { ParcelContainersGraph, ParcelCitiesGraph } from './ParcelGraphs';
import { useQuery } from '@tanstack/react-query';
import { PageTransition } from '@/components/shared/PageTransition';
import { AppCard, AppCardHeader } from '@/components/ui/AppCard';
import { AppButton } from '@/components/ui/AppButton';
import { AppBadge } from '@/components/ui/AppBadge';
import { AppTabs } from '@/components/ui/AppTabs';
import { AppInput } from '@/components/ui/AppInput';
import { StatusBadge } from '@/components/shared/StatusBadge';
import { ParcelStatusContext } from '@/components/shared/ParcelStatusContext';
import { DashboardSkeleton } from '@/components/ui/AppSkeleton';
import { ConfirmDialog } from '@/components/shared/ConfirmDialog';
import {
  useParcel,
  useParcelHistory,
  useParcelImages,
  useAddParcelImage,
  useRemoveParcelImage,
} from '@/lib/hooks/useParcels';
import { apiClient } from '@/lib/api/client';
import { getApiBaseUrl } from '@/lib/api/baseUrl';
import { formatAmount, formatDate, formatDateTime } from '@transitsoftservices/shared';
import { ParcelFormDialog } from '../ParcelFormDialog';
import { PaymentFormDialog } from '../../payments/PaymentFormDialog';
import { ImageInput } from '@/components/shared/ImageInput';
import { AuthedImage } from '@/components/shared/AuthedImage';
import { ImageLightbox } from '@/components/shared/ImageLightbox';
import { uploadImage } from '@/lib/api/uploads';
import { toast } from 'sonner';

interface PricingBreakdown {
  mode: 'weight' | 'volume' | 'max';
  weight: number;
  volume: number | null;
  ratePerKg: number;
  ratePerVolume: number;
  rateSource: 'route' | 'partner';
  partnerPricingId: string | null;
  priceByWeight: number;
  priceByVolume: number;
  basePrice: number;
}

/** Affiche la formule explicite du calcul du prix (transparence). */
function PricingBreakdownDetail({
  breakdown,
  routeName,
}: {
  breakdown: PricingBreakdown;
  routeName: string | null;
}) {
  const sourceLabel =
    breakdown.rateSource === 'partner' ? 'tarif partenaire client' : 'tarif route';
  const fmt = (n: number) => formatAmount(n);
  const wPart = (
    <span className="font-mono">
      {breakdown.weight} kg &times; {fmt(breakdown.ratePerKg)}/kg = <strong>{fmt(breakdown.priceByWeight)}</strong>
    </span>
  );
  const vPart = (
    <span className="font-mono">
      {breakdown.volume} m3 &times; {fmt(breakdown.ratePerVolume)}/m3 = <strong>{fmt(breakdown.priceByVolume)}</strong>
    </span>
  );
  return (
    <span>
      {' '}Detail :{' '}
      {breakdown.mode === 'weight' && wPart}
      {breakdown.mode === 'volume' && vPart}
      {breakdown.mode === 'max' && (
        <>
          max( {wPart} ; {vPart} ) = <strong>{fmt(breakdown.basePrice)}</strong>
        </>
      )}
      .{' '}
      <span className="text-xs text-gray-500">
        ({sourceLabel}
        {routeName ? <> sur la route &laquo; {routeName} &raquo;</> : null})
      </span>
    </span>
  );
}

const STATUS_STEPS = ['IN_STOCK', 'LOADING', 'IN_TRANSIT', 'ARRIVED', 'RECEIVED', 'DELIVERED'];
const STEP_LABELS: Record<string, string> = {
  IN_STOCK: 'En stock', LOADING: 'Chargement', IN_TRANSIT: 'En transit',
  ARRIVED: 'Arrive', RECEIVED: 'Receptionne', DELIVERED: 'Livre',
};

const ACTION_LABELS: Record<string, string> = {
  CREATED: 'Colis cree',
  UPDATED: 'Informations modifiees',
  STATUS_CHANGE_IN_STOCK: 'Mis en stock',
  STATUS_CHANGE_LOADING: 'Charge dans conteneur',
  STATUS_CHANGE_IN_TRANSIT: 'Depart en transit',
  STATUS_CHANGE_ARRIVED: 'Arrive a destination',
  STATUS_CHANGE_RECEIVED: 'Receptionne',
  STATUS_CHANGE_DELIVERED: 'Livre au destinataire',
  WAREHOUSE_TRANSFER: 'Transfert de magasin',
  WAREHOUSE_REMOVE: 'Retire du magasin',
  LOADED_INTO_CONTAINER: 'Charge dans conteneur',
  CONTAINER_DEPARTED: 'Conteneur parti',
  CONTAINER_ARRIVED: 'Conteneur arrive',
  UNLOADED_RECEIVED: 'Decharge - recu',
  UNLOADED_NOT_FOUND: 'Decharge - non trouve',
  UNLOADED_MODIFIED: 'Decharge - modifie',
  IMAGE_ADDED: 'Image ajoutee',
  IMAGE_REMOVED: 'Image retiree',
  // Evenements financiers : injectes cote API en fusionnant les paiements,
  // factures et dettes liees au colis dans le meme flux d'historique.
  INVOICE_GENERATED: 'Facture generee',
  PAYMENT_RECORDED: 'Paiement enregistre',
  PAYMENT_VOIDED: 'Paiement annule',
  DEBT_OPENED: 'Dette ouverte',
};

export default function ParcelDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const router = useRouter();
  const { data, isLoading } = useParcel(id);
  const { data: historyData } = useParcelHistory(id);
  const { data: imagesData } = useParcelImages(id);
  const addImage = useAddParcelImage(id);
  const removeImage = useRemoveParcelImage(id);

  const [editOpen, setEditOpen] = useState(false);
  const [paymentOpen, setPaymentOpen] = useState(false);
  const [imageCaption, setImageCaption] = useState('');
  const [imageUploading, setImageUploading] = useState(false);
  const [imageToDelete, setImageToDelete] = useState<string | null>(null);
  const [lightboxIndex, setLightboxIndex] = useState<number | null>(null);

  const API_BASE = getApiBaseUrl();

  const parcel = data?.data;
  const history = historyData?.data || [];
  const images = imagesData?.data || [];

  // Frais de magasinage : calcules cote backend (jours en stock - jours gratuits)
  // x tarif journalier du magasin courant. Applicable seulement si le colis
  // est issu d'un dechargement de conteneur.
  const { data: storageFeeData } = useQuery({
    queryKey: ['parcels', id, 'storage-fee'],
    queryFn: () => apiClient.get(`/parcels/${id}/storage-fee`).then((r) => r.data?.data),
    enabled: !!parcel,
    staleTime: 60_000,
  });
  const fee = storageFeeData as
    | {
        applicable: boolean;
        reason?: string;
        daysInWarehouse: number;
        freeDays: number;
        chargeableDays: number;
        dailyRate: number;
        totalFee: number;
        enteredAt: string | null;
        warehouseName: string | null;
      }
    | undefined;

  const handlePrintLabel = async () => {
    try {
      const res = await apiClient.get(`/parcels/${id}/label`, { responseType: 'blob' });
      const blob = new Blob([res.data], { type: 'application/pdf' });
      const url = window.URL.createObjectURL(blob);
      window.open(url, '_blank');
    } catch {
      window.open(`${API_BASE}/parcels/${id}/label`, '_blank');
    }
  };

  const handleAddImageFile = async (file: File) => {
    setImageUploading(true);
    try {
      const uploaded = await uploadImage(file);
      await addImage.mutateAsync({ url: uploaded.url, caption: imageCaption.trim() || undefined });
      setImageCaption('');
    } catch (e: any) {
      toast.error(e?.response?.data?.message || "Echec de l'ajout de l'image");
    } finally {
      setImageUploading(false);
    }
  };

  if (isLoading) return <DashboardSkeleton />;
  if (!parcel) return <p className="p-6 text-gray-500">Colis introuvable</p>;

  const currentStep = STATUS_STEPS.indexOf(parcel.status);

  const pesee = parcel.weight && Number(parcel.weight) > 0
    ? `${Number(parcel.weight).toFixed(1)} kg`
    : parcel.volume && Number(parcel.volume) > 0
      ? `${Number(parcel.volume).toFixed(2)} m3`
      : '-';

  const infoTab = (
    <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
      <AppCard className="lg:col-span-2">
        <AppCardHeader title="Informations du colis" />
        <div className="grid grid-cols-2 gap-3">
          <InfoRow icon={Package} label="Designation" value={parcel.designation} />
          <InfoRow icon={Package} label="Pesee" value={pesee} />
          <InfoRow icon={MapPin} label="Agence de depart" value={parcel.warehouse?.agency?.name || parcel.origin || '-'} />
          <InfoRow icon={MapPin} label="Agence d'arrivee" value={parcel.destinationAgency?.name || parcel.destination || '-'} />
          <LinkRow icon={User} label="Client" value={parcel.client?.fullName || '-'} href={parcel.client ? `/clients/${parcel.client.id}` : undefined} />
          <LinkRow icon={User} label="Destinataire" value={parcel.recipient?.fullName || '-'} href={undefined} />
          <LinkRow icon={Warehouse} label="Magasin" value={parcel.warehouse?.name || '-'} href={parcel.warehouse ? `/warehouses/${parcel.warehouse.id}` : undefined} />
          <LinkRow icon={Route} label="Route" value={parcel.transitRoute?.name || '-'} href={undefined} />
          <InfoRow icon={Clock} label="Enregistre le" value={formatDate(parcel.createdAt)} />
          <InfoRow icon={Clock} label="Arrive le" value={parcel.arrivalDate ? formatDate(parcel.arrivalDate) : '-'} />
        </div>
        {parcel.observation && (
          <div className="mt-4 rounded-xl bg-gray-50 p-3">
            <p className="text-xs font-medium text-gray-500 mb-1">Observation</p>
            <p className="text-sm text-gray-700">{parcel.observation}</p>
          </div>
        )}
      </AppCard>

      <div className="space-y-6">
        <AppCard>
          <AppCardHeader title="Facture" />
          {parcel.invoice ? (
            <div className="space-y-3">
              <Row label="Reference" value={parcel.invoice.reference} mono />
              <Row label="Montant" value={formatAmount(Number(parcel.price))} bold />
              <Row label="Statut">
                <StatusBadge status={parcel.invoice.status} type="invoice" />
              </Row>
              <div className="pt-3 border-t border-gray-100 space-y-2">
                <Link href={`/invoices/${parcel.invoice.id}`}>
                  <AppButton variant="outline" className="w-full" size="sm">
                    <FileText className="h-4 w-4" />
                    Voir la facture
                  </AppButton>
                </Link>
                {parcel.invoice.status !== 'PAID' && parcel.status !== 'LOST' && (
                  // Ouvre le dialog directement plutot que de rediriger vers
                  // la page /payments. La facture est pre-fixee et grisee dans
                  // le formulaire pour eviter toute mauvaise selection.
                  <AppButton
                    className="w-full"
                    size="sm"
                    onClick={() => setPaymentOpen(true)}
                  >
                    <CreditCard className="h-4 w-4" />
                    Enregistrer paiement
                  </AppButton>
                )}
                {parcel.status === 'LOST' && (
                  <p className="rounded-lg bg-red-50 border border-red-200 px-3 py-2 text-xs text-red-700">
                    Colis marque comme non recu (perdu). Aucun paiement ne peut etre enregistre pour ce colis.
                  </p>
                )}
              </div>
            </div>
          ) : (
            <p className="text-sm text-gray-400">Aucune facture</p>
          )}
        </AppCard>

        {parcel.container && (
          <AppCard>
            <AppCardHeader title="Conteneur" />
            <div className="space-y-3">
              <Row label="Designation" value={parcel.container.designation} mono />
              <div className="pt-3 border-t border-gray-100">
                <Link href={`/containers/${parcel.container.id}`}>
                  <AppButton variant="outline" className="w-full" size="sm">
                    <Truck className="h-4 w-4" />
                    Voir le conteneur
                  </AppButton>
                </Link>
              </div>
            </div>
          </AppCard>
        )}

        {/* Frais de magasinage : visible uniquement quand le calcul est applicable
            (colis issu d'un conteneur). On affiche aussi le breakdown pour comprendre
            pourquoi le total est ce qu'il est. */}
        {fee && (
          <AppCard>
            <AppCardHeader
              title="Frais de magasinage"
              description={fee.applicable ? fee.warehouseName ?? undefined : fee.reason}
            />
            {fee.applicable ? (
              <div className="space-y-2">
                <div className="flex items-baseline justify-between rounded-xl bg-primary-50 p-3">
                  <span className="inline-flex items-center gap-2 text-sm text-primary-700">
                    <Banknote className="h-4 w-4" />
                    Total a facturer
                  </span>
                  <span className="text-lg font-bold text-primary-800">
                    {formatAmount(fee.totalFee)}
                  </span>
                </div>
                <Row label="Entree en magasin" value={fee.enteredAt ? formatDate(fee.enteredAt) : '-'} />
                <Row label="Jours en stock" value={String(fee.daysInWarehouse)} />
                <Row label="Jours gratuits" value={String(fee.freeDays)} />
                <Row label="Jours factures" value={String(fee.chargeableDays)} />
                <Row label="Tarif / jour" value={formatAmount(fee.dailyRate)} />
                {fee.dailyRate === 0 && (
                  <p className="rounded-lg bg-amber-50 p-2 text-xs text-amber-800">
                    Le tarif journalier de ce magasin est a 0. Configurez-le dans la fiche magasin pour activer la facturation.
                  </p>
                )}
              </div>
            ) : (
              <p className="text-sm text-gray-500">{fee.reason || 'Non applicable.'}</p>
            )}
          </AppCard>
        )}

        {/* Note explicative des calculs : explique en langage clair comment
            chaque montant a ete obtenu (transparence pour l'utilisateur). */}
        <AppCard>
          <AppCardHeader
            title="Comprendre le calcul"
            description="Detail des montants affiches sur ce colis."
          />
          <ul className="space-y-2 text-sm text-gray-700">
            {/* Bloc transport : utilise le breakdown serveur si dispo (formule
                explicite), fallback texte sinon. */}
            <li className="flex gap-2">
              <span className="mt-1 h-1.5 w-1.5 shrink-0 rounded-full bg-primary-500" />
              <span>
                <strong>Prix du transport</strong> : <strong>{formatAmount(Number(parcel.price ?? 0))}</strong>.
                {parcel.pricingBreakdown ? (
                  <PricingBreakdownDetail
                    breakdown={parcel.pricingBreakdown as any}
                    routeName={parcel.transitRoute?.name ?? null}
                  />
                ) : (
                  <>
                    {' '}Calcule a partir de la {parcel.weight && Number(parcel.weight) > 0 ? <>masse ({Number(parcel.weight).toFixed(1)} kg)</> : parcel.volume && Number(parcel.volume) > 0 ? <>volume ({Number(parcel.volume).toFixed(2)} m3)</> : 'pesee'}{' '}
                    multipliee par le tarif unitaire de la route
                    {parcel.transitRoute?.name && <> &laquo; {parcel.transitRoute.name} &raquo;</>}.
                    {' '}<em>(Detail non disponible : colis cree avant la migration de transparence ; recreez-le ou modifiez-le pour generer le detail.)</em>
                  </>
                )}
              </span>
            </li>
            {fee?.applicable && (
              <li className="flex gap-2">
                <span className="mt-1 h-1.5 w-1.5 shrink-0 rounded-full bg-amber-500" />
                <span>
                  <strong>Frais de magasinage</strong> : <strong>{formatAmount(fee.totalFee)}</strong>.
                  Calcul = (jours en stock <em>{fee.daysInWarehouse}</em> &minus; jours gratuits <em>{fee.freeDays}</em>) &times; tarif journalier <em>{formatAmount(fee.dailyRate)}</em>{' '}
                  = {fee.chargeableDays} jour(s) factures.
                  {fee.dailyRate === 0 && ' Le tarif est a 0 : aucun frais reel applique.'}
                </span>
              </li>
            )}
            {parcel.declaredValue != null && Number(parcel.declaredValue) > 0 && (
              <li className="flex gap-2">
                <span className="mt-1 h-1.5 w-1.5 shrink-0 rounded-full bg-blue-500" />
                <span>
                  <strong>Valeur declaree</strong> : {formatAmount(Number(parcel.declaredValue))}.
                  Sert de reference pour l&apos;assurance ; n&apos;est pas ajoutee au montant facture.
                </span>
              </li>
            )}
            {(parcel.isFragile || parcel.isHazardous) && (
              <li className="flex gap-2">
                <span className="mt-1 h-1.5 w-1.5 shrink-0 rounded-full bg-red-500" />
                <span>
                  <strong>Marquages speciaux</strong> :{' '}
                  {parcel.isHazardous && 'marchandise dangereuse'}
                  {parcel.isHazardous && parcel.isFragile && ' + '}
                  {parcel.isFragile && 'fragile'}
                  . Affiches sur l&apos;etiquette imprimee.
                </span>
              </li>
            )}
            <li className="flex gap-2">
              <span className="mt-1 h-1.5 w-1.5 shrink-0 rounded-full bg-gray-400" />
              <span>
                <strong>Total a payer</strong> :{' '}
                <strong>
                  {formatAmount(Number(parcel.price ?? 0) + (fee?.applicable ? fee.totalFee : 0))}
                </strong>{' '}
                (transport{fee?.applicable ? ' + magasinage' : ''}). Les penalites eventuelles, si applicables, sont calculees
                separement et facturees a la livraison.
              </span>
            </li>
            <li className="flex gap-2">
              <span className="mt-1 h-1.5 w-1.5 shrink-0 rounded-full bg-purple-500" />
              <span>
                <strong>Points fidelite</strong> : la fidelite ne fait <em>plus</em> de remise automatique.
                Les points sont accumules sur le profil client et peuvent etre convertis en remise FCFA
                manuellement (taux configure par l&apos;admin).
              </span>
            </li>
          </ul>
        </AppCard>

        <AppCard>
          <AppCardHeader title="QR Code / Etiquette" />
          <div className="flex flex-col items-center gap-4">
            <div className="rounded-xl border border-gray-100 p-3 bg-white">
              <AuthedImage
                src={`/api/v1/parcels/${id}/qrcode`}
                alt={`QR Code - ${parcel.trackingNumber}`}
                className="h-40 w-40 object-contain"
                fallback={<div className="h-40 w-40 rounded-lg bg-gray-100" />}
              />
            </div>
            <p className="font-mono text-xs text-gray-500">{parcel.trackingNumber}</p>
            <AppButton variant="outline" className="w-full" size="sm" onClick={handlePrintLabel}>
              <Printer className="h-4 w-4" />
              Imprimer etiquette
            </AppButton>
          </div>
        </AppCard>
      </div>
    </div>
  );

  const imagesTab = (
    <AppCard>
      <AppCardHeader title={`Galerie (${images.length} image${images.length > 1 ? 's' : ''})`} />
      <div className="space-y-4">
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <ImageInput
            label="Ajouter une image (drop, fichier ou camera)"
            onFile={handleAddImageFile}
            uploading={imageUploading || addImage.isPending}
            height={160}
            allowClear={false}
            hint="Une fois selectionnee, l'image est uploadee et ajoutee automatiquement"
          />
          <div className="flex flex-col justify-end">
            <AppInput
              label="Legende (appliquee a la prochaine image)"
              value={imageCaption}
              onChange={(e) => setImageCaption(e.target.value)}
              placeholder="Optionnel"
            />
          </div>
        </div>

        {images.length === 0 ? (
          <div className="flex flex-col items-center py-8">
            <ImageIcon className="h-10 w-10 text-gray-300" />
            <p className="mt-2 text-sm text-gray-400">Aucune image</p>
          </div>
        ) : (
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4">
            {images.map((img, idx) => (
              <div key={img.id} className="group relative overflow-hidden rounded-xl border border-gray-100">
                <button
                  type="button"
                  onClick={() => setLightboxIndex(idx)}
                  className="block h-32 w-full cursor-zoom-in"
                  aria-label="Agrandir l'image"
                >
                  <AuthedImage src={img.url} alt={img.caption || 'Image colis'} className="h-32 w-full object-cover transition-transform group-hover:scale-105" />
                </button>
                {img.caption && (
                  <p className="px-2 py-1 text-xs text-gray-600 truncate">{img.caption}</p>
                )}
                <button
                  type="button"
                  onClick={() => setImageToDelete(img.id)}
                  className="absolute right-1 top-1 rounded-lg bg-white/90 p-1.5 opacity-0 shadow-sm transition-opacity hover:bg-red-50 group-hover:opacity-100"
                  aria-label="Supprimer"
                >
                  <Trash2 className="h-4 w-4 text-red-600" />
                </button>
              </div>
            ))}
          </div>
        )}
      </div>
    </AppCard>
  );

  const historyTab = (
    <div className="space-y-4">
      <ParcelContainersGraph history={history} parcel={parcel} />
      <ParcelCitiesGraph history={history} parcel={parcel} />
    <AppCard>
      <AppCardHeader title={`Historique (${history.length} evenement${history.length > 1 ? 's' : ''})`} />
      {history.length === 0 ? (
        <div className="flex flex-col items-center py-8">
          <History className="h-10 w-10 text-gray-300" />
          <p className="mt-2 text-sm text-gray-400">Aucun historique</p>
        </div>
      ) : (
        <div className="relative">
          <div className="absolute left-5 top-2 bottom-2 w-px bg-gray-200" />

          <div className="space-y-0">
            {history.map((entry: any, i: number) => (
              <div key={entry.id} className="relative flex gap-4 py-3">
                <div className="relative z-10 flex h-10 w-10 shrink-0 items-center justify-center">
                  <div className={`h-3 w-3 rounded-full border-2 ${
                    entry.financial
                      ? 'border-amber-500 bg-amber-500'
                      : i === 0
                        ? 'border-primary-500 bg-primary-500'
                        : 'border-gray-300 bg-white'
                  }`} />
                </div>

                <div className={`flex-1 rounded-xl p-3 ${entry.financial ? 'bg-amber-50/60 border border-amber-100' : 'bg-gray-50'}`}>
                  <div className="flex items-center justify-between">
                    <p className="text-sm font-medium text-gray-900 flex items-center gap-1.5">
                      {entry.financial && (
                        <Banknote className="h-3.5 w-3.5 text-amber-600" />
                      )}
                      {ACTION_LABELS[entry.action] || entry.action}
                    </p>
                    <span className="text-xs text-gray-400">{formatDateTime(entry.createdAt)}</span>
                  </div>

                  <div className="mt-1.5 flex flex-wrap items-center gap-2">
                    {entry.statusBefore && entry.statusAfter && entry.statusBefore !== entry.statusAfter && (
                      <div className="flex items-center gap-1.5 text-xs">
                        <AppBadge variant="default">{STEP_LABELS[entry.statusBefore] || entry.statusBefore}</AppBadge>
                        <span className="text-gray-400">→</span>
                        <AppBadge variant="success">{STEP_LABELS[entry.statusAfter] || entry.statusAfter}</AppBadge>
                      </div>
                    )}
                    {entry.user && (
                      <span className="text-xs text-gray-500">
                        par {entry.user.firstName} {entry.user.lastName}
                      </span>
                    )}
                  </div>

                  {entry.comment && (
                    <p className="mt-1.5 text-xs text-gray-500 italic">{entry.comment}</p>
                  )}

                  {entry.metadata && Object.keys(entry.metadata).length > 0 && (
                    <details className="mt-1.5 text-xs text-gray-400">
                      <summary className="cursor-pointer hover:text-gray-600">Details</summary>
                      <pre className="mt-1 overflow-x-auto rounded bg-white p-2 text-[10px]">
                        {JSON.stringify(entry.metadata, null, 2)}
                      </pre>
                    </details>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </AppCard>
    </div>
  );

  return (
    <PageTransition>
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-4">
            <button onClick={() => router.back()} className="rounded-xl p-2 hover:bg-gray-100 transition-colors">
              <ArrowLeft className="h-5 w-5 text-gray-500" />
            </button>
            <div>
              <div className="flex flex-wrap items-center gap-3">
                <h1 className="text-2xl font-bold text-gray-900">{parcel.designation}</h1>
                <StatusBadge status={parcel.status} type="parcel" />
              </div>
              <p className="font-mono text-sm text-primary-600 mt-0.5">{parcel.trackingNumber}</p>
              {/* Texte contextuel selon le statut, avec liens vers magasin /
                  conteneur / agence selon le cas. */}
              <div className="mt-1.5">
                <ParcelStatusContext parcel={parcel} />
              </div>
            </div>
          </div>
          <AppButton variant="outline" onClick={() => setEditOpen(true)}>
            <Edit className="h-4 w-4" />
            Modifier
          </AppButton>
        </div>

        <AppCard>
          <div className="flex items-center justify-between px-2">
            {STATUS_STEPS.map((step, i) => {
              const isCompleted = i <= currentStep;
              const isCurrent = i === currentStep;
              return (
                <div key={step} className="flex flex-1 items-center">
                  <div className="flex flex-col items-center">
                    <div className={`flex h-9 w-9 items-center justify-center rounded-full text-xs font-bold transition-all ${
                      isCompleted ? 'bg-primary-500 text-white' : 'bg-gray-200 text-gray-400'
                    } ${isCurrent ? 'ring-4 ring-primary-100 scale-110' : ''}`}>
                      {i + 1}
                    </div>
                    <span className={`mt-2 text-[10px] font-medium ${isCompleted ? 'text-primary-700' : 'text-gray-400'}`}>
                      {STEP_LABELS[step]}
                    </span>
                  </div>
                  {i < STATUS_STEPS.length - 1 && (
                    <div className={`mx-2 h-0.5 flex-1 rounded-full ${i < currentStep ? 'bg-primary-500' : 'bg-gray-200'}`} />
                  )}
                </div>
              );
            })}
          </div>
        </AppCard>

        <AppTabs
          tabs={[
            { value: 'info', label: 'Informations', icon: <Package className="h-4 w-4" />, content: infoTab },
            { value: 'images', label: `Images (${images.length})`, icon: <ImageIcon className="h-4 w-4" />, content: imagesTab },
            { value: 'history', label: `Historique (${history.length})`, icon: <History className="h-4 w-4" />, content: historyTab },
          ]}
        />
      </div>

      <ParcelFormDialog
        open={editOpen}
        onClose={() => setEditOpen(false)}
        parcel={parcel}
      />

      {parcel.invoice && (
        <PaymentFormDialog
          open={paymentOpen}
          onClose={() => setPaymentOpen(false)}
          invoiceId={parcel.invoice.id}
          parcelTracking={parcel.trackingNumber}
        />
      )}

      <ConfirmDialog
        open={!!imageToDelete}
        onClose={() => setImageToDelete(null)}
        onConfirm={async () => {
          if (imageToDelete) await removeImage.mutateAsync(imageToDelete);
          setImageToDelete(null);
        }}
        title="Supprimer l'image"
        message="Cette action est irreversible."
        confirmLabel="Supprimer"
        variant="destructive"
      />

      <ImageLightbox
        images={images.map((img: any) => ({ url: img.url, caption: img.caption }))}
        index={lightboxIndex}
        onClose={() => setLightboxIndex(null)}
        onIndexChange={setLightboxIndex}
      />
    </PageTransition>
  );
}

function InfoRow({ icon: Icon, label, value }: { icon: any; label: string; value: string }) {
  return (
    <div className="flex items-center gap-3 rounded-xl bg-gray-50 p-3">
      <Icon className="h-4 w-4 text-gray-400 shrink-0" />
      <div>
        <p className="text-[10px] uppercase tracking-wider text-gray-400">{label}</p>
        <p className="text-sm font-medium text-gray-900">{value}</p>
      </div>
    </div>
  );
}

function LinkRow({ icon: Icon, label, value, href }: { icon: any; label: string; value: string; href?: string }) {
  const content = (
    <div className="flex items-center gap-3 rounded-xl bg-gray-50 p-3 transition-colors hover:bg-primary-50/50">
      <Icon className="h-4 w-4 text-gray-400 shrink-0" />
      <div>
        <p className="text-[10px] uppercase tracking-wider text-gray-400">{label}</p>
        <p className={`text-sm font-medium ${href ? 'text-primary-700 underline-offset-2' : 'text-gray-900'}`}>{value}</p>
      </div>
    </div>
  );
  if (href) return <Link href={href}>{content}</Link>;
  return content;
}

function Row({ label, value, mono, bold, children }: { label: string; value?: string; mono?: boolean; bold?: boolean; children?: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between py-2 border-b border-gray-50 last:border-0">
      <span className="text-sm text-gray-500">{label}</span>
      {children || (
        <span className={`text-sm ${mono ? 'font-mono' : ''} ${bold ? 'text-lg font-bold text-primary-700' : 'font-medium text-gray-900'}`}>
          {value}
        </span>
      )}
    </div>
  );
}
