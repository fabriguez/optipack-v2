import { useEffect, useState } from 'react';
import { Modal, View, Text, Pressable, ActivityIndicator, Alert, Linking } from 'react-native';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Ionicons } from '@expo/vector-icons';
import { portalApi } from '@/lib/api/portal';
import { useAuth } from '@/lib/auth/AuthContext';
import { colors, radius, spacing } from '@/lib/theme/colors';
import { formatAmount } from '@transitsoftservices/shared';
import { AppPhoneInput } from '@/components/ui/AppPhoneInput';
import { toast } from '@/lib/toast';

type Channel = 'MOBILE_MONEY' | 'CARD';

interface Props {
  open: boolean;
  onClose: () => void;
  invoiceId: string;
  amount: number;
  invoiceReference?: string;
}

const CHANNELS: Array<{ key: Channel; label: string; icon: keyof typeof Ionicons.glyphMap; hint: string }> = [
  { key: 'MOBILE_MONEY', label: 'Mobile Money', icon: 'phone-portrait-outline', hint: 'MTN / Orange' },
  { key: 'CARD', label: 'Carte bancaire', icon: 'card-outline', hint: 'Visa / Mastercard' },
];

export function PayDialog({ open, onClose, invoiceId, amount, invoiceReference }: Props) {
  const { user } = useAuth();
  const qc = useQueryClient();
  const [step, setStep] = useState<'pick' | 'form' | 'awaiting'>('pick');
  const [channel, setChannel] = useState<Channel>('MOBILE_MONEY');
  const [phone, setPhone] = useState(user?.phone ?? '');
  const [country, setCountry] = useState('CM');
  const [intentId, setIntentId] = useState<string | null>(null);

  useEffect(() => {
    if (open) {
      setStep('pick');
      setIntentId(null);
      setPhone(user?.phone ?? '');
    }
  }, [open, user?.phone]);

  const initiate = useMutation({
    mutationFn: () =>
      portalApi.initiatePayment({
        invoiceId,
        channel,
        amount,
        country,
        payerPhone: channel === 'MOBILE_MONEY' ? phone : undefined,
        payerEmail: user?.email,
      }),
    onSuccess: (res) => {
      const intent = res?.data?.intent;
      const redirectUrl = res?.data?.redirectUrl;
      if (redirectUrl) {
        Linking.openURL(redirectUrl);
      }
      if (intent?.id) {
        setIntentId(intent.id);
        setStep('awaiting');
      } else {
        toast.error('Aucun provider disponible');
      }
    },
    onError: (e: any) => {
      toast.error(e?.response?.data?.message ?? 'Echec initialisation');
    },
  });

  // Polling automatique tant qu'on attend confirmation (realtime invalide aussi cette query).
  const { data: intentData } = useQuery({
    queryKey: ['portal', 'payment-intent', intentId],
    queryFn: () => portalApi.paymentIntent(intentId!),
    enabled: !!intentId && step === 'awaiting',
    refetchInterval: 4000,
  });

  const status = intentData?.data?.status;
  useEffect(() => {
    if (status === 'SUCCEEDED') {
      toast.success('Paiement confirme');
      qc.invalidateQueries({ queryKey: ['portal'] });
      setTimeout(() => onClose(), 700);
    } else if (status === 'FAILED' || status === 'CANCELLED' || status === 'EXPIRED') {
      toast.error('Paiement echoue');
    }
  }, [status, qc, onClose]);

  const onSubmit = () => {
    if (channel === 'MOBILE_MONEY' && phone.replace(/[^0-9]/g, '').length < 8) {
      Alert.alert('Numero invalide');
      return;
    }
    initiate.mutate();
  };

  return (
    <Modal visible={open} transparent animationType="fade" onRequestClose={onClose}>
      <View style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.45)', alignItems: 'center', justifyContent: 'center', padding: 20 }}>
        <View style={{ backgroundColor: colors.white, borderRadius: radius.lg, padding: spacing.xl, width: '100%', maxWidth: 420, gap: 14 }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
            <View>
              <Text style={{ fontSize: 17, fontWeight: '700', color: colors.gray[900] }}>Payer la facture</Text>
              {invoiceReference && <Text style={{ fontSize: 12, color: colors.gray[500] }}>Facture {invoiceReference}</Text>}
            </View>
            <Pressable onPress={onClose} hitSlop={10}>
              <Ionicons name="close" size={22} color={colors.gray[500]} />
            </Pressable>
          </View>
          <Text style={{ fontSize: 22, fontWeight: '700', color: colors.primary[700] }}>{formatAmount(amount)}</Text>

          {step === 'pick' && (
            <View style={{ gap: 8 }}>
              <Text style={{ fontSize: 13, color: colors.gray[500] }}>Moyen de paiement</Text>
              {CHANNELS.map((c) => (
                <Pressable
                  key={c.key}
                  onPress={() => { setChannel(c.key); setStep('form'); }}
                  style={{ flexDirection: 'row', alignItems: 'center', gap: 12, padding: 14, borderRadius: radius.md, borderWidth: 1, borderColor: colors.gray[200], backgroundColor: colors.white }}
                >
                  <View style={{ width: 40, height: 40, borderRadius: 20, backgroundColor: colors.primary[50], alignItems: 'center', justifyContent: 'center' }}>
                    <Ionicons name={c.icon} size={20} color={colors.primary[600]} />
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={{ fontSize: 14, fontWeight: '600', color: colors.gray[900] }}>{c.label}</Text>
                    <Text style={{ fontSize: 11, color: colors.gray[500] }}>{c.hint}</Text>
                  </View>
                  <Ionicons name="chevron-forward" size={18} color={colors.gray[400]} />
                </Pressable>
              ))}
            </View>
          )}

          {step === 'form' && (
            <View style={{ gap: 10 }}>
              {channel === 'MOBILE_MONEY' && (
                <AppPhoneInput
                  label="Numero Mobile Money"
                  value={phone}
                  onChange={(v) => setPhone(v)}
                  placeholder="6XX XX XX XX"
                />
              )}
              <View style={{ gap: 6 }}>
                <Text style={{ fontSize: 12, color: colors.gray[600] }}>Pays</Text>
                <View style={{ flexDirection: 'row', gap: 8 }}>
                  {['CM', 'CI', 'SN', 'BJ'].map((c) => (
                    <Pressable
                      key={c}
                      onPress={() => setCountry(c)}
                      style={{ paddingHorizontal: 14, paddingVertical: 8, borderRadius: radius.md, backgroundColor: country === c ? colors.primary[500] : colors.gray[100] }}
                    >
                      <Text style={{ fontSize: 12, fontWeight: '600', color: country === c ? colors.white : colors.gray[700] }}>{c}</Text>
                    </Pressable>
                  ))}
                </View>
              </View>
              <View style={{ flexDirection: 'row', gap: 8, marginTop: 8 }}>
                <Pressable onPress={() => setStep('pick')} style={{ flex: 1, height: 44, borderRadius: radius.md, backgroundColor: colors.gray[100], alignItems: 'center', justifyContent: 'center' }}>
                  <Text style={{ fontSize: 14, color: colors.gray[700], fontWeight: '500' }}>Retour</Text>
                </Pressable>
                <Pressable onPress={onSubmit} disabled={initiate.isPending} style={{ flex: 1, height: 44, borderRadius: radius.md, backgroundColor: colors.primary[500], alignItems: 'center', justifyContent: 'center', opacity: initiate.isPending ? 0.6 : 1 }}>
                  <Text style={{ fontSize: 14, color: colors.white, fontWeight: '600' }}>{initiate.isPending ? 'Initiation...' : 'Payer'}</Text>
                </Pressable>
              </View>
            </View>
          )}

          {step === 'awaiting' && (
            <View style={{ alignItems: 'center', gap: 10, paddingVertical: 20 }}>
              <ActivityIndicator size="large" color={colors.primary[500]} />
              <Text style={{ fontSize: 14, fontWeight: '600', color: colors.gray[900] }}>
                {status === 'AWAITING_USER' ? 'Validez sur votre telephone' : status === 'PROCESSING' ? 'Traitement en cours' : 'En attente...'}
              </Text>
              <Text style={{ fontSize: 12, color: colors.gray[500], textAlign: 'center' }}>
                Confirmation automatique dès reception. Vous pouvez fermer cette fenêtre.
              </Text>
              <Pressable onPress={onClose} style={{ marginTop: 8 }}>
                <Text style={{ color: colors.primary[600], fontWeight: '600' }}>Fermer</Text>
              </Pressable>
            </View>
          )}
        </View>
      </View>
    </Modal>
  );
}
