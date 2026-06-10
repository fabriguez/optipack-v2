import { useState } from 'react';
import { View, Text, ScrollView, Pressable, ActivityIndicator, RefreshControl } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useQuery } from '@tanstack/react-query';
import { formatAmount, formatDateTime } from '@transitsoftservices/shared';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { HeaderAction } from '@/components/data/PageHeader';
import { SectionCard } from '@/components/data/DetailCards';
import { AppDialog } from '@/components/forms/AppDialog';
import { usePullRefresh } from '@/lib/hooks/usePullRefresh';
import { useVoidPayment } from '@/lib/hooks/usePayments';
import { paymentsApi } from '@/lib/api/payments';
import { colors } from '@/lib/theme/colors';
import { spacing, radius } from '@/lib/theme/spacing';

const METHOD_LABELS: Record<string, string> = { CASH: 'Especes', MOBILE_MONEY: 'Mobile Money', BANK_TRANSFER: 'Virement', CARD: 'Carte', CHECK: 'Cheque' };

function DetailRow({ label, value, mono, bold }: { label: string; value: string; mono?: boolean; bold?: boolean }) {
  return (
    <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: colors.gray[50] }}>
      <Text style={{ fontSize: 13, color: colors.gray[500] }}>{label}</Text>
      <Text style={{ fontSize: bold ? 16 : 13, fontWeight: bold ? '700' : '500', color: colors.gray[900], fontFamily: mono ? 'monospace' : undefined }}>{value}</Text>
    </View>
  );
}

export default function PaymentDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const paymentId = String(id);
  const router = useRouter();
  const { data, isLoading, refetch } = useQuery({ queryKey: ['payments', paymentId], queryFn: () => paymentsApi.getById(paymentId), enabled: !!paymentId });
  const { refreshing, onRefresh } = usePullRefresh(refetch);
  const voidPay = useVoidPayment();
  const [showVoid, setShowVoid] = useState(false);
  const [voidReason, setVoidReason] = useState('');

  const p = data?.data;
  if (isLoading) return <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}><ActivityIndicator size="large" color={colors.primary[500]} /></View>;
  if (!p) return <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', padding: spacing['3xl'] }}><Text style={{ color: colors.gray[500] }}>Paiement introuvable</Text></View>;

  const attachments: any[] = p.attachments ?? [];

  return (
    <View style={{ flex: 1, backgroundColor: 'transparent' }}>
      <ScrollView style={{ flex: 1 }} contentContainerStyle={{ padding: spacing['2xl'], gap: spacing.xl }} refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.primary[500]} />}>
        {/* Header */}
        <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: spacing.lg }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.lg, flex: 1 }}>
            <Pressable onPress={() => router.navigate('/payments')} style={({ pressed }) => ({ width: 40, height: 40, borderRadius: 12, alignItems: 'center', justifyContent: 'center', backgroundColor: pressed ? colors.gray[100] : 'transparent' })}>
              <Ionicons name="arrow-back" size={22} color={colors.gray[600]} />
            </Pressable>
            <View style={{ flex: 1 }}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.sm, flexWrap: 'wrap' }}>
                <Text style={{ fontSize: 22, fontWeight: '700', color: colors.gray[900] }}>Paiement {p.reference}</Text>
                <Badge variant={p.isVoided ? 'error' : 'success'}>{p.isVoided ? 'Annule' : 'Valide'}</Badge>
              </View>
              <Text style={{ fontSize: 13, color: colors.gray[500], marginTop: 2 }}>{p.createdAt ? formatDateTime(p.createdAt) : '-'}</Text>
            </View>
          </View>
          {!p.isVoided && <HeaderAction label="Annuler le paiement" icon="close-circle-outline" variant="outline" onPress={() => { setVoidReason(''); setShowVoid(true); }} />}
        </View>

        {/* Voided alert */}
        {p.isVoided && (
          <View style={{ backgroundColor: '#FFEBEE', borderWidth: 1, borderColor: '#FFCDD2', borderRadius: radius.md, padding: spacing.lg }}>
            <Text style={{ fontSize: 14, fontWeight: '600', color: colors.error }}>Paiement annule</Text>
            {!!p.voidReason && <Text style={{ fontSize: 13, color: colors.error, marginTop: 4 }}>Motif : {p.voidReason}</Text>}
            {!!p.voidedAt && <Text style={{ fontSize: 12, color: '#E57373', marginTop: 2 }}>Le {formatDateTime(p.voidedAt)}</Text>}
          </View>
        )}

        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: spacing.lg }}>
          {/* Details */}
          <View style={{ flex: 1, minWidth: 320 }}>
            <SectionCard title="Details du paiement">
              <DetailRow label="Reference" value={p.reference} mono />
              <DetailRow label="Montant" value={formatAmount(Number(p.amount ?? 0))} bold />
              <DetailRow label="Mode de paiement" value={METHOD_LABELS[p.paymentMethod] ?? p.paymentMethod ?? '-'} />
              <DetailRow label="Agence encaisseuse" value={p.agency?.name ?? '-'} />
              <DetailRow label="Recu par" value={p.receivedBy ? `${p.receivedBy.firstName ?? ''} ${p.receivedBy.lastName ?? ''}`.trim() : '-'} />
              {Number(p.discount ?? 0) > 0 && <DetailRow label="Remise" value={formatAmount(Number(p.discount))} />}
              {!!p.transactionReference && <DetailRow label="Ref. transaction" value={p.transactionReference} mono />}
            </SectionCard>
          </View>

          {/* Facture associee */}
          <View style={{ flex: 1, minWidth: 320 }}>
            <SectionCard title="Facture associee">
              <DetailRow label="Reference facture" value={p.invoice?.reference ?? '-'} mono />
              {!!p.parcel && <DetailRow label="Colis" value={p.parcel.trackingNumber ?? '-'} mono />}
              <View style={{ marginTop: spacing.md }}>
                <Button variant="outline" disabled={!p.invoice?.id} onPress={() => p.invoice?.id && router.push(`/invoices/${p.invoice.id}`)}>Voir la facture</Button>
              </View>
            </SectionCard>
          </View>
        </View>

        {attachments.length > 0 && (
          <SectionCard title={`Justificatifs (${attachments.length})`}>
            {attachments.map((a, i) => (
              <View key={i} style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.sm, paddingVertical: 8 }}>
                <Ionicons name={a.kind === 'IMAGE' ? 'image-outline' : 'document-outline'} size={18} color={colors.gray[600]} />
                <Text style={{ flex: 1, fontSize: 13, color: colors.gray[700] }} numberOfLines={1}>{a.caption || a.fileName || a.url}</Text>
              </View>
            ))}
          </SectionCard>
        )}
      </ScrollView>

      <AppDialog open={showVoid} onClose={() => setShowVoid(false)} title="Annuler ce paiement" width={440}
        footer={<><Button variant="ghost" onPress={() => setShowVoid(false)}>Retour</Button><Button variant="destructive" loading={voidPay.isPending} onPress={() => voidPay.mutate({ id: paymentId, reason: voidReason || 'Annulation manuelle' }, { onSuccess: () => { setShowVoid(false); refetch(); } })}>Annuler le paiement</Button></>}>
        <Text style={{ fontSize: 13, color: colors.gray[600] }}>Cette action annule le paiement et ajuste le solde de la facture. Irreversible.</Text>
        <Input label="Motif (optionnel)" value={voidReason} onChangeText={setVoidReason} placeholder="Erreur de saisie, double paiement..." multiline />
      </AppDialog>
    </View>
  );
}
