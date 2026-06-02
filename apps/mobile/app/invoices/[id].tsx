import { useState } from 'react';
import { ScrollView, View, Text, ActivityIndicator, Pressable, RefreshControl } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useQuery } from '@tanstack/react-query';
import { Ionicons } from '@expo/vector-icons';
import { Card, CardHeader } from '@/components/ui/Card';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { PayDialog } from '@/components/payment/PayDialog';
import { portalApi } from '@/lib/api/portal';
import { downloadAndShare } from '@/lib/downloads';
import { invoiceStatusLabel, paymentMethodLabel, parcelStatusLabel } from '@/lib/labels';
import { colors, spacing } from '@/lib/theme/colors';
import { formatAmount } from '@transitsoftservices/shared';
import { toast } from '@/lib/toast';

export default function InvoiceDetail() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const [refreshing, setRefreshing] = useState(false);
  const [payOpen, setPayOpen] = useState(false);

  const { data, isLoading, refetch } = useQuery({
    queryKey: ['portal', 'invoices', id],
    queryFn: () => portalApi.invoiceById(id ?? ''),
    enabled: !!id,
  });

  const i = data?.data;
  const total = Number(i?.totalAmount ?? 0);
  const paid = Number(i?.paidAmount ?? 0);
  const remaining = i?.balance != null ? Number(i.balance) : Math.max(total - paid, 0);

  const onRefresh = async () => {
    setRefreshing(true);
    await refetch();
    setRefreshing(false);
  };

  const handleDownload = async () => {
    if (!id) return;
    try {
      await downloadAndShare(portalApi.invoicePdfUrl(id), `facture-${i?.reference ?? id}.pdf`);
    } catch {
      toast.error('Telechargement impossible');
    }
  };

  return (
    <View style={{ flex: 1, backgroundColor: 'transparent' }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', paddingHorizontal: spacing.lg, paddingTop: 4, paddingBottom: spacing.md, gap: 12 }}>
        <Pressable onPress={() => router.back()} hitSlop={10}>
          <Ionicons name="arrow-back" size={22} color={colors.gray[700]} />
        </Pressable>
        <View style={{ flex: 1 }}>
          <Text style={{ fontSize: 16, fontWeight: '700', color: colors.gray[900] }} numberOfLines={1}>
            Facture {i?.reference ?? ''}
          </Text>
          {i?.createdAt && (
            <Text style={{ fontSize: 11, color: colors.gray[500] }}>{i.createdAt.slice(0, 10)}</Text>
          )}
        </View>
        {i && (
          <Pressable onPress={handleDownload} hitSlop={10}>
            <Ionicons name="download-outline" size={22} color={colors.primary[600]} />
          </Pressable>
        )}
      </View>

      {isLoading ? (
        <ActivityIndicator color={colors.primary[500]} style={{ marginTop: 40 }} />
      ) : !i ? (
        <Text style={{ textAlign: 'center', color: colors.gray[500], marginTop: 40 }}>Introuvable</Text>
      ) : (
        <ScrollView
          contentContainerStyle={{ padding: spacing.lg, gap: spacing.lg, paddingBottom: 80 }}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.primary[500]} />}
        >
          <Card>
            <View style={{ alignItems: 'center', gap: 6, paddingVertical: 8 }}>
              <Badge variant={i.status === 'PAID' ? 'success' : i.status === 'OVERDUE' || i.status === 'CANCELLED' ? 'error' : 'warning'}>
                {invoiceStatusLabel(i.status)}
              </Badge>
              <Text style={{ fontSize: 28, fontWeight: '700', color: colors.gray[900], marginTop: 6 }}>{formatAmount(total)}</Text>
              <Text style={{ fontSize: 12, color: colors.gray[500] }}>Total facture</Text>
              {remaining > 0 && (
                <Text style={{ fontSize: 14, fontWeight: '600', color: colors.error, marginTop: 4 }}>
                  Restant : {formatAmount(remaining)}
                </Text>
              )}
            </View>
          </Card>

          <Card>
            <CardHeader title="Detail des frais" />
            <FeeRow label="Frais de transport" value={formatAmount(Number(i.fees?.transport ?? 0))} />
            <FeeRow label="Frais de magasinage" value={formatAmount(Number(i.fees?.storage ?? 0))} />
            {Number(i.fees?.discount ?? 0) > 0 && (
              <FeeRow label="Remise" value={`- ${formatAmount(Number(i.fees.discount))}`} muted />
            )}
            {Number(i.fees?.tax ?? 0) > 0 && (
              <FeeRow label="TVA" value={formatAmount(Number(i.fees.tax))} muted />
            )}
            <View style={{ height: 1, backgroundColor: colors.gray[100], marginVertical: 6 }} />
            <FeeRow label="Net a payer" value={formatAmount(Number(i.fees?.net ?? total))} bold />
            <FeeRow label="Avances versees" value={`- ${formatAmount(Number(i.fees?.advances ?? paid))}`} muted />
            <FeeRow
              label="Reste a payer"
              value={formatAmount(Number(i.fees?.remaining ?? remaining))}
              bold
              highlight={remaining > 0}
            />
          </Card>

          <View style={{ flexDirection: 'row', gap: 8 }}>
            <View style={{ flex: 1 }}>
              <Button variant="secondary" onPress={handleDownload}>
                PDF
              </Button>
            </View>
            {remaining > 0 && (
              <View style={{ flex: 1 }}>
                <Button onPress={() => setPayOpen(true)}>
                  Payer
                </Button>
              </View>
            )}
          </View>

          {i.agency && (
            <Card>
              <CardHeader title="Agence emettrice" />
              <Text style={{ fontSize: 14, fontWeight: '600', color: colors.gray[900] }}>{i.agency.name}</Text>
              <Text style={{ fontSize: 12, color: colors.gray[600] }}>
                {[i.agency.city, i.agency.country].filter(Boolean).join(', ')}
              </Text>
              {i.agency.phone && <Text style={{ fontSize: 12, color: colors.gray[500], marginTop: 2 }}>{i.agency.phone}</Text>}
            </Card>
          )}

          {Array.isArray(i.parcels) && i.parcels.length > 0 && (
            <Card>
              <CardHeader title="Colis factures" subtitle={`${i.parcels.length} colis`} />
              {i.parcels.map((p: any) => (
                <Pressable
                  key={p.id}
                  onPress={() => router.push(`/parcels/${p.trackingNumber}` as never)}
                  style={{ flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: colors.gray[100] }}
                >
                  <View style={{ width: 32, height: 32, borderRadius: 16, backgroundColor: colors.primary[50], alignItems: 'center', justifyContent: 'center' }}>
                    <Ionicons name="cube-outline" size={16} color={colors.primary[600]} />
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={{ fontSize: 13, fontWeight: '600', color: colors.gray[900] }} numberOfLines={1}>{p.designation}</Text>
                    <Text style={{ fontSize: 11, color: colors.gray[500], fontFamily: 'monospace' }}>{p.trackingNumber}</Text>
                  </View>
                  <View style={{ alignItems: 'flex-end', gap: 2 }}>
                    {p.price != null && (
                      <Text style={{ fontSize: 13, fontWeight: '700', color: colors.gray[900] }}>{formatAmount(Number(p.price))}</Text>
                    )}
                    <Badge variant={p.status === 'DELIVERED' ? 'success' : 'default'}>{parcelStatusLabel(p.status)}</Badge>
                  </View>
                </Pressable>
              ))}
            </Card>
          )}

          {Array.isArray(i.payments) && i.payments.length > 0 && (
            <Card>
              <CardHeader title="Paiements" subtitle={`${i.payments.length} reglement${i.payments.length > 1 ? 's' : ''}`} />
              {i.payments.map((pay: any) => (
                <View key={pay.id} style={{ flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 8, borderBottomWidth: 1, borderBottomColor: colors.gray[100] }}>
                  <View style={{ width: 32, height: 32, borderRadius: 16, backgroundColor: colors.primary[50], alignItems: 'center', justifyContent: 'center' }}>
                    <Ionicons name="cash-outline" size={16} color={colors.primary[600]} />
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={{ fontSize: 13, color: colors.gray[900], fontWeight: '600' }}>{pay.reference ?? pay.id.slice(0, 8)}</Text>
                    <Text style={{ fontSize: 11, color: colors.gray[500] }}>{paymentMethodLabel(pay.paymentMethod)} · {pay.createdAt?.slice(0, 16)}</Text>
                  </View>
                  <Text style={{ fontSize: 14, fontWeight: '700', color: colors.gray[900] }}>{formatAmount(Number(pay.amount ?? 0))}</Text>
                  <Pressable
                    onPress={async () => {
                      try {
                        await downloadAndShare(portalApi.paymentReceiptUrl(pay.id), `recu-${pay.reference ?? pay.id}.pdf`);
                      } catch {
                        toast.error('Telechargement impossible');
                      }
                    }}
                    hitSlop={8}
                    style={{ padding: 4 }}
                  >
                    <Ionicons name="receipt-outline" size={18} color={colors.primary[600]} />
                  </Pressable>
                </View>
              ))}
            </Card>
          )}
        </ScrollView>
      )}

      {i && id && (
        <PayDialog
          open={payOpen}
          onClose={() => setPayOpen(false)}
          invoiceId={id}
          amount={remaining}
          invoiceReference={i.reference}
        />
      )}
    </View>
  );
}

function FeeRow({
  label,
  value,
  bold,
  muted,
  highlight,
}: {
  label: string;
  value: string;
  bold?: boolean;
  muted?: boolean;
  highlight?: boolean;
}) {
  const color = highlight ? colors.error : muted ? colors.gray[500] : colors.gray[900];
  return (
    <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingVertical: 4 }}>
      <Text style={{ fontSize: 13, color: muted ? colors.gray[500] : colors.gray[700], fontWeight: bold ? '700' : '500' }}>
        {label}
      </Text>
      <Text style={{ fontSize: bold ? 15 : 13, color, fontWeight: bold ? '700' : '600' }}>
        {value}
      </Text>
    </View>
  );
}
