import { useEffect, useState } from 'react';
import { View, Text, Pressable } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useQuery } from '@tanstack/react-query';
import * as DocumentPicker from 'expo-document-picker';
import { formatAmount } from '@transitsoftservices/shared';
import { AppDialog } from '@/components/forms/AppDialog';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { EntityPicker } from '@/components/data/EntityPicker';
import { useRecordPayment } from '@/lib/hooks/usePayments';
import { usePaymentMethods, useCreatePaymentMethod } from '@/lib/hooks/usePaymentMethods';
import { apiClient } from '@/lib/api/client';
import { searchers } from '@/lib/api/searchers';
import { toast } from '@/lib/toast';
import { colors } from '@/lib/theme/colors';
import { radius, spacing } from '@/lib/theme/spacing';

interface Att { url: string; key: string; kind: 'IMAGE' | 'PDF' | 'OTHER'; fileName: string }

const invoiceSearcher = (q: string) =>
  apiClient.get('/invoices', { params: { search: q, limit: 10 } }).then((r) => (r.data?.data ?? [])
    .filter((i: any) => i.status !== 'PAID' && i.status !== 'CANCELLED')
    .map((i: any) => ({ value: i.id, label: `${i.reference} - ${i.client?.fullName ?? ''}`, sublabel: `Solde ${formatAmount(Number(i.balance ?? 0))}` })));

export function PaymentFormDialog({ open, onClose, invoiceId: fixedInvoiceId, parcelTracking }: { open: boolean; onClose: () => void; invoiceId?: string; parcelTracking?: string }) {
  const record = useRecordPayment();
  const { data: methodsData } = usePaymentMethods();
  const createMethod = useCreatePaymentMethod();
  const methods: any[] = (methodsData?.data ?? methodsData ?? []).filter((m: any) => m.isActive !== false);

  const [invoice, setInvoice] = useState({ id: '', name: '' });
  const [agency, setAgency] = useState({ id: '', name: '' });
  const [parcelId, setParcelId] = useState('');
  const [amount, setAmount] = useState('');
  const [method, setMethod] = useState('');
  const [txRef, setTxRef] = useState('');
  const [atts, setAtts] = useState<Att[]>([]);
  const [showNewMethod, setShowNewMethod] = useState(false);
  const [newMethodLabel, setNewMethodLabel] = useState('');
  const [uploading, setUploading] = useState(false);

  const activeInvoiceId = fixedInvoiceId || invoice.id;

  useEffect(() => {
    if (open) { setInvoice({ id: '', name: '' }); setAgency({ id: '', name: '' }); setParcelId(''); setAmount(''); setMethod(''); setTxRef(''); setAtts([]); }
  }, [open]);

  const { data: invData } = useQuery({ queryKey: ['invoices', activeInvoiceId], queryFn: () => apiClient.get(`/invoices/${activeInvoiceId}`).then((r) => r.data), enabled: !!activeInvoiceId });
  const inv = invData?.data;
  const linkedParcels: any[] = inv?.parcels ?? [];

  const addAttachments = async () => {
    try {
      const res = await DocumentPicker.getDocumentAsync({ type: ['image/*', 'application/pdf'], multiple: true, copyToCacheDirectory: true });
      if (res.canceled) return;
      setUploading(true);
      for (const a of res.assets ?? []) {
        const isImage = (a.mimeType ?? '').startsWith('image/');
        const fd = new FormData();
        fd.append('file', { uri: a.uri, name: a.name, type: a.mimeType ?? 'application/octet-stream' } as never);
        const up = await apiClient.post('/uploads/file', fd, { headers: { 'Content-Type': 'multipart/form-data' } }).then((r) => r.data);
        const u = up?.data ?? up;
        if (u?.url) setAtts((prev) => [...prev, { url: u.url, key: u.key ?? '', kind: isImage ? 'IMAGE' : (a.mimeType === 'application/pdf' ? 'PDF' : 'OTHER'), fileName: a.name }]);
      }
    } catch { toast.error('Echec upload'); } finally { setUploading(false); }
  };

  const submit = () => {
    if (!activeInvoiceId) { toast.error('Facture requise'); return; }
    if (!agency.id) { toast.error('Agence requise'); return; }
    if (!(Number(amount) > 0)) { toast.error('Montant invalide'); return; }
    if (!method) { toast.error('Mode requis'); return; }
    record.mutate({
      invoiceId: activeInvoiceId, agencyId: agency.id, parcelId: parcelId || undefined,
      amount: Number(amount), paymentMethod: method, transactionReference: txRef || undefined,
      attachments: atts.length ? atts.map((a) => ({ url: a.url, key: a.key, kind: a.kind })) : undefined,
    } as never, { onSuccess: () => onClose() });
  };

  return (
    <AppDialog
      open={open}
      onClose={onClose}
      title="Enregistrer un paiement"
      width={560}
      footer={<><Button variant="ghost" onPress={onClose}>Annuler</Button><Button loading={record.isPending || uploading} onPress={submit}>Enregistrer</Button></>}
    >
      {fixedInvoiceId ? (
        <View style={{ backgroundColor: colors.gray[50], borderRadius: radius.md, padding: spacing.md }}>
          <Text style={{ fontFamily: 'monospace', fontWeight: '700', color: colors.primary[700] }}>{inv?.reference ?? '...'}</Text>
          <Text style={{ fontSize: 13, color: colors.gray[700] }}>{inv?.client?.fullName ?? ''}{parcelTracking ? ` · ${parcelTracking}` : ''}</Text>
          {!!inv && <Text style={{ fontSize: 12, color: colors.gray[500] }}>Solde {formatAmount(Number(inv.balance ?? 0))}</Text>}
        </View>
      ) : (
        <View style={{ gap: 4 }}>
          <Text style={lbl}>Facture *</Text>
          <EntityPicker value={invoice.id} name={invoice.name} onChange={(id, name) => { setInvoice({ id, name }); setParcelId(''); }} searcher={invoiceSearcher as never} queryKey="invoices-search" placeholder="Rechercher une facture..." />
        </View>
      )}

      {linkedParcels.length > 1 && (
        <View style={{ gap: 4 }}>
          <Text style={lbl}>Colis (optionnel)</Text>
          <View style={{ flexDirection: 'row', gap: spacing.sm, flexWrap: 'wrap' }}>
            <Pressable onPress={() => setParcelId('')} style={chip(parcelId === '')}><Text style={chipTxt(parcelId === '')}>Toute la facture</Text></Pressable>
            {linkedParcels.map((p) => (
              <Pressable key={p.id} onPress={() => setParcelId(p.id)} style={chip(parcelId === p.id)}><Text style={chipTxt(parcelId === p.id)}>{p.trackingNumber}</Text></Pressable>
            ))}
          </View>
        </View>
      )}

      <View style={{ flexDirection: 'row', gap: spacing.lg }}>
        <View style={{ flex: 1, gap: 4 }}><Text style={lbl}>Agence encaisseuse *</Text><EntityPicker value={agency.id} name={agency.name} onChange={(id, name) => setAgency({ id, name })} searcher={searchers.agencies} queryKey="agencies" placeholder="Agence..." /></View>
        <View style={{ flex: 1 }}><Input label="Montant *" value={amount} onChangeText={setAmount} keyboardType="decimal-pad" placeholder="0" /></View>
      </View>

      <View style={{ gap: 4 }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
          <Text style={lbl}>Mode de paiement *</Text>
          <Pressable onPress={() => setShowNewMethod(true)} style={{ flexDirection: 'row', alignItems: 'center', gap: 2 }}><Ionicons name="add" size={14} color={colors.primary[600]} /><Text style={{ fontSize: 12, color: colors.primary[600] }}>Nouveau</Text></Pressable>
        </View>
        <View style={{ flexDirection: 'row', gap: spacing.sm, flexWrap: 'wrap' }}>
          {methods.map((m) => (
            <Pressable key={m.code} onPress={() => setMethod(m.code)} style={chip(method === m.code)}><Text style={chipTxt(method === m.code)}>{m.label}</Text></Pressable>
          ))}
        </View>
      </View>

      <Input label="Reference transaction (optionnel)" value={txRef} onChangeText={setTxRef} placeholder="Ref MoMo, n cheque..." />

      <View style={{ gap: spacing.sm }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
          <Text style={lbl}>Justificatifs</Text>
          <Button size="sm" variant="outline" loading={uploading} onPress={addAttachments}>Ajouter</Button>
        </View>
        {atts.map((a, i) => (
          <View key={i} style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.sm, backgroundColor: colors.gray[50], borderRadius: radius.sm, padding: spacing.sm }}>
            <Ionicons name={a.kind === 'IMAGE' ? 'image-outline' : 'document-outline'} size={16} color={colors.gray[600]} />
            <Text style={{ flex: 1, fontSize: 12, color: colors.gray[700] }} numberOfLines={1}>{a.fileName}</Text>
            <Pressable onPress={() => setAtts((prev) => prev.filter((_, idx) => idx !== i))} hitSlop={6}><Ionicons name="close-circle" size={16} color={colors.error} /></Pressable>
          </View>
        ))}
      </View>

      <AppDialog open={showNewMethod} onClose={() => setShowNewMethod(false)} title="Nouvelle methode" width={400}
        footer={<><Button variant="ghost" onPress={() => setShowNewMethod(false)}>Annuler</Button><Button loading={createMethod.isPending} onPress={() => { const code = newMethodLabel.trim().toUpperCase().replace(/[^A-Z0-9]+/g, '_'); createMethod.mutate({ label: newMethodLabel.trim(), code } as never, { onSuccess: () => { setMethod(code); setNewMethodLabel(''); setShowNewMethod(false); } }); }}>Creer</Button></>}>
        <Input label="Libelle" value={newMethodLabel} onChangeText={setNewMethodLabel} placeholder="Ex: Orange Money" />
      </AppDialog>
    </AppDialog>
  );
}

const lbl = { fontSize: 13, fontWeight: '500' as const, color: colors.gray[700] };
const chip = (a: boolean) => ({ paddingVertical: 7, paddingHorizontal: spacing.lg, borderRadius: radius.full, borderWidth: 1, borderColor: a ? colors.primary[400] : colors.gray[300], backgroundColor: a ? colors.primary[50] : colors.white });
const chipTxt = (a: boolean) => ({ fontSize: 13, fontWeight: '600' as const, color: a ? colors.primary[700] : colors.gray[600] });
