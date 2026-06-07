import { useEffect, useMemo, useState } from 'react';
import { View, Text, Pressable, Switch } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useRouter } from 'expo-router';
import { formatAmount } from '@transitsoftservices/shared';
import { AppDialog } from '@/components/forms/AppDialog';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { EntityPicker } from '@/components/data/EntityPicker';
import { ScannerDialog } from '@/components/data/ScannerDialog';
import { apiClient } from '@/lib/api/client';
import { searchers } from '@/lib/api/searchers';
import { toast } from '@/lib/toast';
import { extractApiError } from '@/lib/api/errorMessage';
import { colors } from '@/lib/theme/colors';
import { radius, spacing } from '@/lib/theme/spacing';

type Mode = 'weight' | 'volume' | 'both';

const CATEGORIES = [
  { value: 'STANDARD', label: 'Standard' }, { value: 'DOCUMENT', label: 'Document' }, { value: 'FOOD', label: 'Alimentaire' },
  { value: 'ELECTRONICS', label: 'Electronique' }, { value: 'CLOTHING', label: 'Vetements' }, { value: 'OTHER', label: 'Autre' },
];

interface ParcelDraft {
  designation: string;
  trackingFournisseur: string;
  weight: string;
  volume: string;
  category: string;
  declaredValue: string;
  isFragile: boolean;
  isHazardous: boolean;
  recipientId: string;
  recipientName: string;
  destinationAgencyId: string;
  destinationAgencyName: string;
  destinationAddress: string;
  observation: string;
}

const emptyParcel = (): ParcelDraft => ({ designation: '', trackingFournisseur: '', weight: '', volume: '', category: 'STANDARD', declaredValue: '', isFragile: false, isHazardous: false, recipientId: '', recipientName: '', destinationAgencyId: '', destinationAgencyName: '', destinationAddress: '', observation: '' });

export function ParcelGroupFormDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  const qc = useQueryClient();
  const router = useRouter();
  const [clientId, setClientId] = useState({ id: '', name: '' });
  const [warehouseId, setWarehouseId] = useState({ id: '', name: '' });
  const [routeId, setRouteId] = useState({ id: '', name: '' });
  const [label, setLabel] = useState('');
  const [notes, setNotes] = useState('');
  const [parcels, setParcels] = useState<ParcelDraft[]>([emptyParcel()]);
  const [scanIdx, setScanIdx] = useState<number | null>(null);

  useEffect(() => {
    if (open) { setClientId({ id: '', name: '' }); setWarehouseId({ id: '', name: '' }); setRouteId({ id: '', name: '' }); setLabel(''); setNotes(''); setParcels([emptyParcel()]); }
  }, [open]);

  // Mode + prix depuis la route.
  const { data: routeData } = useQuery({ queryKey: ['transit-routes', 'detail', routeId.id], queryFn: () => apiClient.get(`/transit-routes/${routeId.id}`).then((r) => r.data), enabled: !!routeId.id });
  const route = routeData?.data ?? routeData;
  const mode: Mode = route?.type === 'AIR' ? 'weight' : route?.type === 'SEA' ? 'volume' : route?.type === 'LAND' ? 'both' : 'weight';

  const priceOf = (p: ParcelDraft): number => {
    const w = Number(p.weight) || 0; const v = Number(p.volume) || 0;
    const pk = Number(route?.pricePerKg) || 0; const pv = Number(route?.pricePerVolume) || 0;
    const byW = Math.round(w * pk); const byV = Math.round(v * pv);
    return mode === 'weight' ? byW : mode === 'volume' ? byV : Math.max(byW, byV);
  };
  const total = useMemo(() => parcels.reduce((s, p) => s + priceOf(p), 0), [parcels, route, mode]);
  const validCount = parcels.filter((p) => p.designation.trim()).length;
  const sharedReady = !!clientId.id && !!warehouseId.id && !!routeId.id;

  const upd = (i: number, patch: Partial<ParcelDraft>) => setParcels((prev) => prev.map((p, idx) => (idx === i ? { ...p, ...patch } : p)));

  const create = useMutation({
    mutationFn: () => apiClient.post('/parcel-groups', {
      clientId: clientId.id, warehouseId: warehouseId.id, transitRouteId: routeId.id, label: label || undefined, notes: notes || undefined,
      parcels: parcels.filter((p) => p.designation.trim()).map((p) => ({
        designation: p.designation, trackingFournisseur: p.trackingFournisseur || undefined,
        weight: mode !== 'volume' && p.weight ? Number(p.weight) : undefined,
        volume: mode !== 'weight' && p.volume ? Number(p.volume) : undefined,
        warehouseId: warehouseId.id, transitRouteId: routeId.id,
        recipientId: p.recipientId || undefined, destinationAgencyId: p.destinationAgencyId || undefined, destinationAddress: p.destinationAddress || undefined,
        category: p.category, isFragile: p.isFragile, isHazardous: p.isHazardous,
        declaredValue: p.declaredValue ? Number(p.declaredValue) : undefined, observation: p.observation || undefined, price: priceOf(p),
      })),
    }).then((r) => r.data),
    onSuccess: (res: any) => {
      const g = res?.data ?? res;
      toast.success(`Groupe ${g?.reference ?? ''} cree`);
      qc.invalidateQueries({ queryKey: ['parcel-groups'] });
      qc.invalidateQueries({ queryKey: ['parcels'] });
      onClose();
      if (g?.id) router.push(`/parcel-groups/${g.id}`);
    },
    onError: (e) => toast.error(extractApiError(e, 'Erreur')),
  });

  return (
    <AppDialog
      open={open}
      onClose={onClose}
      title="Nouveau groupe de colis"
      description={`Total: ${formatAmount(total)}`}
      width={780}
      footer={
        <>
          <Button variant="ghost" onPress={onClose}>Annuler</Button>
          <Button loading={create.isPending} disabled={!sharedReady || validCount === 0} onPress={() => create.mutate()}>{`Creer le groupe (${validCount})`}</Button>
        </>
      }
    >
      {/* Contexte */}
      <Text style={{ fontSize: 14, fontWeight: '700', color: colors.gray[900] }}>Contexte du groupe</Text>
      <View style={{ flexDirection: 'row', gap: spacing.lg }}>
        <View style={{ flex: 1, gap: 4 }}><Text style={lbl}>Client expediteur *</Text><EntityPicker value={clientId.id} name={clientId.name} onChange={(id, name) => setClientId({ id, name })} searcher={searchers.clients} queryKey="clients" placeholder="Client..." /></View>
        <View style={{ flex: 1, gap: 4 }}><Text style={lbl}>Magasin de depart *</Text><EntityPicker value={warehouseId.id} name={warehouseId.name} onChange={(id, name) => setWarehouseId({ id, name })} searcher={searchers.warehouses} queryKey="warehouses" placeholder="Magasin..." /></View>
      </View>
      <View style={{ flexDirection: 'row', gap: spacing.lg }}>
        <View style={{ flex: 1, gap: 4 }}><Text style={lbl}>Route de transit *</Text><EntityPicker value={routeId.id} name={routeId.name} onChange={(id, name) => setRouteId({ id, name })} searcher={searchers.transitRoutes} queryKey="transit-routes" placeholder="Route..." /></View>
        <View style={{ flex: 1 }}><Input label="Libelle (optionnel)" value={label} onChangeText={setLabel} placeholder="Ex: Envoi du 10 mai" /></View>
      </View>
      <Input label="Notes du groupe (optionnel)" value={notes} onChangeText={setNotes} multiline />

      {/* Colis */}
      <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: spacing.sm }}>
        <Text style={{ fontSize: 14, fontWeight: '700', color: colors.gray[900] }}>Colis du groupe ({parcels.length})</Text>
        <Button size="sm" variant="outline" onPress={() => setParcels((p) => [...p, emptyParcel()])}>+ Ajouter</Button>
      </View>

      {parcels.map((p, i) => (
        <View key={i} style={{ borderWidth: 1, borderColor: colors.gray[200], borderRadius: radius.md, padding: spacing.lg, gap: spacing.md }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
            <Text style={{ fontSize: 13, fontWeight: '700', color: colors.primary[700] }}>Colis {i + 1} — {formatAmount(priceOf(p))}</Text>
            {parcels.length > 1 && <Pressable onPress={() => setParcels((prev) => prev.filter((_, idx) => idx !== i))} hitSlop={8}><Ionicons name="trash-outline" size={18} color={colors.error} /></Pressable>}
          </View>
          <View style={{ flexDirection: 'row', gap: spacing.md }}>
            <View style={{ flex: 1 }}><Input label="Designation" value={p.designation} onChangeText={(v) => upd(i, { designation: v })} /></View>
            <View style={{ flex: 1, flexDirection: 'row', gap: spacing.sm, alignItems: 'flex-end' }}>
              <View style={{ flex: 1 }}><Input label="Tracking fourn." value={p.trackingFournisseur} onChangeText={(v) => upd(i, { trackingFournisseur: v })} autoCapitalize="characters" /></View>
              <Button size="sm" variant="outline" onPress={() => setScanIdx(i)}>Scan</Button>
            </View>
          </View>
          <View style={{ flexDirection: 'row', gap: spacing.md }}>
            {(mode === 'weight' || mode === 'both') && <View style={{ flex: 1 }}><Input label="Masse (kg)" value={p.weight} onChangeText={(v) => upd(i, { weight: v })} keyboardType="decimal-pad" /></View>}
            {(mode === 'volume' || mode === 'both') && <View style={{ flex: 1 }}><Input label="Volume (m³)" value={p.volume} onChangeText={(v) => upd(i, { volume: v })} keyboardType="decimal-pad" /></View>}
            <View style={{ flex: 1 }}><Input label="Valeur declaree" value={p.declaredValue} onChangeText={(v) => upd(i, { declaredValue: v })} keyboardType="decimal-pad" /></View>
          </View>
          <View style={{ flexDirection: 'row', gap: spacing.sm, flexWrap: 'wrap' }}>
            {CATEGORIES.map((cat) => (
              <Pressable key={cat.value} onPress={() => upd(i, { category: cat.value })} style={{ paddingVertical: 6, paddingHorizontal: spacing.md, borderRadius: radius.full, borderWidth: 1, borderColor: p.category === cat.value ? colors.primary[400] : colors.gray[300], backgroundColor: p.category === cat.value ? colors.primary[50] : colors.white }}>
                <Text style={{ fontSize: 12, color: p.category === cat.value ? colors.primary[700] : colors.gray[600] }}>{cat.label}</Text>
              </Pressable>
            ))}
          </View>
          <View style={{ flexDirection: 'row', gap: spacing.xl }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.sm }}><Switch value={p.isFragile} onValueChange={(v) => upd(i, { isFragile: v })} trackColor={{ true: colors.primary[400], false: colors.gray[300] }} thumbColor={colors.white} /><Text style={{ fontSize: 13, color: colors.gray[700] }}>Fragile</Text></View>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.sm }}><Switch value={p.isHazardous} onValueChange={(v) => upd(i, { isHazardous: v })} trackColor={{ true: colors.primary[400], false: colors.gray[300] }} thumbColor={colors.white} /><Text style={{ fontSize: 13, color: colors.gray[700] }}>Dangereux</Text></View>
          </View>
          <View style={{ flexDirection: 'row', gap: spacing.md }}>
            <View style={{ flex: 1, gap: 4 }}><Text style={lbl}>Destinataire</Text><EntityPicker value={p.recipientId} name={p.recipientName} onChange={(id, name) => upd(i, { recipientId: id, recipientName: name })} searcher={searchers.recipients} queryKey="clients" placeholder="Destinataire..." /></View>
            <View style={{ flex: 1, gap: 4 }}><Text style={lbl}>Agence destination</Text><EntityPicker value={p.destinationAgencyId} name={p.destinationAgencyName} onChange={(id, name) => upd(i, { destinationAgencyId: id, destinationAgencyName: name })} searcher={searchers.agencies} queryKey="agencies" placeholder="Agence..." /></View>
          </View>
          <Input label="Adresse precise (optionnel)" value={p.destinationAddress} onChangeText={(v) => upd(i, { destinationAddress: v })} />
          <Input label="Observation (optionnel)" value={p.observation} onChangeText={(v) => upd(i, { observation: v })} multiline />
        </View>
      ))}

      <ScannerDialog open={scanIdx !== null} onClose={() => setScanIdx(null)} onDetected={(code) => { if (scanIdx !== null) upd(scanIdx, { trackingFournisseur: code }); }} title="Scanner le code fournisseur" />
    </AppDialog>
  );
}

const lbl = { fontSize: 13, fontWeight: '500' as const, color: colors.gray[700] };
