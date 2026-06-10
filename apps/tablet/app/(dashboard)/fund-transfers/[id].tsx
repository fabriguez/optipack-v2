import { useState } from 'react';
import { View, Text, ScrollView, Pressable, ActivityIndicator, RefreshControl } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useQuery } from '@tanstack/react-query';
import { formatAmount, formatDateTime } from '@transitsoftservices/shared';
import { Card } from '@/components/ui/Card';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { HeaderAction } from '@/components/data/PageHeader';
import { InfoCard } from '@/components/data/DetailCards';
import { AttachmentsSection } from '@/components/data/AttachmentsSection';
import { AppDialog } from '@/components/forms/AppDialog';
import { ConfirmDialog } from '@/components/ui/ConfirmDialog';
import { usePullRefresh } from '@/lib/hooks/usePullRefresh';
import { fundTransfersApi } from '@/lib/api/finance';
import { toast } from '@/lib/toast';
import { extractApiError } from '@/lib/api/errorMessage';
import { colors } from '@/lib/theme/colors';
import { spacing, radius } from '@/lib/theme/spacing';

const STATUS_VARIANT: Record<string, 'warning' | 'success' | 'error'> = { PENDING: 'warning', CONFIRMED: 'success', VOIDED: 'error' };
const DEST: Record<string, string> = { HQ: 'Siege', BANK: 'Banque', AGENCY: 'Agence' };

export default function FundTransferDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const tId = String(id);
  const router = useRouter();
  const { data, isLoading, refetch } = useQuery({ queryKey: ['fund-transfers', tId], queryFn: () => fundTransfersApi.getById(tId), enabled: !!tId });
  const { refreshing, onRefresh } = usePullRefresh(refetch);
  const [showConfirm, setShowConfirm] = useState(false);
  const [showVoid, setShowVoid] = useState(false);
  const [voidReason, setVoidReason] = useState('');
  const [busy, setBusy] = useState(false);

  const t = data?.data;
  if (isLoading) return <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}><ActivityIndicator size="large" color={colors.primary[500]} /></View>;
  if (!t) return <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', padding: spacing['3xl'] }}><Text style={{ color: colors.gray[500] }}>Transfert introuvable</Text></View>;

  const act = async (fn: () => Promise<unknown>, ok: string, done: () => void) => { setBusy(true); try { await fn(); toast.success(ok); done(); refetch(); } catch (e) { toast.error(extractApiError(e, 'Erreur')); } finally { setBusy(false); } };

  return (
    <View style={{ flex: 1, backgroundColor: 'transparent' }}>
      <ScrollView style={{ flex: 1 }} contentContainerStyle={{ padding: spacing['2xl'], gap: spacing.xl }} refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.primary[500]} />}>
        <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: spacing.lg }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.lg, flex: 1 }}>
            <Pressable onPress={() => router.navigate('/fund-transfers')} style={({ pressed }) => ({ width: 40, height: 40, borderRadius: 12, alignItems: 'center', justifyContent: 'center', backgroundColor: pressed ? colors.gray[100] : 'transparent' })}>
              <Ionicons name="arrow-back" size={22} color={colors.gray[600]} />
            </Pressable>
            <View style={{ flex: 1 }}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.sm, flexWrap: 'wrap' }}>
                <Text style={{ fontSize: 22, fontWeight: '700', color: colors.gray[900] }}>Transfert {t.reference}</Text>
                <Badge variant={STATUS_VARIANT[t.status] ?? 'default'}>{t.status}</Badge>
              </View>
              <Text style={{ fontSize: 13, color: colors.gray[500], marginTop: 2 }}>Cree le {t.createdAt ? formatDateTime(t.createdAt) : '-'}</Text>
            </View>
          </View>
          <View style={{ flexDirection: 'row', gap: spacing.sm }}>
            {t.status === 'PENDING' && <HeaderAction label="Confirmer" icon="checkmark-circle-outline" variant="outline" onPress={() => setShowConfirm(true)} />}
            {t.status !== 'VOIDED' && <HeaderAction label="Annuler" icon="ban-outline" variant="outline" onPress={() => { setVoidReason(''); setShowVoid(true); }} />}
          </View>
        </View>

        {t.isVoided && (
          <View style={{ backgroundColor: '#FFEBEE', borderWidth: 1, borderColor: '#FFCDD2', borderRadius: radius.md, padding: spacing.lg }}>
            <Text style={{ fontSize: 14, fontWeight: '600', color: colors.error }}>Ce transfert a ete annule</Text>
            {!!t.voidReason && <Text style={{ fontSize: 13, color: colors.error, marginTop: 4 }}>Motif : {t.voidReason}</Text>}
          </View>
        )}

        <Card>
          <View style={{ alignItems: 'center', paddingVertical: spacing.lg }}>
            <Text style={{ fontSize: 11, textTransform: 'uppercase', letterSpacing: 0.5, color: colors.gray[400] }}>Montant du transfert</Text>
            <Text style={{ fontSize: 30, fontWeight: '700', color: colors.gray[900], marginTop: 6 }}>{formatAmount(Number(t.amount ?? 0))}</Text>
            <Text style={{ fontSize: 13, color: colors.gray[500], marginTop: 4 }}>Methode: {t.transferMethod ?? '-'}</Text>
          </View>
        </Card>

        {/* Visual source -> dest */}
        <Card>
          <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
            <View style={{ flex: 1, alignItems: 'center', gap: 4 }}>
              <Ionicons name="business" size={24} color={colors.primary[600]} />
              <Text style={{ fontSize: 14, fontWeight: '600', color: colors.gray[900] }}>{t.sourceAgency?.name ?? '-'}</Text>
              <Text style={{ fontSize: 11, color: colors.gray[400] }}>Source</Text>
            </View>
            <Ionicons name="arrow-forward" size={22} color={colors.gray[400]} />
            <View style={{ flex: 1, alignItems: 'center', gap: 4 }}>
              <Ionicons name="business" size={24} color={colors.gray[500]} />
              <Text style={{ fontSize: 14, fontWeight: '600', color: colors.gray[900] }}>{t.destinationAgency?.name ?? DEST[t.destinationType] ?? t.destinationType}</Text>
              <Text style={{ fontSize: 11, color: colors.gray[400] }}>{DEST[t.destinationType] ?? 'Destination'}</Text>
            </View>
          </View>
        </Card>

        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: spacing.md }}>
          <InfoCard icon="person-circle-outline" label="Initie par" value={t.initiatedBy ? `${t.initiatedBy.firstName ?? ''} ${t.initiatedBy.lastName ?? ''}`.trim() : '-'} />
          <InfoCard icon="checkmark-circle-outline" label="Confirme par" value={t.confirmedBy ? `${t.confirmedBy.firstName ?? ''} ${t.confirmedBy.lastName ?? ''}`.trim() : (t.status === 'PENDING' ? 'En attente' : '-')} />
        </View>

        <AttachmentsSection parentType="fund-transfer" parentId={tId} readonly={!!t.isVoided} />
      </ScrollView>

      <ConfirmDialog open={showConfirm} onClose={() => setShowConfirm(false)} onConfirm={() => act(() => fundTransfersApi.confirm(tId), 'Transfert confirme', () => setShowConfirm(false))} title="Confirmer le transfert" message={`Confirmer le transfert de ${formatAmount(Number(t.amount ?? 0))} ? Irreversible.`} confirmLabel="Confirmer le transfert" loading={busy} />

      <AppDialog open={showVoid} onClose={() => setShowVoid(false)} title="Annuler le transfert" width={440}
        footer={<><Button variant="ghost" onPress={() => setShowVoid(false)}>Retour</Button><Button variant="destructive" loading={busy} onPress={() => act(() => fundTransfersApi.void(tId, voidReason || 'Annulation manuelle'), 'Transfert annule', () => setShowVoid(false))}>Confirmer l'annulation</Button></>}>
        <Text style={{ fontSize: 13, color: colors.gray[600] }}>Le transfert sera annule et la caisse source recreditee. Irreversible.</Text>
        <Input label="Motif (optionnel)" value={voidReason} onChangeText={setVoidReason} multiline />
      </AppDialog>
    </View>
  );
}
