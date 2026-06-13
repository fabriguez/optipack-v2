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
import { SectionCard, InfoCard } from '@/components/data/DetailCards';
import { AttachmentsSection } from '@/components/data/AttachmentsSection';
import { AppDialog } from '@/components/forms/AppDialog';
import { Card } from '@/components/ui/Card';
import { usePullRefresh } from '@/lib/hooks/usePullRefresh';
import { disbursementsApi } from '@/lib/api/finance';
import { MaskedValue, isMasked } from '@/components/ui/MaskedValue';
import { toast } from '@/lib/toast';
import { extractApiError } from '@/lib/api/errorMessage';
import { colors } from '@/lib/theme/colors';
import { spacing, radius } from '@/lib/theme/spacing';

function DRow({ icon, label, value }: { icon: keyof typeof Ionicons.glyphMap; label: string; value?: string | null }) {
  if (!value) return null;
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.md, paddingVertical: 8, borderBottomWidth: 1, borderBottomColor: colors.gray[50] }}>
      <Ionicons name={icon} size={16} color={colors.gray[400]} />
      <Text style={{ fontSize: 13, color: colors.gray[500], width: 120 }}>{label}</Text>
      <Text style={{ flex: 1, fontSize: 13, color: colors.gray[900], fontWeight: '500', textAlign: 'right' }}>{value}</Text>
    </View>
  );
}

export default function DisbursementDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const dId = String(id);
  const router = useRouter();
  const { data, isLoading, refetch } = useQuery({ queryKey: ['disbursements', dId], queryFn: () => disbursementsApi.getById(dId), enabled: !!dId });
  const { refreshing, onRefresh } = usePullRefresh(refetch);
  const [showVoid, setShowVoid] = useState(false);
  const [voidReason, setVoidReason] = useState('');
  const [voiding, setVoiding] = useState(false);

  const d = data?.data;
  if (isLoading) return <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}><ActivityIndicator size="large" color={colors.primary[500]} /></View>;
  if (!d) return <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', padding: spacing['3xl'] }}><Text style={{ color: colors.gray[500] }}>Bon introuvable</Text></View>;

  const doVoid = async () => {
    setVoiding(true);
    try { await disbursementsApi.void(dId, voidReason || 'Annulation manuelle'); toast.success('Annule'); setShowVoid(false); refetch(); }
    catch (e) { toast.error(extractApiError(e, 'Erreur')); } finally { setVoiding(false); }
  };

  return (
    <View style={{ flex: 1, backgroundColor: 'transparent' }}>
      <ScrollView style={{ flex: 1 }} contentContainerStyle={{ padding: spacing['2xl'], gap: spacing.xl }} refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.primary[500]} />}>
        <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: spacing.lg }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.lg, flex: 1 }}>
            <Pressable onPress={() => router.navigate('/disbursements')} style={({ pressed }) => ({ width: 40, height: 40, borderRadius: 12, alignItems: 'center', justifyContent: 'center', backgroundColor: pressed ? colors.gray[100] : 'transparent' })}>
              <Ionicons name="arrow-back" size={22} color={colors.gray[600]} />
            </Pressable>
            <View style={{ flex: 1 }}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.sm, flexWrap: 'wrap' }}>
                <Text style={{ fontSize: 22, fontWeight: '700', color: colors.gray[900] }}>Bon {d.reference}</Text>
                <Badge variant={d.isVoided ? 'error' : 'success'}>{d.isVoided ? 'Annule' : 'Valide'}</Badge>
              </View>
              <Text style={{ fontSize: 13, color: colors.gray[500], marginTop: 2 }}>Emis le {d.createdAt ? formatDateTime(d.createdAt) : '-'}</Text>
            </View>
          </View>
          {!d.isVoided && <HeaderAction label="Annuler" icon="ban-outline" variant="outline" onPress={() => { setVoidReason(''); setShowVoid(true); }} />}
        </View>

        {d.isVoided && (
          <View style={{ backgroundColor: '#FFEBEE', borderWidth: 1, borderColor: '#FFCDD2', borderRadius: radius.md, padding: spacing.lg }}>
            <Text style={{ fontSize: 14, fontWeight: '600', color: colors.error }}>Ce bon a ete annule</Text>
            {!!d.voidReason && <Text style={{ fontSize: 13, color: colors.error, marginTop: 4 }}>Motif : {d.voidReason}</Text>}
            {!!d.voidedAt && <Text style={{ fontSize: 12, color: '#E57373', marginTop: 2 }}>Le {formatDateTime(d.voidedAt)}</Text>}
          </View>
        )}

        <Card>
          <View style={{ alignItems: 'center', paddingVertical: spacing.lg }}>
            <Text style={{ fontSize: 11, textTransform: 'uppercase', letterSpacing: 0.5, color: colors.gray[400] }}>Montant</Text>
            <Text style={{ fontSize: 30, fontWeight: '700', color: colors.error, marginTop: 6 }}>{formatAmount(Number(d.amount ?? 0))}</Text>
            {!!d.amountInWords && <Text style={{ fontSize: 13, fontStyle: 'italic', color: colors.gray[500], marginTop: 4 }}>{d.amountInWords}</Text>}
          </View>
        </Card>

        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: spacing.md }}>
          <InfoCard icon="business-outline" label="Agence" value={d.agency?.name ?? '-'} />
          {isMasked(d.createdBy)
            ? <View style={{ flex: 1, minWidth: 150 }}>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12, backgroundColor: '#fff', borderRadius: 12, padding: 12 }}>
                  <View style={{ width: 40, height: 40, borderRadius: 8, backgroundColor: '#f0fdf4', alignItems: 'center', justifyContent: 'center' }}>
                    <Ionicons name="person-circle-outline" size={20} color={colors.primary[600]} />
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={{ fontSize: 11, textTransform: 'uppercase', letterSpacing: 0.5, color: colors.gray[400] }}>Emis par</Text>
                    <MaskedValue value={d.createdBy} />
                  </View>
                </View>
              </View>
            : <InfoCard icon="person-circle-outline" label="Emis par" value={d.createdBy ? `${d.createdBy.firstName ?? ''} ${d.createdBy.lastName ?? ''}`.trim() : (d.userId ?? '-')} />
          }
          <InfoCard icon="person-outline" label="Ordonnateur" value={d.orderer ?? '-'} />
        </View>

        <SectionCard title="Details">
          <DRow icon="receipt-outline" label="Reference" value={d.reference} />
          <DRow icon="document-text-outline" label="Motif" value={d.reason} />
          <DRow icon="document-outline" label="Description" value={d.description} />
          <DRow icon="cash-outline" label="Montant" value={formatAmount(Number(d.amount ?? 0))} />
        </SectionCard>

        <AttachmentsSection parentType="disbursement" parentId={dId} readonly={!!d.isVoided} />
      </ScrollView>

      <AppDialog open={showVoid} onClose={() => setShowVoid(false)} title="Annuler le bon de decaissement" width={440}
        footer={<><Button variant="ghost" onPress={() => setShowVoid(false)}>Retour</Button><Button variant="destructive" loading={voiding} onPress={doVoid}>Confirmer l'annulation</Button></>}>
        <Text style={{ fontSize: 13, color: colors.gray[600] }}>Action irreversible. Le bon ne sera plus considere comme valide.</Text>
        <Input label="Motif (optionnel)" value={voidReason} onChangeText={setVoidReason} multiline />
      </AppDialog>
    </View>
  );
}
