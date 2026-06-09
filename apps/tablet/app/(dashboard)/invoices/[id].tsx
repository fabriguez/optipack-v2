import { useState } from 'react';
import { ScrollView, View, Text, ActivityIndicator, Pressable, RefreshControl } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Ionicons } from '@expo/vector-icons';
import { formatAmount, formatDate, formatDateTime } from '@transitsoftservices/shared';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { HeaderAction } from '@/components/data/PageHeader';
import { AppDataTable, type Column } from '@/components/data/AppDataTable';
import { SectionCard, StatCard, InfoCard } from '@/components/data/DetailCards';
import { AppDialog } from '@/components/forms/AppDialog';
import { ConfirmDialog } from '@/components/ui/ConfirmDialog';
import { usePullRefresh } from '@/lib/hooks/usePullRefresh';
import { usePaymentsByInvoice, useVoidPayment } from '@/lib/hooks/usePayments';
import { apiClient } from '@/lib/api/client';
import { downloadAndShare } from '@/lib/api/download';
import { toast } from '@/lib/toast';
import { extractApiError } from '@/lib/api/errorMessage';
import { colors } from '@/lib/theme/colors';
import { spacing } from '@/lib/theme/spacing';
import { PaymentFormDialog } from '../payments/PaymentFormDialog';

const STATUS_VARIANT: Record<string, 'success' | 'warning' | 'error' | 'default'> = { PAID: 'success', PARTIAL: 'warning', UNPAID: 'error', CANCELLED: 'default' };
const METHOD_LABELS: Record<string, string> = { CASH: 'Especes', MOBILE_MONEY: 'Mobile Money', BANK_TRANSFER: 'Virement', CARD: 'Carte', CHECK: 'Cheque' };

export default function InvoiceDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const invoiceId = String(id);
  const router = useRouter();
  const qc = useQueryClient();
  const { data, isLoading, refetch } = useQuery({ queryKey: ['invoices', invoiceId], queryFn: () => apiClient.get(`/invoices/${invoiceId}`).then((r) => r.data), enabled: !!invoiceId });
  const { data: paymentsData } = usePaymentsByInvoice(invoiceId);
  const voidPay = useVoidPayment();
  const { refreshing, onRefresh } = usePullRefresh(async () => { await Promise.all([refetch(), qc.invalidateQueries({ queryKey: ['payments', 'invoice', invoiceId] })]); });

  const [showPay, setShowPay] = useState(false);
  const [showDiscount, setShowDiscount] = useState(false);
  const [discountAmount, setDiscountAmount] = useState('');
  const [discountReason, setDiscountReason] = useState('');
  const [voidTarget, setVoidTarget] = useState<any | null>(null);

  const inv = data?.data;
  const payments: any[] = paymentsData?.data ?? [];

  const discount = useMutation({
    mutationFn: () => apiClient.post(`/invoices/${invoiceId}/discount`, { amount: Number(discountAmount) || 0, reason: discountReason }).then((r) => r.data),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['invoices', invoiceId] }); qc.invalidateQueries({ queryKey: ['invoices'] }); toast.success('Remise enregistree'); setShowDiscount(false); },
    onError: (e) => toast.error(extractApiError(e, 'Erreur')),
  });

  if (isLoading) return <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}><ActivityIndicator size="large" color={colors.primary[500]} /></View>;
  if (!inv) return <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', padding: spacing['3xl'] }}><Text style={{ color: colors.gray[500] }}>Facture introuvable</Text></View>;

  const net = Number(inv.netAmount ?? 0); const paid = Number(inv.paidAmount ?? 0); const balance = Number(inv.balance ?? 0);
  const pct = net > 0 ? Math.min(100, Math.round((paid / net) * 100)) : 0;
  const parcels: any[] = inv.parcels ?? [];
  const isPaid = inv.status === 'PAID';
  const allLost = parcels.length > 0 && parcels.every((p) => p.status === 'LOST');

  const paymentColumns: Column<any>[] = [
    { key: 'reference', label: 'Reference', width: 150, render: (r) => <Text style={{ fontFamily: 'monospace', fontSize: 12, fontWeight: '700', color: colors.primary[700] }}>{r.reference}</Text> },
    { key: 'amount', label: 'Montant', width: 130, align: 'right', render: (r) => <Text style={{ fontSize: 13, fontWeight: '700', color: colors.primary[700] }}>{formatAmount(Number(r.amount ?? 0))}</Text> },
    { key: 'paymentMethod', label: 'Mode', width: 130, render: (r) => <Badge>{METHOD_LABELS[r.paymentMethod] ?? r.paymentMethod}</Badge> },
    { key: 'isVoided', label: 'Statut', width: 100, render: (r) => <Badge variant={r.isVoided ? 'error' : 'success'}>{r.isVoided ? 'Annule' : 'Valide'}</Badge> },
    { key: 'createdAt', label: 'Date', width: 150, render: (r) => <Text style={{ fontSize: 12, color: colors.gray[500] }}>{r.createdAt ? formatDateTime(r.createdAt) : '-'}</Text> },
    { key: 'actions', label: '', width: 60, align: 'center', render: (r) => (
      <View style={{ flexDirection: 'row', gap: 8 }}>
        <Pressable onPress={() => router.push(`/payments/${r.id}`)} hitSlop={6}><Ionicons name="eye-outline" size={18} color={colors.gray[600]} /></Pressable>
        {!r.isVoided && <Pressable onPress={() => setVoidTarget(r)} hitSlop={6}><Ionicons name="close-circle-outline" size={18} color={colors.error} /></Pressable>}
      </View>
    ) },
  ];

  return (
    <View style={{ flex: 1, backgroundColor: 'transparent' }}>
      <ScrollView style={{ flex: 1 }} contentContainerStyle={{ padding: spacing['2xl'], gap: spacing.xl }} refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.primary[500]} />}>
        {/* Header */}
        <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: spacing.lg }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.lg, flex: 1 }}>
            <Pressable onPress={() => router.navigate('/invoices')} style={({ pressed }) => ({ width: 40, height: 40, borderRadius: 12, alignItems: 'center', justifyContent: 'center', backgroundColor: pressed ? colors.gray[100] : 'transparent' })}>
              <Ionicons name="arrow-back" size={22} color={colors.gray[600]} />
            </Pressable>
            <View style={{ flex: 1 }}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.sm, flexWrap: 'wrap' }}>
                <Text style={{ fontSize: 22, fontWeight: '700', color: colors.gray[900] }}>Facture {inv.reference}</Text>
                <Badge variant={STATUS_VARIANT[inv.status] ?? 'default'}>{inv.status}</Badge>
              </View>
              <Text style={{ fontSize: 13, color: colors.gray[500], marginTop: 2 }}>Emise le {inv.issuedAt ? formatDate(inv.issuedAt) : '-'}</Text>
            </View>
          </View>
          <View style={{ flexDirection: 'row', gap: spacing.sm, flexWrap: 'wrap', justifyContent: 'flex-end' }}>
            <HeaderAction label="PDF" icon="document-outline" variant="outline" onPress={() => downloadAndShare(`/invoices/${invoiceId}/pdf`, `facture-${inv.reference}`, 'pdf')} />
            <HeaderAction label="XLSX" icon="grid-outline" variant="outline" onPress={() => downloadAndShare(`/invoices/${invoiceId}/xlsx`, `facture-${inv.reference}`, 'xlsx')} />
            {!isPaid && <HeaderAction label="Remise" icon="pricetag-outline" variant="outline" onPress={() => { setDiscountAmount(String(inv.discount ?? '')); setDiscountReason(''); setShowDiscount(true); }} />}
            {!isPaid && !allLost && <HeaderAction label="Paiement" icon="add" onPress={() => setShowPay(true)} />}
          </View>
        </View>

        {/* Summary */}
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: spacing.md }}>
          <StatCard label="Montant net" value={formatAmount(net)} />
          <StatCard label="Paye" value={formatAmount(paid)} color={colors.primary[600]} />
          <StatCard label="Solde restant" value={formatAmount(balance)} color={balance > 0 ? colors.error : colors.primary[700]} />
          <StatCard label="Progression" value={`${pct}%`} />
        </View>

        {/* Info cards */}
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: spacing.md }}>
          <InfoCard icon="person-outline" label="Client" value={inv.client?.fullName ?? '-'} />
          <InfoCard icon="cube-outline" label="Colis" value={String(parcels.length)} />
          <InfoCard icon="business-outline" label="Agence" value={inv.agency?.name ?? '-'} />
        </View>

        {/* Lost alert */}
        {parcels.some((p) => p.status === 'LOST') && (
          <View style={{ backgroundColor: allLost ? '#FFEBEE' : '#FFF8E1', borderRadius: 12, padding: spacing.md, borderWidth: 1, borderColor: allLost ? '#FFCDD2' : '#FFE082' }}>
            <Text style={{ fontSize: 13, color: allLost ? colors.error : '#8D6E00' }}>
              {allLost ? 'Tous les colis sont marques perdus. Aucun paiement possible.' : `${parcels.filter((p) => p.status === 'LOST').length}/${parcels.length} colis marque(s) perdu(s). Paiements restent autorises.`}
            </Text>
          </View>
        )}

        {/* Parcels */}
        <SectionCard title={`Detail des colis (${parcels.length})`}>
          {parcels.map((p) => (
            <Pressable key={p.id} onPress={() => router.push(`/parcels/${p.id}`)} style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: colors.gray[50] }}>
              <View style={{ flex: 1 }}>
                <Text style={{ fontFamily: 'monospace', fontSize: 12, fontWeight: '700', color: colors.primary[700] }}>{p.trackingNumber}</Text>
                <Text style={{ fontSize: 13, color: colors.gray[600] }}>{p.designation}{p.destination ? ` · ${p.destination}` : ''}</Text>
              </View>
              <Text style={{ fontSize: 13, fontWeight: '600' }}>{formatAmount(Number(p.price ?? 0))}</Text>
            </Pressable>
          ))}
        </SectionCard>

        {/* Billing */}
        <SectionCard title="Details de facturation">
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: spacing.md }}>
            <StatCard label="Montant brut" value={formatAmount(Number(inv.totalAmount ?? 0))} />
            <StatCard label="Remise" value={formatAmount(Number(inv.discount ?? 0))} />
            <StatCard label="TVA" value={formatAmount(Number(inv.tva ?? 0))} />
            {Number(inv.storageFeesTotal ?? 0) > 0 && <StatCard label="Frais magasinage" value={formatAmount(Number(inv.storageFeesTotal))} />}
          </View>
        </SectionCard>

        {/* Payments */}
        <SectionCard title={`Paiements (${payments.length})`} action={!isPaid && !allLost ? <Button size="sm" onPress={() => setShowPay(true)}>Enregistrer</Button> : undefined}>
          <AppDataTable columns={paymentColumns} data={payments} emptyMessage="Aucun paiement" />
        </SectionCard>
      </ScrollView>

      <PaymentFormDialog open={showPay} onClose={() => setShowPay(false)} invoiceId={invoiceId} />

      <AppDialog open={showDiscount} onClose={() => setShowDiscount(false)} title="Appliquer une remise" width={440}
        footer={<><Button variant="ghost" onPress={() => setShowDiscount(false)}>Annuler</Button><Button loading={discount.isPending} disabled={Number(discountAmount) > Number(inv.totalAmount ?? 0)} onPress={() => discount.mutate()}>Enregistrer</Button></>}>
        <Text style={{ fontSize: 13, color: colors.gray[500] }}>Montant brut: {formatAmount(Number(inv.totalAmount ?? 0))} · Remise actuelle: {formatAmount(Number(inv.discount ?? 0))}</Text>
        <Input label="Remise" value={discountAmount} onChangeText={setDiscountAmount} keyboardType="decimal-pad" />
        <Input label="Raison" value={discountReason} onChangeText={setDiscountReason} placeholder="Geste commercial, erreur tarif..." multiline />
      </AppDialog>

      <ConfirmDialog open={!!voidTarget} onClose={() => setVoidTarget(null)} onConfirm={() => voidTarget && voidPay.mutate({ id: voidTarget.id, reason: 'Annulation' }, { onSuccess: () => { setVoidTarget(null); refetch(); } })} title="Annuler le paiement" message={`Paiement ${voidTarget?.reference ?? ''} sera annule.`} confirmLabel="Annuler le paiement" variant="destructive" loading={voidPay.isPending} />
    </View>
  );
}
