import { useEffect, useState } from 'react';
import { View, Text, Pressable } from 'react-native';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { AppDialog } from '@/components/forms/AppDialog';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { EntityPicker } from '@/components/data/EntityPicker';
import { debtsApi } from '@/lib/api/finance';
import { apiClient } from '@/lib/api/client';
import { searchers } from '@/lib/api/searchers';
import { toast } from '@/lib/toast';
import { extractApiError } from '@/lib/api/errorMessage';
import { colors } from '@/lib/theme/colors';
import { radius, spacing } from '@/lib/theme/spacing';

const TYPES = [{ v: 'CLIENT', l: 'Client' }, { v: 'EMPLOYEE', l: 'Personnel' }, { v: 'CARRIER', l: 'Transporteur' }, { v: 'AGENCY', l: 'Agence' }];
const CATEGORIES = ['FREIGHT', 'CUSTOMS', 'STORAGE', 'DELIVERY', 'TRANSIT', 'PENALTY', 'ADVANCE', 'TRANSPORT', 'SUPPLY', 'FUEL', 'RENT', 'OTHER'];
const PRIORITIES = [{ v: 'LOW', l: 'Faible' }, { v: 'MEDIUM', l: 'Moyenne' }, { v: 'CRITICAL', l: 'Critique' }];

const carrierSearcher = (q: string) => apiClient.get('/carriers', { params: { search: q, limit: 10 } }).then((r) => (r.data?.data ?? []).map((c: any) => ({ value: c.id, label: c.name, sublabel: c.carrierType })));

export function DebtFormDialog({ open, onClose, defaultBucket }: { open: boolean; onClose: () => void; defaultBucket?: 'client' | 'company' }) {
  const qc = useQueryClient();
  const [type, setType] = useState('CLIENT');
  const [agency, setAgency] = useState({ id: '', name: '' });
  const [motif, setMotif] = useState('');
  const [description, setDescription] = useState('');
  const [totalAmount, setTotalAmount] = useState('');
  const [category, setCategory] = useState('OTHER');
  const [priority, setPriority] = useState('MEDIUM');
  const [dueDateFinal, setDueDateFinal] = useState('');
  const [fk, setFk] = useState({ id: '', name: '' });
  const [parcel, setParcel] = useState({ id: '', name: '' });
  const [agencyCharge, setAgencyCharge] = useState({ id: '', name: '' });
  const [creditor, setCreditor] = useState('');

  useEffect(() => {
    if (open) { setType(defaultBucket === 'company' ? 'AGENCY' : 'CLIENT'); setAgency({ id: '', name: '' }); setMotif(''); setDescription(''); setTotalAmount(''); setCategory('OTHER'); setPriority('MEDIUM'); setDueDateFinal(''); setFk({ id: '', name: '' }); setParcel({ id: '', name: '' }); setAgencyCharge({ id: '', name: '' }); setCreditor(''); }
  }, [open, defaultBucket]);

  const chargeSearcher = (q: string) => agency.id ? apiClient.get(`/agencies/${agency.id}/charges`, { params: { search: q } }).then((r) => (r.data?.data?.items ?? r.data?.data ?? []).map((c: any) => ({ value: c.id, label: c.label, sublabel: c.type }))) : Promise.resolve([]);

  const create = useMutation({
    mutationFn: () => debtsApi.create({
      type, agencyId: agency.id, motif, description: description || undefined, totalAmount: Number(totalAmount) || 0,
      dueDateFinal: dueDateFinal || undefined, category, priority,
      ...(type === 'CLIENT' && { clientId: fk.id || undefined, parcelId: parcel.id || undefined }),
      ...(type === 'EMPLOYEE' && { employeeId: fk.id || undefined }),
      ...(type === 'CARRIER' && { carrierId: fk.id || undefined }),
      ...(type === 'AGENCY' && { agencyChargeId: agencyCharge.id || undefined, creditor: creditor || undefined }),
    }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['debts'] }); toast.success('Dette creee'); onClose(); },
    onError: (e) => toast.error(extractApiError(e, 'Erreur')),
  });

  const ready = !!agency.id && motif.trim().length >= 3 && Number(totalAmount) > 0 &&
    (type === 'CLIENT' ? !!fk.id : type === 'EMPLOYEE' ? !!fk.id : type === 'CARRIER' ? !!fk.id : (!!agencyCharge.id || !!creditor.trim()));

  return (
    <AppDialog open={open} onClose={onClose} title="Nouvelle dette" width={620}
      footer={<><Button variant="ghost" onPress={onClose}>Annuler</Button><Button loading={create.isPending} disabled={!ready} onPress={() => create.mutate()}>Creer</Button></>}>
      <Text style={lbl}>Type de dette</Text>
      <View style={{ flexDirection: 'row', gap: spacing.sm, flexWrap: 'wrap' }}>
        {TYPES.map((t) => <Pressable key={t.v} onPress={() => { setType(t.v); setFk({ id: '', name: '' }); }} style={chip(type === t.v)}><Text style={chipTxt(type === t.v)}>{t.l}</Text></Pressable>)}
      </View>

      <View style={{ gap: 4 }}><Text style={lbl}>Agence *</Text><EntityPicker value={agency.id} name={agency.name} onChange={(id, name) => setAgency({ id, name })} searcher={searchers.agencies} queryKey="agencies" placeholder="Agence rattachee..." /></View>

      {/* Type-conditional */}
      <View style={{ backgroundColor: colors.primary[50], borderRadius: radius.md, padding: spacing.md, gap: spacing.sm }}>
        {type === 'CLIENT' && <>
          <View style={{ gap: 4 }}><Text style={lbl}>Client *</Text><EntityPicker value={fk.id} name={fk.name} onChange={(id, name) => setFk({ id, name })} searcher={searchers.clients} queryKey="clients" placeholder="Client..." /></View>
          <View style={{ gap: 4 }}><Text style={lbl}>Colis (optionnel)</Text><EntityPicker value={parcel.id} name={parcel.name} onChange={(id, name) => setParcel({ id, name })} searcher={searchers.parcels} queryKey="parcels" placeholder="Colis lie..." /></View>
        </>}
        {type === 'EMPLOYEE' && <View style={{ gap: 4 }}><Text style={lbl}>Employe *</Text><EntityPicker value={fk.id} name={fk.name} onChange={(id, name) => setFk({ id, name })} searcher={searchers.employees as never} queryKey="employees" placeholder="Employe..." /></View>}
        {type === 'CARRIER' && <View style={{ gap: 4 }}><Text style={lbl}>Transporteur *</Text><EntityPicker value={fk.id} name={fk.name} onChange={(id, name) => setFk({ id, name })} searcher={carrierSearcher} queryKey="carriers-debt" placeholder="Transporteur..." /></View>}
        {type === 'AGENCY' && <>
          <Text style={{ fontSize: 12, color: colors.gray[500] }}>Au moins une charge OU un creancier.</Text>
          <View style={{ gap: 4 }}><Text style={lbl}>Charge (optionnel)</Text><EntityPicker value={agencyCharge.id} name={agencyCharge.name} onChange={(id, name) => setAgencyCharge({ id, name })} searcher={chargeSearcher} queryKey="agency-charges" placeholder="Loyer, eau..." /></View>
          <Input label="Creancier (optionnel)" value={creditor} onChangeText={setCreditor} placeholder="Prestataire, fournisseur..." />
        </>}
      </View>

      <Input label="Motif *" value={motif} onChangeText={setMotif} placeholder="Resume court" />
      <Input label="Description (optionnel)" value={description} onChangeText={setDescription} multiline />
      <View style={{ flexDirection: 'row', gap: spacing.md }}>
        <View style={{ flex: 1 }}><Input label="Montant total *" value={totalAmount} onChangeText={setTotalAmount} keyboardType="decimal-pad" /></View>
        <View style={{ flex: 1 }}><Input label="Echeance finale (AAAA-MM-JJ)" value={dueDateFinal} onChangeText={setDueDateFinal} placeholder="2026-12-31" /></View>
      </View>

      <Text style={lbl}>Categorie</Text>
      <View style={{ flexDirection: 'row', gap: 6, flexWrap: 'wrap' }}>
        {CATEGORIES.map((cv) => <Pressable key={cv} onPress={() => setCategory(cv)} style={chip(category === cv)}><Text style={chipTxt(category === cv)}>{cv}</Text></Pressable>)}
      </View>
      <Text style={lbl}>Priorite</Text>
      <View style={{ flexDirection: 'row', gap: spacing.sm }}>
        {PRIORITIES.map((pv) => <Pressable key={pv.v} onPress={() => setPriority(pv.v)} style={chip(priority === pv.v)}><Text style={chipTxt(priority === pv.v)}>{pv.l}</Text></Pressable>)}
      </View>
    </AppDialog>
  );
}

const lbl = { fontSize: 13, fontWeight: '500' as const, color: colors.gray[700] };
const chip = (a: boolean) => ({ paddingVertical: 6, paddingHorizontal: spacing.md, borderRadius: radius.full, borderWidth: 1, borderColor: a ? colors.primary[400] : colors.gray[300], backgroundColor: a ? colors.primary[50] : colors.white });
const chipTxt = (a: boolean) => ({ fontSize: 12, fontWeight: '600' as const, color: a ? colors.primary[700] : colors.gray[600] });
