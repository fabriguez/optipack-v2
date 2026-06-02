import { useMemo, useState } from 'react';
import { View, Text, FlatList, RefreshControl, ActivityIndicator, Pressable, Alert } from 'react-native';
import { useQuery } from '@tanstack/react-query';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { portalApi } from '@/lib/api/portal';
import { Badge } from '@/components/ui/Badge';
import { invoiceStatusLabel } from '@/lib/labels';
import { colors, radius, spacing } from '@/lib/theme/colors';
import { formatAmount } from '@transitsoftservices/shared';
import { PeriodChips, sinceDays } from '@/components/PeriodChips';
import { downloadAndShare } from '@/lib/downloads';

export default function InvoicesTab() {
  const router = useRouter();
  const [refreshing, setRefreshing] = useState(false);
  const [periodDays, setPeriodDays] = useState<number | null>(null);
  const [busy, setBusy] = useState<string | null>(null);

  const params = useMemo(() => ({ from: sinceDays(periodDays), limit: 50 }), [periodDays]);
  const { data, refetch, isLoading } = useQuery({
    queryKey: ['portal', 'invoices', params],
    queryFn: () => portalApi.invoices(params),
  });

  const items = (data?.data ?? []) as any[];

  const onRefresh = async () => {
    setRefreshing(true);
    await refetch();
    setRefreshing(false);
  };

  const download = async (key: string, url: string, filename: string) => {
    setBusy(key);
    try {
      await downloadAndShare(url, filename);
    } catch {
      Alert.alert('Erreur', 'Telechargement impossible.');
    } finally {
      setBusy(null);
    }
  };

  return (
    <View style={{ flex: 1, backgroundColor: 'transparent' }}>
      <View style={{ paddingHorizontal: spacing.lg }}>
        <PeriodChips value={periodDays} onChange={setPeriodDays} />
      </View>
      {isLoading ? (
        <ActivityIndicator color={colors.primary[500]} style={{ marginTop: 40 }} />
      ) : (
        <FlatList
          data={items}
          keyExtractor={(i) => i.id}
          contentContainerStyle={{ paddingHorizontal: spacing.lg, paddingTop: spacing.sm, paddingBottom: 80, gap: spacing.sm }}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.primary[500]} />}
          ListEmptyComponent={
            <View style={{ alignItems: 'center', padding: 40 }}>
              <Ionicons name="document-text-outline" size={40} color={colors.gray[300]} />
              <Text style={{ fontSize: 13, color: colors.gray[500], marginTop: 8 }}>Aucune facture</Text>
            </View>
          }
          renderItem={({ item: i }) => {
            const total = Number(i.totalAmount ?? i.total ?? 0);
            const paid = Number(i.paidAmount ?? 0);
            const remaining = i.balance != null ? Number(i.balance) : Math.max(total - paid, 0);
            const status = i.status ?? (remaining <= 0 ? 'PAID' : 'UNPAID');
            const payments = (i.payments ?? []) as any[];
            const ref = i.reference ?? i.number ?? i.id.slice(0, 8);
            return (
              <View
                style={{
                  backgroundColor: colors.white,
                  borderRadius: radius.lg,
                  padding: spacing.lg,
                  gap: 6,
                }}
              >
                <Pressable
                  onPress={() => router.push(`/invoices/${i.id}` as never)}
                  style={{ gap: 6 }}
                >
                  <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
                    <Text style={{ fontSize: 14, fontWeight: '700', color: colors.gray[900] }}>
                      Facture {ref}
                    </Text>
                    <Badge variant={status === 'PAID' ? 'success' : status === 'OVERDUE' || status === 'CANCELLED' ? 'error' : 'warning'}>
                      {invoiceStatusLabel(status)}
                    </Badge>
                  </View>
                  <Text style={{ fontSize: 12, color: colors.gray[500] }}>{i.createdAt?.slice(0, 10)}</Text>
                  <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginTop: 4 }}>
                    <Text style={{ fontSize: 13, color: colors.gray[700] }}>Total {formatAmount(total)}</Text>
                    {remaining > 0 && (
                      <Text style={{ fontSize: 13, color: colors.error, fontWeight: '600' }}>À payer {formatAmount(remaining)}</Text>
                    )}
                  </View>
                </Pressable>

                <DownloadButton
                  label="Telecharger la facture"
                  icon="download-outline"
                  loading={busy === `inv-${i.id}`}
                  onPress={() => download(`inv-${i.id}`, portalApi.invoicePdfUrl(i.id), `facture-${ref}.pdf`)}
                />

                {payments.map((pay: any) => (
                  <DownloadButton
                    key={pay.id}
                    label={`Recu - ${formatAmount(Number(pay.amount))}`}
                    icon="receipt-outline"
                    ghost
                    loading={busy === `pay-${pay.id}`}
                    onPress={() => download(`pay-${pay.id}`, portalApi.paymentReceiptUrl(pay.id), `recu-${pay.reference ?? pay.id}.pdf`)}
                  />
                ))}
              </View>
            );
          }}
        />
      )}
    </View>
  );
}

function DownloadButton({
  label,
  icon,
  onPress,
  loading,
  ghost,
}: {
  label: string;
  icon: keyof typeof Ionicons.glyphMap;
  onPress: () => void;
  loading?: boolean;
  ghost?: boolean;
}) {
  return (
    <Pressable
      onPress={onPress}
      disabled={loading}
      style={({ pressed }) => ({
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 6,
        height: 38,
        marginTop: 6,
        borderRadius: radius.md,
        borderWidth: ghost ? 1 : 0,
        borderColor: colors.gray[200],
        backgroundColor: ghost ? colors.white : colors.primary[500],
        opacity: pressed || loading ? 0.7 : 1,
      })}
    >
      {loading ? (
        <ActivityIndicator size="small" color={ghost ? colors.primary[600] : colors.white} />
      ) : (
        <Ionicons name={icon} size={16} color={ghost ? colors.primary[600] : colors.white} />
      )}
      <Text style={{ fontSize: 13, fontWeight: '600', color: ghost ? colors.primary[700] : colors.white }}>
        {label}
      </Text>
    </Pressable>
  );
}
