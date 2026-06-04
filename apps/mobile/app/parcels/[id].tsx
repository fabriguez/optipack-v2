import { useState } from 'react';
import {
  ScrollView,
  View,
  Text,
  ActivityIndicator,
  Pressable,
  RefreshControl,
  Modal,
  TextInput,
  Alert,
  Linking,
} from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Ionicons } from '@expo/vector-icons';
import { Card, CardHeader } from '@/components/ui/Card';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { StatusStepper } from '@/components/parcel/StatusStepper';
import { ImageGallery } from '@/components/parcel/ImageGallery';
import { ParcelStatusContext } from '@/components/parcel/ParcelStatusContext';
import { parcelStatusLabel, invoiceStatusLabel, parcelActionLabel, paymentMethodLabel, financialMovementLabel } from '@/lib/labels';
import { portalApi } from '@/lib/api/portal';
import { apiClient } from '@/lib/api/client';
import { downloadAndShare } from '@/lib/downloads';
import { colors, radius, spacing } from '@/lib/theme/colors';
import { formatAmount } from '@transitsoftservices/shared';
import { toast } from '@/lib/toast';

function Row({ label, value, mono }: { label: string; value?: string | number | null; mono?: boolean }) {
  if (value == null || value === '') return null;
  return (
    <View style={{ flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 8, borderBottomWidth: 1, borderBottomColor: colors.gray[100] }}>
      <Text style={{ fontSize: 13, color: colors.gray[500] }}>{label}</Text>
      <Text style={{ fontSize: 13, color: colors.gray[900], fontWeight: '500', fontFamily: mono ? 'monospace' : undefined, flexShrink: 1, textAlign: 'right' }}>
        {String(value)}
      </Text>
    </View>
  );
}

function AgencyBlock({ title, agency }: { title: string; agency?: { name?: string; city?: string; country?: string; googleMapsLink?: string | null } | null }) {
  if (!agency) return null;
  return (
    <View style={{ borderWidth: 1, borderColor: colors.gray[200], borderRadius: radius.md, padding: spacing.md, gap: 4 }}>
      <Text style={{ fontSize: 11, color: colors.gray[500], textTransform: 'uppercase', letterSpacing: 0.5 }}>{title}</Text>
      <Text style={{ fontSize: 14, fontWeight: '600', color: colors.gray[900] }}>{agency.name ?? '—'}</Text>
      <Text style={{ fontSize: 12, color: colors.gray[600] }}>
        {[agency.city, agency.country].filter(Boolean).join(', ')}
      </Text>
      {agency.googleMapsLink && (
        <Pressable onPress={() => Linking.openURL(agency.googleMapsLink!)} style={{ flexDirection: 'row', alignItems: 'center', gap: 4, marginTop: 4 }}>
          <Ionicons name="navigate-outline" size={13} color={colors.primary[600]} />
          <Text style={{ fontSize: 12, color: colors.primary[600], fontWeight: '500' }}>Voir sur la carte</Text>
        </Pressable>
      )}
    </View>
  );
}

export default function ParcelDetail() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const qc = useQueryClient();
  const [refreshing, setRefreshing] = useState(false);
  const [payOpen, setPayOpen] = useState(false);
  const [amount, setAmount] = useState('');

  const { data, isLoading, refetch } = useQuery({
    queryKey: ['portal', 'parcels', id],
    queryFn: () => portalApi.parcelByTracking(id ?? ''),
    enabled: !!id,
  });

  const p = data?.data;
  const invoice = p?.invoice;
  const payments = p?.payments ?? [];
  const fees = p?.fees;
  const movements = p?.financialMovements ?? [];
  const remaining = invoice ? Number(invoice.balance ?? 0) : 0;

  const payMutation = useMutation({
    mutationFn: () =>
      apiClient.post('/client-portal/payments/declare', {
        invoiceId: invoice?.id,
        amount: Number(amount),
        paymentMethod: 'MOBILE_MONEY',
      }),
    onSuccess: () => {
      toast.success('Declaration envoyee, agence va valider');
      setPayOpen(false);
      setAmount('');
      qc.invalidateQueries({ queryKey: ['portal', 'parcels', id] });
      qc.invalidateQueries({ queryKey: ['portal', 'invoices'] });
    },
    onError: (e: any) => {
      const err = e as { isOfflineQueued?: boolean };
      if (err?.isOfflineQueued) {
        toast.info('Declaration mise en file');
        setPayOpen(false);
        return;
      }
      toast.error(e?.response?.data?.message ?? 'Echec');
    },
  });

  const onRefresh = async () => {
    setRefreshing(true);
    await refetch();
    setRefreshing(false);
  };

  const submitPay = () => {
    const v = Number(amount);
    if (!v || v <= 0) return Alert.alert('Montant invalide');
    if (v > remaining) return Alert.alert('Trop eleve', `Restant : ${formatAmount(remaining)}`);
    payMutation.mutate();
  };

  const handleDownloadLabel = async () => {
    if (!p?.trackingNumber) return;
    try {
      await downloadAndShare(portalApi.parcelLabelUrl(p.trackingNumber), `ticket-${p.trackingNumber}.pdf`);
    } catch {
      toast.error('Telechargement impossible');
    }
  };

  const handleDownloadInvoice = async () => {
    if (!invoice?.id) return;
    try {
      await downloadAndShare(portalApi.invoicePdfUrl(invoice.id), `facture-${invoice.reference ?? invoice.id}.pdf`);
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
            {p?.designation ?? 'Colis'}
          </Text>
          {p?.trackingNumber && (
            <Text style={{ fontSize: 11, color: colors.gray[500], fontFamily: 'monospace' }} numberOfLines={1}>
              {p.trackingNumber}
            </Text>
          )}
        </View>
        {p?.trackingNumber && (
          <Pressable onPress={handleDownloadLabel} hitSlop={10}>
            <Ionicons name="download-outline" size={22} color={colors.primary[600]} />
          </Pressable>
        )}
      </View>

      {isLoading ? (
        <ActivityIndicator color={colors.primary[500]} style={{ marginTop: 40 }} />
      ) : !p ? (
        <Text style={{ textAlign: 'center', color: colors.gray[500], marginTop: 40 }}>Introuvable</Text>
      ) : (
        <ScrollView
          contentContainerStyle={{ padding: spacing.lg, gap: spacing.lg, paddingBottom: 80 }}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.primary[500]} />}
        >
          {/* Bandeau tete : designation + tracking + statut */}
          <Card>
            <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 8, gap: 8 }}>
              <View style={{ flex: 1 }}>
                <Text style={{ fontSize: 16, fontWeight: '700', color: colors.gray[900] }}>{p.designation}</Text>
                <Text style={{ fontSize: 12, color: colors.gray[500], fontFamily: 'monospace', marginTop: 2 }}>{p.trackingNumber}</Text>
              </View>
              <Badge variant={p.status === 'DELIVERED' ? 'success' : p.status === 'IN_TRANSIT' ? 'warning' : 'default'}>
                {parcelStatusLabel(p.status)}
              </Badge>
            </View>
            <ParcelStatusContext parcel={p} />
          </Card>

          {/* Images galerie */}
          {p.images && p.images.length > 0 && (
            <Card>
              <CardHeader title="Photos" subtitle={`${p.images.length} image${p.images.length > 1 ? 's' : ''}`} />
              <ImageGallery images={p.images} />
            </Card>
          )}

          {/* Stepper statut */}
          <Card>
            <CardHeader title="Suivi" subtitle="Etat d'avancement" />
            <View style={{ marginBottom: 12 }}>
              <ParcelStatusContext parcel={p} />
            </View>
            <StatusStepper current={p.status} />
          </Card>

          {/* Agences depart + destination */}
          {(p.warehouse?.agency || p.destinationAgency) && (
            <Card>
              <CardHeader title="Trajet" />
              <View style={{ gap: 10 }}>
                <AgencyBlock title="Depart" agency={p.warehouse?.agency} />
                <View style={{ alignItems: 'center', paddingVertical: 2 }}>
                  <Ionicons name="arrow-down" size={18} color={colors.gray[400]} />
                </View>
                <AgencyBlock title="Destination" agency={p.destinationAgency} />
              </View>
              {p.transitRoute && (
                <View style={{ marginTop: 10, padding: spacing.md, backgroundColor: colors.primary[50], borderRadius: radius.md }}>
                  <Text style={{ fontSize: 11, color: colors.primary[700], textTransform: 'uppercase', letterSpacing: 0.5 }}>Route</Text>
                  <Text style={{ fontSize: 13, fontWeight: '600', color: colors.primary[900] }}>{p.transitRoute.name}</Text>
                  <Text style={{ fontSize: 12, color: colors.primary[700] }}>
                    {p.transitRoute.departureCity} → {p.transitRoute.arrivalCity} · {p.transitRoute.type}
                  </Text>
                </View>
              )}
            </Card>
          )}

          {/* Caracteristiques */}
          <Card>
            <CardHeader title="Caracteristiques" />
            <Row label="Poids" value={p.weight ? `${p.weight} kg` : null} />
            <Row label="Volume" value={p.volume ? `${p.volume} m³` : null} />
            <Row label="Prix" value={p.price != null ? formatAmount(Number(p.price)) : null} />
            <Row label="Magasin" value={p.warehouse?.name} />
            <Row label="Conteneur" value={p.container?.designation} />
            <Row label="Destinataire" value={p.recipient?.fullName} />
            <Row label="Cree" value={p.createdAt?.slice(0, 16)} />
            <Row label="Observation" value={p.observation} />
          </Card>

          {/* Facture liee */}
          {invoice && (
            <Card>
              <CardHeader
                title="Facture"
                subtitle={invoice.reference}
                right={
                  <Badge variant={invoice.status === 'PAID' ? 'success' : invoice.status === 'OVERDUE' ? 'error' : 'warning'}>
                    {invoiceStatusLabel(invoice.status)}
                  </Badge>
                }
              />
              <View style={{ gap: 6 }}>
                <Row label="Frais de transport" value={fees ? formatAmount(Number(fees.transport ?? 0)) : null} />
                <Row label="Frais de magasinage" value={fees ? formatAmount(Number(fees.storage ?? 0)) : null} />
                {Number(fees?.discount ?? 0) > 0 && (
                  <Row label="Remise sur facture" value={`- ${formatAmount(Number(fees!.discount))}`} />
                )}
                <Row label="Total" value={formatAmount(Number(invoice.totalAmount ?? 0))} />
                <Row label="Paye" value={formatAmount(Number(invoice.paidAmount ?? 0))} />
                <Row label="Restant" value={formatAmount(remaining)} />
              </View>
              <View style={{ flexDirection: 'row', gap: 8, marginTop: 12 }}>
                <View style={{ flex: 1 }}>
                  <Button variant="secondary" onPress={handleDownloadInvoice}>
                    Telecharger PDF
                  </Button>
                </View>
                {remaining > 0 && (
                  <View style={{ flex: 1 }}>
                    <Button onPress={() => { setAmount(String(remaining)); setPayOpen(true); }}>
                      Payer
                    </Button>
                  </View>
                )}
              </View>
            </Card>
          )}

          {/* Historique paiements de la facture */}
          {payments.length > 0 && (
            <Card>
              <CardHeader title="Paiements" subtitle={`${payments.length} reglement${payments.length > 1 ? 's' : ''}`} />
              <View style={{ gap: 10 }}>
                {payments.map((pay: any) => (
                  <View key={pay.id} style={{ flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 8, borderBottomWidth: 1, borderBottomColor: colors.gray[100] }}>
                    <View style={{ width: 32, height: 32, borderRadius: 16, backgroundColor: colors.primary[50], alignItems: 'center', justifyContent: 'center' }}>
                      <Ionicons name="cash-outline" size={16} color={colors.primary[600]} />
                    </View>
                    <View style={{ flex: 1 }}>
                      <Text style={{ fontSize: 13, color: colors.gray[900], fontWeight: '600' }}>{pay.reference ?? pay.id.slice(0, 8)}</Text>
                      <Text style={{ fontSize: 11, color: colors.gray[500] }}>{paymentMethodLabel(pay.paymentMethod)} · {pay.createdAt?.slice(0, 16)}</Text>
                    </View>
                    <Text style={{ fontSize: 14, fontWeight: '700', color: colors.gray[900] }}>{formatAmount(Number(pay.amount ?? 0))}</Text>
                  </View>
                ))}
              </View>
            </Card>
          )}

          {/* Mouvements financiers du colis */}
          {movements.length > 0 && (
            <Card>
              <CardHeader title="Mouvements financiers" subtitle={`${movements.length} mouvement${movements.length > 1 ? 's' : ''}`} />
              <View style={{ gap: 10 }}>
                {movements.map((m: any) => {
                  const credit = m.direction === 'credit';
                  const icon =
                    m.type === 'PAYMENT' ? 'cash-outline'
                    : m.type === 'DISCOUNT' ? 'pricetag-outline'
                    : m.type === 'STORAGE' ? 'business-outline'
                    : 'cube-outline';
                  return (
                    <View key={m.id} style={{ flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 8, borderBottomWidth: 1, borderBottomColor: colors.gray[100] }}>
                      <View style={{ width: 32, height: 32, borderRadius: 16, backgroundColor: credit ? colors.primary[50] : colors.gray[100], alignItems: 'center', justifyContent: 'center' }}>
                        <Ionicons name={icon as any} size={16} color={credit ? colors.primary[600] : colors.gray[500]} />
                      </View>
                      <View style={{ flex: 1 }}>
                        <Text style={{ fontSize: 13, color: colors.gray[900], fontWeight: '600' }}>
                          {financialMovementLabel(m.type)}
                        </Text>
                        <Text style={{ fontSize: 11, color: colors.gray[500] }}>
                          {(m.type === 'PAYMENT' ? paymentMethodLabel(m.label) : m.label) ?? ''}
                          {m.date ? ` · ${String(m.date).slice(0, 16)}` : ''}
                        </Text>
                      </View>
                      <Text style={{ fontSize: 14, fontWeight: '700', color: credit ? colors.primary[600] : colors.gray[900] }}>
                        {credit ? '- ' : '+ '}{formatAmount(Number(m.amount ?? 0))}
                      </Text>
                    </View>
                  );
                })}
              </View>
            </Card>
          )}

          {/* Historique evenements colis */}
          {p.histories && p.histories.length > 0 && (
            <Card>
              <CardHeader title="Historique" />
              <View style={{ gap: 12 }}>
                {[...p.histories].reverse().map((h: any) => (
                  <View key={h.id} style={{ flexDirection: 'row', gap: 10 }}>
                    <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: colors.primary[500], marginTop: 6 }} />
                    <View style={{ flex: 1 }}>
                      <Text style={{ fontSize: 13, fontWeight: '500', color: colors.gray[900] }}>
                        {h.action ? parcelActionLabel(h.action) : `${parcelStatusLabel(h.statusBefore)} → ${parcelStatusLabel(h.statusAfter)}`}
                      </Text>
                      <Text style={{ fontSize: 11, color: colors.gray[500] }}>
                        {h.createdAt?.slice(0, 16)}
                        {h.actorName ? ` · ${h.actorName}` : ''}
                        {h.warehouse?.name ? ` · ${h.warehouse.name}` : ''}
                      </Text>
                      {h.comment && (
                        <Text style={{ fontSize: 12, color: colors.gray[600], marginTop: 2 }}>{h.comment}</Text>
                      )}
                    </View>
                  </View>
                ))}
              </View>
            </Card>
          )}
        </ScrollView>
      )}

      {/* Modal paiement */}
      <Modal visible={payOpen} transparent animationType="fade" onRequestClose={() => setPayOpen(false)}>
        <View style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.45)', alignItems: 'center', justifyContent: 'center', padding: 20 }}>
          <View style={{ backgroundColor: colors.white, borderRadius: radius.lg, padding: spacing.xl, width: '100%', maxWidth: 380, gap: 14 }}>
            <Text style={{ fontSize: 17, fontWeight: '600', color: colors.gray[900] }}>Declarer un paiement</Text>
            <Text style={{ fontSize: 13, color: colors.gray[500] }}>Restant : {formatAmount(remaining)}</Text>
            <TextInput
              value={amount}
              onChangeText={setAmount}
              placeholder="Montant"
              keyboardType="decimal-pad"
              autoFocus
              style={{ height: 48, borderWidth: 1, borderColor: colors.gray[300], borderRadius: radius.md, paddingHorizontal: spacing.lg, fontSize: 16 }}
            />
            <Text style={{ fontSize: 11, color: colors.gray[500] }}>
              Votre agence validera ce paiement. Vous recevrez une notification dès confirmation.
            </Text>
            <View style={{ flexDirection: 'row', gap: 8 }}>
              <Pressable onPress={() => setPayOpen(false)} style={{ flex: 1, height: 44, borderRadius: radius.md, backgroundColor: colors.gray[100], alignItems: 'center', justifyContent: 'center' }}>
                <Text style={{ fontSize: 14, color: colors.gray[700], fontWeight: '500' }}>Annuler</Text>
              </Pressable>
              <Pressable onPress={submitPay} disabled={payMutation.isPending} style={{ flex: 1, height: 44, borderRadius: radius.md, backgroundColor: colors.primary[500], alignItems: 'center', justifyContent: 'center', opacity: payMutation.isPending ? 0.6 : 1 }}>
                <Text style={{ fontSize: 14, color: colors.white, fontWeight: '600' }}>{payMutation.isPending ? '...' : 'Envoyer'}</Text>
              </Pressable>
            </View>
          </View>
        </View>
      </Modal>
    </View>
  );
}
