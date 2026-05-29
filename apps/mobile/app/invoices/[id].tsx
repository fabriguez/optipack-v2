import { useState } from 'react';
import { ScrollView, View, Text, ActivityIndicator, Pressable, Modal, TextInput, Alert } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Ionicons } from '@expo/vector-icons';
import { Card, CardHeader } from '@/components/ui/Card';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { portalApi } from '@/lib/api/portal';
import { colors, radius, spacing } from '@/lib/theme/colors';
import { formatAmount } from '@transitsoftservices/shared';
import { toast } from '@/lib/toast';

export default function InvoiceDetail() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const qc = useQueryClient();
  const [payOpen, setPayOpen] = useState(false);
  const [amount, setAmount] = useState('');

  const { data, isLoading } = useQuery({
    queryKey: ['portal', 'invoices', id],
    queryFn: () => portalApi.invoiceById(id ?? ''),
    enabled: !!id,
  });

  const i = data?.data;
  const remaining = i ? Number(i.total ?? 0) - Number(i.paidAmount ?? 0) : 0;

  const payMutation = useMutation({
    mutationFn: () => portalApi.payInvoice(id!, { amount: Number(amount) }),
    onSuccess: () => {
      toast.success('Paiement enregistre');
      setPayOpen(false);
      setAmount('');
      qc.invalidateQueries({ queryKey: ['portal'] });
    },
    onError: (e: any) => {
      const err = e as { isOfflineQueued?: boolean };
      if (err?.isOfflineQueued) {
        toast.info('Paiement mis en file');
        setPayOpen(false);
        return;
      }
      toast.error(e?.response?.data?.message ?? 'Echec du paiement');
    },
  });

  const submitPay = () => {
    const v = Number(amount);
    if (!v || v <= 0) {
      Alert.alert('Montant invalide');
      return;
    }
    if (v > remaining) {
      Alert.alert('Trop eleve', `Restant a payer: ${formatAmount(remaining)}`);
      return;
    }
    payMutation.mutate();
  };

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: 'transparent' }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', padding: spacing.lg, gap: 12 }}>
        <Pressable onPress={() => router.back()} hitSlop={10}>
          <Ionicons name="arrow-back" size={22} color={colors.gray[700]} />
        </Pressable>
        <Text style={{ fontSize: 17, fontWeight: '600', color: colors.gray[900], flex: 1 }}>{i?.number ?? 'Facture'}</Text>
      </View>
      {isLoading ? (
        <ActivityIndicator color={colors.primary[500]} style={{ marginTop: 40 }} />
      ) : !i ? (
        <Text style={{ textAlign: 'center', color: colors.gray[500] }}>Introuvable</Text>
      ) : (
        <ScrollView contentContainerStyle={{ padding: spacing.lg, gap: spacing.lg }}>
          <Card>
            <View style={{ alignItems: 'center', gap: 6, paddingVertical: 8 }}>
              <Badge variant={i.status === 'PAID' ? 'success' : i.status === 'OVERDUE' ? 'error' : 'warning'}>{i.status}</Badge>
              <Text style={{ fontSize: 28, fontWeight: '700', color: colors.gray[900] }}>{formatAmount(Number(i.total ?? 0))}</Text>
              <Text style={{ fontSize: 12, color: colors.gray[500] }}>Total facture</Text>
              {remaining > 0 && (
                <Text style={{ fontSize: 14, fontWeight: '600', color: colors.error, marginTop: 4 }}>
                  Restant: {formatAmount(remaining)}
                </Text>
              )}
            </View>
          </Card>

          {remaining > 0 && (
            <Button onPress={() => { setAmount(String(remaining)); setPayOpen(true); }}>
              Payer maintenant
            </Button>
          )}

          {(i.items ?? []).length > 0 && (
            <Card>
              <CardHeader title="Lignes" />
              {i.items.map((it: any) => (
                <View key={it.id} style={{ flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 8, borderBottomWidth: 1, borderBottomColor: colors.gray[100] }}>
                  <Text style={{ fontSize: 13, color: colors.gray[700], flex: 1 }}>{it.label ?? it.designation}</Text>
                  <Text style={{ fontSize: 13, fontWeight: '600', color: colors.gray[900] }}>{formatAmount(Number(it.amount ?? it.total ?? 0))}</Text>
                </View>
              ))}
            </Card>
          )}
        </ScrollView>
      )}

      <Modal visible={payOpen} transparent animationType="fade" onRequestClose={() => setPayOpen(false)}>
        <View style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.45)', alignItems: 'center', justifyContent: 'center', padding: 20 }}>
          <View style={{ backgroundColor: colors.white, borderRadius: radius.lg, padding: spacing.xl, width: '100%', maxWidth: 380, gap: 14 }}>
            <Text style={{ fontSize: 17, fontWeight: '600', color: colors.gray[900] }}>Payer la facture</Text>
            <Text style={{ fontSize: 13, color: colors.gray[500] }}>Restant: {formatAmount(remaining)}</Text>
            <TextInput
              value={amount}
              onChangeText={setAmount}
              placeholder="Montant"
              keyboardType="decimal-pad"
              autoFocus
              style={{ height: 48, borderWidth: 1, borderColor: colors.gray[300], borderRadius: radius.md, paddingHorizontal: spacing.lg, fontSize: 16 }}
            />
            <View style={{ flexDirection: 'row', gap: 8 }}>
              <Pressable onPress={() => setPayOpen(false)} style={{ flex: 1, height: 44, borderRadius: radius.md, backgroundColor: colors.gray[100], alignItems: 'center', justifyContent: 'center' }}>
                <Text style={{ fontSize: 14, color: colors.gray[700], fontWeight: '500' }}>Annuler</Text>
              </Pressable>
              <Pressable onPress={submitPay} disabled={payMutation.isPending} style={{ flex: 1, height: 44, borderRadius: radius.md, backgroundColor: colors.primary[500], alignItems: 'center', justifyContent: 'center', opacity: payMutation.isPending ? 0.6 : 1 }}>
                <Text style={{ fontSize: 14, color: colors.white, fontWeight: '600' }}>{payMutation.isPending ? '...' : 'Confirmer'}</Text>
              </Pressable>
            </View>
          </View>
        </View>
      </Modal>
    </SafeAreaView>
  );
}
