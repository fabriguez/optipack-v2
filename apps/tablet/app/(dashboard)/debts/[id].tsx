import { useState } from 'react';
import { View, Text, ScrollView, Pressable, ActivityIndicator, RefreshControl } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useQuery } from '@tanstack/react-query';
import { formatAmount, formatDate, formatDateTime } from '@transitsoftservices/shared';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { HeaderAction } from '@/components/data/PageHeader';
import { SectionCard, StatCard, InfoCard } from '@/components/data/DetailCards';
import { AttachmentsSection } from '@/components/data/AttachmentsSection';
import { AppDialog } from '@/components/forms/AppDialog';
import { usePullRefresh } from '@/lib/hooks/usePullRefresh';
import { debtsApi } from '@/lib/api/finance';
import { toast } from '@/lib/toast';
import { extractApiError } from '@/lib/api/errorMessage';
import { colors } from '@/lib/theme/colors';
import { spacing, radius } from '@/lib/theme/spacing';
import { DebtPaymentDialog } from './DebtPaymentDialog';
import { AdjustDebtDialog } from './AdjustDebtDialog';
import { STATUS_VARIANT, STATUS_LABEL, TYPE_LABEL } from './index';

function tierName(d: any): string {
  return d.client?.fullName ?? d.employee?.fullName ?? d.carrier?.name ?? d.agencyCharge?.label ?? d.creditor ?? d.agency?.name ?? '-';
}

export default function DebtDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const dId = String(id);
  const router = useRouter();
  const { data, isLoading, refetch } = useQuery({ queryKey: ['debts', dId], queryFn: () => debtsApi.getById(dId), enabled: !!dId });
  const { refreshing, onRefresh } = usePullRefresh(refetch);
  const [showPay, setShowPay] = useState(false);
  const [showAdjust, setShowAdjust] = useState(false);
  const [showVoid, setShowVoid] = useState(false);
  const [voidReason, setVoidReason] = useState('');
  const [voiding, setVoiding] = useState(false);

  const d = data?.data;
  if (isLoading) return <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}><ActivityIndicator size="large" color={colors.primary[500]} /></View>;
  if (!d) return <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', padding: spacing['3xl'] }}><Text style={{ color: colors.gray[500] }}>Dette introuvable</Text></View>;

  const total = Number(d.totalAmount ?? 0), paid = Number(d.paidAmount ?? 0), remaining = Number(d.remainingAmount ?? 0);
  const pct = total > 0 ? Math.min(100, Math.round((paid / total) * 100)) : 0;
  const canAct = d.status !== 'CANCELLED' && d.status !== 'CLEARED';
  const payments: any[] = d.payments ?? [];
  const histories: any[] = d.histories ?? [];
  const timeline = [
    ...payments.map((p) => ({ kind: 'payment' as const, at: p.createdAt, data: p })),
    ...histories.map((h) => ({ kind: 'history' as const, at: h.createdAt, data: h })),
  ].sort((a, b) => new Date(b.at).getTime() - new Date(a.at).getTime());

  const doVoid = async () => {
    if (voidReason.trim().length < 5) { toast.error('Motif requis (min 5)'); return; }
    setVoiding(true);
    try { await debtsApi.void(dId, voidReason); toast.success('Dette annulee'); setShowVoid(false); refetch(); }
    catch (e) { toast.error(extractApiError(e, 'Erreur')); } finally { setVoiding(false); }
  };

  return (
    <View style={{ flex: 1, backgroundColor: 'transparent' }}>
      <ScrollView style={{ flex: 1 }} contentContainerStyle={{ padding: spacing['2xl'], gap: spacing.xl }} refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.primary[500]} />}>
        <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: spacing.lg }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.lg, flex: 1 }}>
            <Pressable onPress={() => router.navigate('/debts')} style={({ pressed }) => ({ width: 40, height: 40, borderRadius: 12, alignItems: 'center', justifyContent: 'center', backgroundColor: pressed ? colors.gray[100] : 'transparent' })}>
              <Ionicons name="arrow-back" size={22} color={colors.gray[600]} />
            </Pressable>
            <View style={{ flex: 1 }}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.sm, flexWrap: 'wrap' }}>
                <Text style={{ fontSize: 22, fontWeight: '700', color: colors.gray[900] }}>Dette</Text>
                <Badge variant={STATUS_VARIANT[d.status] ?? 'default'}>{STATUS_LABEL[d.status] ?? d.status}</Badge>
                <Badge>{TYPE_LABEL[d.type] ?? d.type}</Badge>
              </View>
              <Text style={{ fontFamily: 'monospace', fontSize: 12, color: colors.gray[400], marginTop: 2 }}>{d.reference} · {d.motif}</Text>
            </View>
          </View>
          {canAct && (
            <View style={{ flexDirection: 'row', gap: spacing.sm, flexWrap: 'wrap', justifyContent: 'flex-end' }}>
              <HeaderAction label="Paiement" icon="card-outline" onPress={() => setShowPay(true)} />
              <HeaderAction label="Ajuster" icon="construct-outline" variant="outline" onPress={() => setShowAdjust(true)} />
              <HeaderAction label="Annuler" icon="ban-outline" variant="outline" onPress={() => { setVoidReason(''); setShowVoid(true); }} />
            </View>
          )}
        </View>

        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: spacing.md }}>
          <StatCard label="Montant total" value={formatAmount(total)} />
          <StatCard label="Paye" value={formatAmount(paid)} color={colors.primary[600]} />
          <StatCard label="Restant" value={formatAmount(remaining)} color={colors.error} />
          <StatCard label="Progression" value={`${pct}%`} />
        </View>

        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: spacing.md }}>
          <InfoCard icon="person-outline" label={`Tiers (${TYPE_LABEL[d.type] ?? d.type})`} value={tierName(d)} />
          <InfoCard icon="calendar-outline" label="Prochaine echeance" value={d.nextDueDate ? formatDate(d.nextDueDate) : 'Non definie'} />
          <InfoCard icon="flag-outline" label="Echeance finale" value={d.dueDateFinal ? formatDate(d.dueDateFinal) : 'Non definie'} />
        </View>

        {d.status === 'CANCELLED' && (
          <View style={{ backgroundColor: '#FFEBEE', borderWidth: 1, borderColor: '#FFCDD2', borderRadius: radius.md, padding: spacing.lg }}>
            <Text style={{ fontSize: 14, fontWeight: '600', color: colors.error }}>Dette annulee</Text>
            {!!d.voidReason && <Text style={{ fontSize: 13, color: colors.error, marginTop: 4 }}>{d.voidReason}</Text>}
            {!!d.voidedAt && <Text style={{ fontSize: 12, color: '#E57373', marginTop: 2 }}>Le {formatDateTime(d.voidedAt)}</Text>}
          </View>
        )}

        <SectionCard title={`Historique (${timeline.length})`}>
          {timeline.length === 0 ? <Text style={{ fontSize: 13, color: colors.gray[400], textAlign: 'center', paddingVertical: 20 }}>Aucun evenement</Text> : (
            <View style={{ gap: spacing.md }}>
              {timeline.map((ev, i) => (
                <View key={i} style={{ flexDirection: 'row', gap: spacing.md }}>
                  <View style={{ width: 10, height: 10, borderRadius: 5, marginTop: 4, backgroundColor: ev.kind === 'payment' ? colors.primary[500] : colors.gray[300] }} />
                  <View style={{ flex: 1, paddingBottom: spacing.sm, borderBottomWidth: i < timeline.length - 1 ? 1 : 0, borderBottomColor: colors.gray[50] }}>
                    {ev.kind === 'payment' ? (
                      <>
                        <Text style={{ fontSize: 14, fontWeight: '600', color: colors.primary[700] }}>Paiement {formatAmount(Number(ev.data.amount ?? 0))}{ev.data.isVoided ? ' (annule)' : ''}</Text>
                        <Text style={{ fontSize: 12, color: colors.gray[500] }}>{ev.data.reference ?? ''} · {ev.data.paymentMethod ?? ''}{ev.data.agency?.name ? ` · ${ev.data.agency.name}` : ''}</Text>
                      </>
                    ) : (
                      <>
                        <Text style={{ fontSize: 14, fontWeight: '600', color: colors.gray[900] }}>{ev.data.action}</Text>
                        {!!ev.data.user && <Text style={{ fontSize: 12, color: colors.gray[400] }}>par {ev.data.user.firstName} {ev.data.user.lastName}</Text>}
                      </>
                    )}
                    {!!ev.data.comment && <Text style={{ fontSize: 12, fontStyle: 'italic', color: colors.gray[500] }}>{ev.data.comment}</Text>}
                    <Text style={{ fontSize: 11, color: colors.gray[400], marginTop: 2 }}>{ev.at ? formatDateTime(ev.at) : ''}</Text>
                  </View>
                </View>
              ))}
            </View>
          )}
        </SectionCard>

        <AttachmentsSection parentType="debt" parentId={dId} readonly={d.status === 'CANCELLED'} />
      </ScrollView>

      <DebtPaymentDialog open={showPay} onClose={() => setShowPay(false)} debtId={dId} remainingAmount={remaining} defaultAgencyId={d.agency?.id} onDone={refetch} />
      <AdjustDebtDialog open={showAdjust} onClose={() => setShowAdjust(false)} debtId={dId} currentTotalAmount={total} currentNextDueDate={d.nextDueDate} currentDueDateFinal={d.dueDateFinal} onDone={refetch} />
      <AppDialog open={showVoid} onClose={() => setShowVoid(false)} title="Annuler cette dette" width={440}
        footer={<><Button variant="ghost" onPress={() => setShowVoid(false)}>Retour</Button><Button variant="destructive" loading={voiding} onPress={doVoid}>Annuler la dette</Button></>}>
        <Text style={{ fontSize: 13, color: colors.gray[600] }}>Tracable. La dette reste visible avec statut ANNULEE. Refuse si paiements non annules rattaches.</Text>
        <Input label="Raison (requise, min 5)" value={voidReason} onChangeText={setVoidReason} multiline />
      </AppDialog>
    </View>
  );
}
