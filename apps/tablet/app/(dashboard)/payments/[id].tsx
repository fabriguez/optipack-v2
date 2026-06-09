import { useState } from 'react';
import { View, Text, ScrollView, Pressable, ActivityIndicator, RefreshControl } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useQuery } from '@tanstack/react-query';
import { formatAmount, formatDateTime } from '@transitsoftservices/shared';
import { Badge } from '@/components/ui/Badge';
import { HeaderAction } from '@/components/data/PageHeader';
import { SectionCard, InfoCard } from '@/components/data/DetailCards';
import { ConfirmDialog } from '@/components/ui/ConfirmDialog';
import { usePullRefresh } from '@/lib/hooks/usePullRefresh';
import { useVoidPayment } from '@/lib/hooks/usePayments';
import { paymentsApi } from '@/lib/api/payments';
import { colors } from '@/lib/theme/colors';
import { spacing } from '@/lib/theme/spacing';

const METHOD_LABELS: Record<string, string> = { CASH: 'Especes', MOBILE_MONEY: 'Mobile Money', BANK_TRANSFER: 'Virement', CARD: 'Carte', CHECK: 'Cheque' };

export default function PaymentDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const paymentId = String(id);
  const router = useRouter();
  const { data, isLoading, refetch } = useQuery({ queryKey: ['payments', paymentId], queryFn: () => paymentsApi.getById(paymentId), enabled: !!paymentId });
  const { refreshing, onRefresh } = usePullRefresh(refetch);
  const voidPay = useVoidPayment();
  const [showVoid, setShowVoid] = useState(false);

  const p = data?.data;
  if (isLoading) return <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}><ActivityIndicator size="large" color={colors.primary[500]} /></View>;
  if (!p) return <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', padding: spacing['3xl'] }}><Text style={{ color: colors.gray[500] }}>Paiement introuvable</Text></View>;

  const attachments: any[] = p.attachments ?? [];

  return (
    <View style={{ flex: 1, backgroundColor: 'transparent' }}>
      <ScrollView style={{ flex: 1 }} contentContainerStyle={{ padding: spacing['2xl'], gap: spacing.xl }} refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.primary[500]} />}>
        <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: spacing.lg }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.lg, flex: 1 }}>
            <Pressable onPress={() => router.navigate('/payments')} style={({ pressed }) => ({ width: 40, height: 40, borderRadius: 12, alignItems: 'center', justifyContent: 'center', backgroundColor: pressed ? colors.gray[100] : 'transparent' })}>
              <Ionicons name="arrow-back" size={22} color={colors.gray[600]} />
            </Pressable>
            <View style={{ flex: 1 }}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.sm, flexWrap: 'wrap' }}>
                <Text style={{ fontSize: 22, fontWeight: '700', color: colors.gray[900] }}>{p.reference}</Text>
                <Badge variant={p.isVoided ? 'error' : 'success'}>{p.isVoided ? 'Annule' : 'Valide'}</Badge>
              </View>
              <Text style={{ fontSize: 13, color: colors.gray[500], marginTop: 2 }}>{p.createdAt ? formatDateTime(p.createdAt) : '-'}</Text>
            </View>
          </View>
          <View style={{ flexDirection: 'row', gap: spacing.sm }}>
            {p.invoice?.id && <HeaderAction label="Facture" icon="document-text-outline" variant="outline" onPress={() => router.push(`/invoices/${p.invoice.id}`)} />}
            {!p.isVoided && <HeaderAction label="Annuler" icon="close-circle-outline" variant="outline" onPress={() => setShowVoid(true)} />}
          </View>
        </View>

        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: spacing.md }}>
          <InfoCard icon="cash-outline" label="Montant" value={formatAmount(Number(p.amount ?? 0))} />
          <InfoCard icon="card-outline" label="Mode" value={METHOD_LABELS[p.paymentMethod] ?? p.paymentMethod ?? '-'} />
          <InfoCard icon="business-outline" label="Agence" value={p.agency?.name ?? '-'} />
          <InfoCard icon="person-outline" label="Recu par" value={p.receivedBy ? `${p.receivedBy.firstName ?? ''} ${p.receivedBy.lastName ?? ''}`.trim() : '-'} />
        </View>

        {(p.transactionReference || p.invoice) && (
          <SectionCard title="Details">
            {!!p.invoice && (
              <View style={{ flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 8, borderBottomWidth: 1, borderBottomColor: colors.gray[50] }}>
                <Text style={{ fontSize: 13, color: colors.gray[500] }}>Facture</Text>
                <Text style={{ fontFamily: 'monospace', fontSize: 13, color: colors.primary[700] }}>{p.invoice.reference}</Text>
              </View>
            )}
            {!!p.transactionReference && (
              <View style={{ flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 8 }}>
                <Text style={{ fontSize: 13, color: colors.gray[500] }}>Reference transaction</Text>
                <Text style={{ fontSize: 13, color: colors.gray[900] }}>{p.transactionReference}</Text>
              </View>
            )}
          </SectionCard>
        )}

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

      <ConfirmDialog open={showVoid} onClose={() => setShowVoid(false)} onConfirm={() => voidPay.mutate({ id: paymentId, reason: 'Annulation' }, { onSuccess: () => { setShowVoid(false); refetch(); } })} title="Annuler le paiement" message={`Le paiement ${p.reference} sera annule.`} confirmLabel="Annuler le paiement" variant="destructive" loading={voidPay.isPending} />
    </View>
  );
}
