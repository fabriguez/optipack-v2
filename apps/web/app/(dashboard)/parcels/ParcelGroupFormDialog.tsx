'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useRouter } from 'next/navigation';
import { apiClient } from '@/lib/api/client';
import { AppDialog } from '@/components/ui/AppDialog';
import { AppInput } from '@/components/ui/AppInput';
import { AppTextarea } from '@/components/ui/AppTextarea';
import { AppButton } from '@/components/ui/AppButton';
import { AppSearchSelect } from '@/components/ui/AppSearchSelect';
import { AppSelect } from '@/components/ui/AppSelect';
import { AppSwitch } from '@/components/ui/AppSwitch';
import { searchers, toSearchOption } from '@/lib/api/searchers';
import { QRScannerDialog } from '@/components/shared/QRScannerDialog';
import { CameraCaptureDialog } from '@/components/shared/ImageInput';
import { scanSound } from '@/lib/utils/scanSound';
import { uploadImage } from '@/lib/api/uploads';
import { parcelsApi } from '@/lib/api/parcels';
import { Plus, Trash2, Package, Camera, ChevronDown, ChevronUp, ImagePlus, X } from 'lucide-react';
import { toast } from 'sonner';

const IMG_MAX_SIZE = 5 * 1024 * 1024;
const IMG_ACCEPTED = ['image/jpeg', 'image/png', 'image/webp', 'image/gif'];

interface PendingImage {
  id: string;
  file: File;
  previewUrl: string;
}

const CATEGORY_OPTIONS = [
  { value: 'STANDARD', label: 'Standard' },
  { value: 'DOCUMENT', label: 'Document' },
  { value: 'FOOD', label: 'Alimentaire' },
  { value: 'ELECTRONICS', label: 'Electronique' },
  { value: 'CLOTHING', label: 'Vetements' },
  { value: 'OTHER', label: 'Autre' },
];

type MassMode = 'weight' | 'volume' | 'both';

interface ParcelInGroup {
  designation: string;
  trackingFournisseur: string;
  massMode: MassMode;
  weight: string;
  volume: string;
  category: string;
  declaredValue: string;
  isFragile: boolean;
  isHazardous: boolean;
  observation: string;
  price: string;
  // Champs propres a chaque colis du groupe (destinataire et adresse de
  // livraison sont specifiques par colis -- on ne peut pas les imposer au
  // niveau du groupe).
  recipientId: string;
  destinationAgencyId: string;
  destinationAddress: string;
  collapsed: boolean;
  images: PendingImage[];
}

function emptyParcel(massMode: MassMode = 'weight'): ParcelInGroup {
  return {
    designation: '',
    trackingFournisseur: '',
    massMode,
    weight: '',
    volume: '',
    category: 'STANDARD',
    declaredValue: '',
    isFragile: false,
    isHazardous: false,
    observation: '',
    price: '0',
    recipientId: '',
    destinationAgencyId: '',
    destinationAddress: '',
    collapsed: false,
    images: [],
  };
}

interface Props {
  open: boolean;
  onClose: () => void;
  defaultAgency?: { id: string; name: string; city?: string | null } | null;
}

/**
 * Formulaire de creation d'un groupe de colis.
 *
 * Principe : les champs CONTEXTE (client, destinataire, route, magasin, agence
 * d'arrivee) sont partages au niveau du groupe ; les caracteristiques propres
 * a chaque colis (designation, masse/volume, categorie, fragile/dangereux,
 * valeur declaree, observation, tracking fournisseur) sont saisies par carte
 * empilee verticalement. Chaque carte peut etre repliee pour garder la vue
 * compacte sur les gros groupes.
 */
export function ParcelGroupFormDialog({ open, onClose, defaultAgency }: Props) {
  const qc = useQueryClient();
  const router = useRouter();

  // Champs partages par tous les colis du groupe.
  // Note metier : un colis n'est plus associe a une agence en propre ;
  // l'agence est derivee par sa relation warehouse -> agency. Au niveau
  // du groupe, on ne demande donc PAS d'agence : juste le magasin de depart.
  // L'agence emettrice du groupe est calculee cote backend depuis
  // `warehouseId.agencyId`.
  // Le destinataire et l'adresse de destination sont PROPRES a chaque colis
  // du groupe (un meme groupe peut livrer plusieurs personnes a plusieurs
  // adresses), donc ils ne figurent pas ici mais sur chaque carte de colis.
  const [clientId, setClientId] = useState<string>('');
  const [warehouseId, setWarehouseId] = useState<string>('');
  const [transitRouteId, setTransitRouteId] = useState<string>('');
  const [label, setLabel] = useState('');
  const [notes, setNotes] = useState('');

  const [parcels, setParcels] = useState<ParcelInGroup[]>([emptyParcel()]);
  // Scan QR : on memorise quel index de colis est en cours de scan.
  const [scanTarget, setScanTarget] = useState<number | null>(null);
  const [contextCollapsed, setContextCollapsed] = useState(false);

  // Charge la route de transit selectionnee pour deriver :
  //  - le `groupMassMode` : AIR -> weight, SEA -> volume, LAND -> both ;
  //  - le tarif (pricePerKg / pricePerVolume) pour calcul auto du prix.
  // L'utilisateur n'a plus a choisir un mode par colis ni a saisir un prix.
  const { data: routeData } = useQuery({
    queryKey: ['transit-route', transitRouteId],
    queryFn: () => apiClient.get(`/transit-routes/${transitRouteId}`).then((r) => r.data?.data),
    enabled: !!transitRouteId,
  });
  const route = routeData as
    | { type: 'AIR' | 'SEA' | 'LAND'; pricePerKg: number | string; pricePerVolume: number | string }
    | undefined;
  const groupMassMode: MassMode | null = useMemo(() => {
    if (!route) return null;
    if (route.type === 'AIR') return 'weight';
    if (route.type === 'SEA') return 'volume';
    return 'both'; // LAND -> les deux acceptes
  }, [route]);

  // Calcule le prix d'un colis selon le mode du groupe et les tarifs route.
  // Si LAND (both), on prend MAX(weight*kg, volume*m3) pour la transparence
  // -- aligne sur la logique de PricingService cote backend (audit fix).
  function computePrice(p: ParcelInGroup): number {
    if (!route) return 0;
    const w = Number(p.weight || 0);
    const v = Number(p.volume || 0);
    const ppk = Number(route.pricePerKg || 0);
    const ppv = Number(route.pricePerVolume || 0);
    if (route.type === 'AIR') return Math.round(w * ppk);
    if (route.type === 'SEA') return Math.round(v * ppv);
    // LAND : on prend le plus grand des deux montants (les deux sont
    // acceptes, le client paie le mode le plus rentable pour l'agence).
    return Math.round(Math.max(w * ppk, v * ppv));
  }

  // Quand la route change, on force le mode de chaque colis pour rester
  // coherent (AIR -> weight, SEA -> volume, LAND -> both). On clear aussi
  // les valeurs incompatibles : si on passe en AIR, le volume est vide.
  useEffect(() => {
    if (!groupMassMode) return;
    setParcels((prev) =>
      prev.map((p) => ({
        ...p,
        massMode: groupMassMode,
        ...(groupMassMode === 'weight' && { volume: '' }),
        ...(groupMassMode === 'volume' && { weight: '' }),
      })),
    );
  }, [groupMassMode]);

  // Recalcule le prix de chaque colis quand la masse/volume ou la route
  // changent. Le prix est en lecture seule pour l'utilisateur.
  useEffect(() => {
    if (!route) return;
    setParcels((prev) =>
      prev.map((p) => {
        const price = computePrice(p);
        return price === Number(p.price) ? p : { ...p, price: String(price) };
      }),
    );
    // computePrice depend de `route` (capturee via closure).
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    route?.type,
    route?.pricePerKg,
    route?.pricePerVolume,
    // Recalcul sur chaque changement masse/volume.
    parcels.map((p) => `${p.weight}|${p.volume}`).join(';'),
  ]);

  useEffect(() => {
    if (!open) {
      // Revoke des previews pour eviter les fuites memoire si l'utilisateur
      // ferme sans submit (les uploads reussis revoquent deja, mais pas les
      // pending non envoyees).
      setParcels((prev) => {
        prev.forEach((p) => p.images.forEach((img) => URL.revokeObjectURL(img.previewUrl)));
        return prev;
      });
      return;
    }
    setClientId('');
    setWarehouseId('');
    setTransitRouteId('');
    setLabel('');
    setNotes('');
    setParcels([emptyParcel()]);
    setScanTarget(null);
  }, [open, defaultAgency]);

  const updateParcel = (i: number, patch: Partial<ParcelInGroup>) =>
    setParcels((prev) => prev.map((p, idx) => (idx === i ? { ...p, ...patch } : p)));

  // Bug fix : on cree un nouveau colis avec le massMode courant du groupe.
  // Sans ca, les colis ajoutes apres le choix de la route gardaient le mode
  // 'weight' par defaut alors que la route etait SEA/LAND -- le useEffect sur
  // groupMassMode ne se redeclenchait pas (la valeur n'avait pas change),
  // donc seuls les colis presents AU MOMENT du changement de route etaient
  // alignes.
  const addParcel = () => setParcels((prev) => [...prev, emptyParcel(groupMassMode ?? 'weight')]);

  const removeParcel = (i: number) => setParcels((prev) => prev.filter((_, idx) => idx !== i));

  const collapseAll = (value: boolean) =>
    setParcels((prev) => prev.map((p) => ({ ...p, collapsed: value })));

  const mutation = useMutation({
    mutationFn: () =>
      apiClient.post('/parcel-groups', {
        clientId,
        // agencyId derive cote backend depuis warehouseId.agencyId (le
        // groupe est emis par l'agence du magasin de depart, plus de
        // selection explicite).
        warehouseId,
        transitRouteId,
        label: label || undefined,
        notes: notes || undefined,
        parcels: parcels
          .filter((p) => p.designation.trim())
          .map((p) => {
            const w = p.massMode !== 'volume' && p.weight ? Number(p.weight) : undefined;
            const v = p.massMode !== 'weight' && p.volume ? Number(p.volume) : undefined;
            return {
              designation: p.designation.trim(),
              trackingFournisseur: p.trackingFournisseur.trim() || undefined,
              weight: w && w > 0 ? w : undefined,
              volume: v && v > 0 ? v : undefined,
              // Contexte du groupe : magasin et route partages.
              warehouseId: warehouseId || undefined,
              transitRouteId: transitRouteId || undefined,
              // Champs PROPRES au colis : destinataire + agence/adresse dest.
              recipientId: p.recipientId || undefined,
              destinationAgencyId: p.destinationAgencyId || undefined,
              destinationAddress: p.destinationAddress || undefined,
              category: p.category,
              isFragile: p.isFragile,
              isHazardous: p.isHazardous,
              declaredValue: p.declaredValue ? Number(p.declaredValue) : undefined,
              observation: p.observation || undefined,
              price: p.price ? Number(p.price) : 0,
            };
          }),
      }),
    onSuccess: async (res) => {
      const group = res.data?.data;
      toast.success(`Groupe ${group?.reference} cree avec ${group?.parcels?.length} colis`);

      // Upload des photos pending pour chaque colis du groupe. L'ordre cote
      // backend est garanti (orderBy createdAt asc dans le findUnique), on
      // match donc par index avec la liste locale `parcels`.
      const validParcels = parcels.filter((p) => p.designation.trim());
      const createdParcels: Array<{ id: string }> = group?.parcels ?? [];
      const withImages = validParcels
        .map((p, idx) => ({ pending: p.images, parcelId: createdParcels[idx]?.id }))
        .filter((x) => x.parcelId && x.pending.length > 0);

      if (withImages.length > 0) {
        const totalToUpload = withImages.reduce((s, x) => s + x.pending.length, 0);
        const t = toast.loading(`Upload de ${totalToUpload} photo(s)...`);
        let uploaded = 0;
        let failed = 0;
        await Promise.all(
          withImages.flatMap((entry) =>
            entry.pending.map(async (img) => {
              try {
                const up = await uploadImage(img.file);
                await parcelsApi.addImage(entry.parcelId!, { url: up.url });
                uploaded += 1;
              } catch {
                failed += 1;
              } finally {
                URL.revokeObjectURL(img.previewUrl);
              }
            }),
          ),
        );
        toast.dismiss(t);
        if (failed > 0) toast.error(`${failed} photo(s) en echec, ${uploaded} reussie(s)`);
        else toast.success(`${uploaded} photo(s) attachee(s)`);
      }

      qc.invalidateQueries({ queryKey: ['parcel-groups'] });
      qc.invalidateQueries({ queryKey: ['parcels'] });
      onClose();
      if (group?.id) router.push(`/parcels?parcelGroupId=${group.id}`);
    },
    onError: (e: any) => toast.error(e?.response?.data?.message || 'Erreur'),
  });

  const total = parcels.reduce((sum, p) => sum + Number(p.price || 0), 0);
  const validCount = parcels.filter((p) => p.designation.trim()).length;
  // Le groupe est pret a etre cree si on a le contexte partage minimal
  // (client + magasin + route). Les destinataires/adresses sont au niveau
  // de chaque colis, donc on ne les exige pas ici.
  const sharedReady = !!clientId && !!warehouseId && !!transitRouteId;

  return (
    <AppDialog
      open={open}
      onClose={onClose}
      title="Nouveau groupe de colis"
      size="xl"
      footer={
        <>
          <AppButton variant="ghost" onClick={onClose}>
            Annuler
          </AppButton>
          <AppButton
            onClick={() => mutation.mutate()}
            loading={mutation.isPending}
            disabled={!sharedReady || validCount === 0}
          >
            <Package className="h-4 w-4" />
            Creer le groupe ({validCount} colis)
          </AppButton>
        </>
      }
    >
      <div className="space-y-5">
        {/* Section 1 : contexte partage */}
        <section className="rounded-2xl border border-primary-100 bg-primary-50/30 p-4">
          <button
            type="button"
            onClick={() => setContextCollapsed((v) => !v)}
            className="mb-3 flex w-full items-center justify-between gap-2 text-left"
          >
            <p className="text-sm font-semibold text-primary-900">
              Contexte du groupe
              <span className="ml-2 text-xs font-normal text-primary-700">
                {contextCollapsed
                  ? sharedReady
                    ? '(defini — cliquer pour modifier)'
                    : '(incomplet — cliquer pour ouvrir)'
                  : '(applique a chaque colis du groupe)'}
              </span>
            </p>
            {contextCollapsed ? (
              <ChevronDown className="h-4 w-4 text-primary-700" />
            ) : (
              <ChevronUp className="h-4 w-4 text-primary-700" />
            )}
          </button>
          {!contextCollapsed && (
          <>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <AppSearchSelect
              label="Client expediteur"
              value={clientId}
              onChange={(v) => setClientId(v ?? '')}
              search={searchers.clients}
              required
              placeholder="Rechercher un client..."
            />
            <AppSearchSelect
              label="Magasin de depart"
              value={warehouseId}
              onChange={(v) => setWarehouseId(v ?? '')}
              search={searchers.warehouses}
              required
              placeholder="Selectionner un magasin"
            />
            <AppSearchSelect
              label="Route de transit"
              value={transitRouteId}
              onChange={(v) => setTransitRouteId(v ?? '')}
              search={(q, l) => searchers.transitRoutes(q, l)}
              required
              placeholder="Selectionner une route"
            />
            <AppInput
              label="Libelle du groupe (optionnel)"
              value={label}
              onChange={(e) => setLabel(e.target.value)}
              placeholder="Ex: Envoi du 10 mai"
            />
          </div>
          <p className="mt-3 text-xs text-primary-700/80">
            Le destinataire et l&apos;adresse de destination sont a renseigner sur chaque colis
            individuel ci-dessous (ils peuvent differer d&apos;un colis a l&apos;autre).
            L&apos;agence emettrice est deduite automatiquement du magasin de depart.
          </p>
          {notes !== '' || true ? (
            <div className="mt-3">
              <AppTextarea
                label="Notes du groupe (optionnel)"
                rows={2}
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                placeholder="Informations communes a tous les colis"
              />
            </div>
          ) : null}
          </>
          )}
        </section>

        {/* Section 2 : colis */}
        <section>
          <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
            <div>
              <p className="text-sm font-semibold">Colis du groupe ({parcels.length})</p>
              <p className="text-xs text-gray-500">
                Total :{' '}
                <span className="font-bold text-primary-700">{total.toLocaleString()} XAF</span>
              </p>
            </div>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => collapseAll(true)}
                className="text-[11px] text-gray-500 hover:underline"
              >
                Tout replier
              </button>
              <button
                type="button"
                onClick={() => collapseAll(false)}
                className="text-[11px] text-gray-500 hover:underline"
              >
                Tout deplier
              </button>
              <AppButton variant="outline" size="sm" onClick={addParcel}>
                <Plus className="h-3.5 w-3.5" />
                Ajouter un colis
              </AppButton>
            </div>
          </div>

          <div className="max-h-[55vh] space-y-3 overflow-y-auto pr-1">
            {parcels.map((p, i) => (
              <ParcelCard
                key={i}
                index={i}
                parcel={p}
                canRemove={parcels.length > 1}
                onChange={(patch) => updateParcel(i, patch)}
                onRemove={() => removeParcel(i)}
                onToggleCollapse={() => updateParcel(i, { collapsed: !p.collapsed })}
                onOpenScanner={() => setScanTarget(i)}
              />
            ))}
          </div>
        </section>
      </div>

      <QRScannerDialog
        open={scanTarget !== null}
        onClose={() => setScanTarget(null)}
        onDetected={(decoded) => {
          if (scanTarget !== null) {
            scanSound.success();
            updateParcel(scanTarget, { trackingFournisseur: decoded });
          }
          setScanTarget(null);
        }}
        title="Scanner le code fournisseur"
      />
    </AppDialog>
  );
}

interface ParcelCardProps {
  index: number;
  parcel: ParcelInGroup;
  canRemove: boolean;
  onChange: (patch: Partial<ParcelInGroup>) => void;
  onRemove: () => void;
  onToggleCollapse: () => void;
  onOpenScanner: () => void;
}

function ParcelCard({
  index,
  parcel,
  canRemove,
  onChange,
  onRemove,
  onToggleCollapse,
  onOpenScanner,
}: ParcelCardProps) {
  const summary = parcel.designation || `Colis ${index + 1}`;

  return (
    <div className="overflow-hidden rounded-2xl border border-gray-200 bg-white">
      <header className="flex items-center justify-between gap-2 border-b border-gray-100 bg-gray-50 px-3 py-2">
        <button
          type="button"
          onClick={onToggleCollapse}
          className="flex flex-1 items-center gap-2 text-left"
        >
          {parcel.collapsed ? (
            <ChevronDown className="h-4 w-4 text-gray-400" />
          ) : (
            <ChevronUp className="h-4 w-4 text-gray-400" />
          )}
          <span className="inline-flex h-6 min-w-6 items-center justify-center rounded-full bg-primary-100 px-2 text-[11px] font-bold text-primary-800">
            {index + 1}
          </span>
          <span className="truncate text-sm font-medium text-gray-800">{summary}</span>
          {parcel.collapsed && (
            <span className="ml-2 text-[11px] text-gray-500">
              {parcel.weight && `${parcel.weight} kg`}
              {parcel.volume && ` ${parcel.volume} m3`}
              {parcel.price !== '0' &&
                parcel.price &&
                ` — ${Number(parcel.price).toLocaleString()} XAF`}
            </span>
          )}
        </button>
        <button
          type="button"
          onClick={onRemove}
          disabled={!canRemove}
          className="rounded-lg p-1.5 text-red-500 hover:bg-red-50 disabled:cursor-not-allowed disabled:opacity-30"
          aria-label="Supprimer le colis"
          title="Supprimer le colis"
        >
          <Trash2 className="h-4 w-4" />
        </button>
      </header>

      {!parcel.collapsed && (
        <div className="space-y-3 p-3">
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <AppInput
              label="Designation"
              value={parcel.designation}
              onChange={(e) => onChange({ designation: e.target.value })}
              placeholder="Ex: Carton de telephones"
            />
            <div className="flex items-end gap-2">
              <div className="flex-1">
                <AppInput
                  label="Tracking fournisseur (optionnel)"
                  value={parcel.trackingFournisseur}
                  onChange={(e) => onChange({ trackingFournisseur: e.target.value })}
                  placeholder="Code du fournisseur"
                />
              </div>
              <button
                type="button"
                onClick={onOpenScanner}
                className="mb-px flex h-11 w-11 shrink-0 items-center justify-center rounded-xl border border-gray-200 bg-white text-gray-500 transition-colors hover:border-primary-300 hover:bg-primary-50 hover:text-primary-700"
                title="Scanner le code"
                aria-label="Scanner le code"
              >
                <Camera className="h-4 w-4" />
              </button>
            </div>
          </div>

          {/* Mode de pesee force par la route du groupe (AIR -> kg seul,
              SEA -> m3 seul, LAND -> les deux). Plus de selecteur par colis. */}
          <div>
            <p className="mb-2 text-xs text-gray-500">
              {parcel.massMode === 'weight'
                ? 'Quantification : masse (la route impose des kg).'
                : parcel.massMode === 'volume'
                  ? 'Quantification : volume (la route impose des m3).'
                  : 'Quantification libre : masse et/ou volume (route terrestre).'}
            </p>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              {(parcel.massMode === 'weight' || parcel.massMode === 'both') && (
                <AppInput
                  label="Masse (kg)"
                  type="number"
                  step="0.1"
                  value={parcel.weight}
                  onChange={(e) => onChange({ weight: e.target.value })}
                />
              )}
              {(parcel.massMode === 'volume' || parcel.massMode === 'both') && (
                <AppInput
                  label="Volume (m3)"
                  type="number"
                  step="0.01"
                  value={parcel.volume}
                  onChange={(e) => onChange({ volume: e.target.value })}
                />
              )}
            </div>
          </div>

          <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
            <AppSelect
              label="Categorie"
              options={CATEGORY_OPTIONS}
              value={parcel.category}
              onValueChange={(v) => onChange({ category: v })}
            />
            <AppInput
              label="Valeur declaree (XAF, optionnel)"
              // Champ libre : pas de type=number, pas de validation, l'utilisateur
              // peut laisser vide. La conversion en number se fait au submit.
              type="text"
              inputMode="decimal"
              placeholder="Optionnel - pour assurance"
              value={parcel.declaredValue}
              onChange={(e) => onChange({ declaredValue: e.target.value })}
            />
            {/* Prix calcule automatiquement depuis (masse|volume) x route.
                Affiche en lecture seule. La valeur est synchronisee dans
                `parcel.price` par un useEffect au niveau du parent. */}
            <AppInput
              label="Prix calcule (XAF)"
              type="text"
              readOnly
              value={Number(parcel.price || 0).toLocaleString('fr-FR')}
              title="Calcule automatiquement depuis la masse / le volume et le tarif de la route"
            />
          </div>

          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <div className="flex items-center justify-between rounded-xl bg-orange-50 p-3">
              <div>
                <p className="text-sm font-medium text-orange-900">Fragile</p>
                <p className="text-xs text-orange-700">Manipulation prudente requise</p>
              </div>
              <AppSwitch
                checked={parcel.isFragile}
                onCheckedChange={(v) => onChange({ isFragile: v })}
              />
            </div>
            <div className="flex items-center justify-between rounded-xl bg-red-50 p-3">
              <div>
                <p className="text-sm font-medium text-red-900">Marchandise dangereuse</p>
                <p className="text-xs text-red-700">Interdite en aerien</p>
              </div>
              <AppSwitch
                checked={parcel.isHazardous}
                onCheckedChange={(v) => onChange({ isHazardous: v })}
              />
            </div>
          </div>

          {/* Destinataire et destination -- specifiques a ce colis. */}
          <div className="rounded-xl bg-gray-50 p-3">
            <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-gray-500">
              Destinataire & livraison de ce colis
            </p>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <AppSearchSelect
                label="Destinataire"
                value={parcel.recipientId || null}
                onChange={(v) => onChange({ recipientId: v ?? '' })}
                search={searchers.recipients}
                placeholder="Selectionner un destinataire (optionnel)"
              />
              <AppSearchSelect
                label="Agence de destination"
                value={parcel.destinationAgencyId || null}
                onChange={(v) => onChange({ destinationAgencyId: v ?? '' })}
                search={searchers.agencies}
                placeholder="Agence d'arrivee"
              />
              <div className="sm:col-span-2">
                <AppInput
                  label="Adresse precise (optionnel)"
                  placeholder="Quartier, rue, point de repere..."
                  value={parcel.destinationAddress}
                  onChange={(e) => onChange({ destinationAddress: e.target.value })}
                />
              </div>
            </div>
          </div>

          <AppTextarea
            label="Observation (optionnel)"
            rows={2}
            value={parcel.observation}
            onChange={(e) => onChange({ observation: e.target.value })}
            placeholder="Notes specifiques a ce colis"
          />

          <ParcelImagesStrip
            images={parcel.images}
            onChange={(next) => onChange({ images: next })}
          />
        </div>
      )}
    </div>
  );
}

/**
 * Strip photos compacte (vignettes 56px) integree a la carte colis. Les photos
 * sont uploadees apres creation du groupe (le parent boucle sur les colis
 * crees et envoie chaque image avec son parcelId).
 */
function ParcelImagesStrip({
  images,
  onChange,
}: {
  images: PendingImage[];
  onChange: (next: PendingImage[]) => void;
}) {
  const inputRef = useRef<HTMLInputElement | null>(null);
  const [cameraOpen, setCameraOpen] = useState(false);

  const validate = (file: File): string | null => {
    if (!IMG_ACCEPTED.includes(file.type)) return `${file.name}: format non supporte`;
    if (file.size > IMG_MAX_SIZE) return `${file.name}: > 5 MB`;
    return null;
  };

  const addFiles = (files: FileList | File[]) => {
    const accepted: PendingImage[] = [];
    for (const f of Array.from(files)) {
      const err = validate(f);
      if (err) {
        toast.error(err);
        continue;
      }
      accepted.push({
        id: `local-${Math.random().toString(36).slice(2, 10)}`,
        file: f,
        previewUrl: URL.createObjectURL(f),
      });
    }
    if (accepted.length > 0) onChange([...images, ...accepted]);
  };

  const remove = (id: string) => {
    const item = images.find((p) => p.id === id);
    if (item) URL.revokeObjectURL(item.previewUrl);
    onChange(images.filter((p) => p.id !== id));
  };

  return (
    <div>
      <div className="mb-1.5 flex items-center justify-between">
        <span className="text-xs font-medium text-gray-600">Photos ({images.length})</span>
        <span className="text-[10px] text-gray-400">JPG/PNG/WEBP, 5 MB max</span>
      </div>
      <div className="flex flex-wrap gap-2">
        {images.map((img) => (
          <div
            key={img.id}
            className="relative h-14 w-14 overflow-hidden rounded-lg border border-primary-300"
          >
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={img.previewUrl} alt="apercu" className="h-full w-full object-cover" />
            <button
              type="button"
              onClick={() => remove(img.id)}
              className="absolute right-0.5 top-0.5 rounded-full bg-red-500 p-0.5 text-white shadow hover:bg-red-600"
              aria-label="Retirer"
            >
              <X className="h-2.5 w-2.5" />
            </button>
          </div>
        ))}
        <button
          type="button"
          onClick={() => inputRef.current?.click()}
          className="flex h-14 w-14 items-center justify-center rounded-lg border-2 border-dashed border-gray-300 text-gray-400 hover:border-primary-400 hover:bg-primary-50/30"
          title="Ajouter un fichier"
        >
          <ImagePlus className="h-4 w-4" />
        </button>
        <button
          type="button"
          onClick={() => setCameraOpen(true)}
          className="flex h-14 w-14 items-center justify-center rounded-lg border-2 border-dashed border-gray-300 text-gray-400 hover:border-primary-400 hover:bg-primary-50/30"
          title="Prendre une photo"
        >
          <Camera className="h-4 w-4" />
        </button>
      </div>
      <input
        ref={inputRef}
        type="file"
        accept={IMG_ACCEPTED.join(',')}
        multiple
        className="hidden"
        onChange={(e) => {
          if (e.target.files?.length) {
            addFiles(e.target.files);
            e.target.value = '';
          }
        }}
      />
      <CameraCaptureDialog
        open={cameraOpen}
        onClose={() => setCameraOpen(false)}
        onCapture={(file) => {
          addFiles([file]);
          setCameraOpen(false);
        }}
        initialFacing="environment"
      />
    </div>
  );
}
