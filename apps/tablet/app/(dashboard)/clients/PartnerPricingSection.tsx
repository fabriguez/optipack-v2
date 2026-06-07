import { useState } from 'react';
import { View, Text, Pressable, Modal, FlatList } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { SectionCard, EmptyState } from '@/components/data/DetailCards';
import { HeaderAction } from '@/components/data/PageHeader';
import { RowActions } from '@/components/data/RowActions';
import { AppDialog } from '@/components/forms/AppDialog';
import { Button } from '@/components/ui/Button';
import { Badge } from '@/components/ui/Badge';
import { Input } from '@/components/ui/Input';
import { SearchBar } from '@/components/data/SearchBar';
import { ConfirmDialog } from '@/components/ui/ConfirmDialog';
import { clientsApi } from '@/lib/api/clients';
import { searchers } from '@/lib/api/searchers';
import { toast } from '@/lib/toast';
import { extractApiError } from '@/lib/api/errorMessage';
import { colors } from '@/lib/theme/colors';
import { radius, spacing } from '@/lib/theme/spacing';

export function PartnerPricingSection({ clientId, isPartner }: { clientId: string; isPartner: boolean }) {
  const qc = useQueryClient();
  const { data } = useQuery({ queryKey: ['clients', clientId, 'pricings'], queryFn: () => clientsApi.listPricings(clientId), enabled: isPartner });
  const [showAdd, setShowAdd] = useState(false);
  const [toDelete, setToDelete] = useState<any | null>(null);
  const [route, setRoute] = useState<{ id: string; name: string } | null>(null);
  const [kg, setKg] = useState('');
  const [vol, setVol] = useState('');

  const markPartner = useMutation({
    mutationFn: () => clientsApi.update(clientId, { clientType: 'PARTNER' } as never),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['clients', clientId] }); toast.success('Client marque partenaire'); },
    onError: (e) => toast.error(extractApiError(e, 'Erreur')),
  });

  const create = useMutation({
    mutationFn: () => clientsApi.createPricing(clientId, { transitRouteId: route?.id ?? null, pricePerKg: Number(kg) || 0, pricePerVolume: vol ? Number(vol) : undefined }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['clients', clientId, 'pricings'] }); toast.success('Tarification ajoutee'); setShowAdd(false); setRoute(null); setKg(''); setVol(''); },
    onError: (e) => toast.error(extractApiError(e, 'Erreur')),
  });

  const remove = useMutation({
    mutationFn: (id: string) => clientsApi.deletePricing(id),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['clients', clientId, 'pricings'] }); toast.success('Tarification supprimee'); setToDelete(null); },
    onError: (e) => toast.error(extractApiError(e, 'Erreur')),
  });

  if (!isPartner) {
    return (
      <SectionCard title="Tarification partenaire">
        <Text style={{ fontSize: 13, color: colors.gray[500], marginBottom: spacing.md }}>
          Ce client n'est pas partenaire. Marquez-le comme partenaire pour definir des tarifs dedies.
        </Text>
        <Button size="sm" loading={markPartner.isPending} onPress={() => markPartner.mutate()}>Marquer comme partenaire</Button>
      </SectionCard>
    );
  }

  const pricings = data?.data ?? [];

  return (
    <SectionCard
      title="Tarification partenaire"
      subtitle="Une regle par route ou globale (sans route)"
      action={<HeaderAction label="Ajouter" icon="add" onPress={() => setShowAdd(true)} />}
    >
      {pricings.length === 0 ? (
        <EmptyState text="Aucune tarification dediee" />
      ) : (
        <View style={{ gap: spacing.sm }}>
          {pricings.map((p: any) => (
            <View key={p.id} style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.md, backgroundColor: colors.gray[50], borderRadius: radius.md, padding: spacing.lg }}>
              <View style={{ width: 36, height: 36, borderRadius: radius.sm, backgroundColor: colors.primary[50], alignItems: 'center', justifyContent: 'center' }}>
                <Ionicons name="pricetag-outline" size={18} color={colors.primary[600]} />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={{ fontSize: 14, fontWeight: '600', color: colors.gray[900] }}>{p.transitRoute?.name ?? 'Toutes routes'}</Text>
                <Text style={{ fontSize: 12, color: colors.gray[400] }}>
                  {Number(p.pricePerKg) > 0 ? `${formatNum(p.pricePerKg)}/kg` : ''}
                  {Number(p.pricePerVolume) > 0 ? `${Number(p.pricePerKg) > 0 ? ' · ' : ''}${formatNum(p.pricePerVolume)}/m³` : ''}
                </Text>
              </View>
              {!p.isActive && <Badge>Inactif</Badge>}
              <RowActions actions={[{ label: 'Supprimer', icon: <Ionicons name="trash-outline" size={18} color={colors.error} />, onPress: () => setToDelete(p), variant: 'destructive' }]} />
            </View>
          ))}
        </View>
      )}

      <AppDialog
        open={showAdd}
        onClose={() => setShowAdd(false)}
        title="Nouvelle tarification"
        width={480}
        footer={
          <>
            <Button variant="ghost" onPress={() => setShowAdd(false)}>Annuler</Button>
            <Button loading={create.isPending} onPress={() => create.mutate()}>Enregistrer</Button>
          </>
        }
      >
        <RoutePicker route={route} onChange={setRoute} />
        <View style={{ flexDirection: 'row', gap: spacing.md }}>
          <View style={{ flex: 1 }}><Input label="Prix / kg" value={kg} onChangeText={setKg} keyboardType="numeric" placeholder="0" /></View>
          <View style={{ flex: 1 }}><Input label="Prix / m³" value={vol} onChangeText={setVol} keyboardType="numeric" placeholder="0" /></View>
        </View>
      </AppDialog>

      <ConfirmDialog
        open={!!toDelete}
        onClose={() => setToDelete(null)}
        onConfirm={() => toDelete && remove.mutate(toDelete.id)}
        title="Supprimer la tarification"
        message="Le prix standard sera utilise par defaut."
        confirmLabel="Supprimer"
        variant="destructive"
        loading={remove.isPending}
      />
    </SectionCard>
  );
}

function formatNum(v: number | string): string {
  return new Intl.NumberFormat('fr-FR').format(Number(v));
}

function RoutePicker({ route, onChange }: { route: { id: string; name: string } | null; onChange: (r: { id: string; name: string } | null) => void }) {
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState('');
  const { data } = useQuery({ queryKey: ['transit-routes', 'search', q], queryFn: () => searchers.transitRoutes(q) });
  const routes = (data ?? []) as any[];

  return (
    <View style={{ gap: 6 }}>
      <Text style={{ fontSize: 13, fontWeight: '500', color: colors.gray[700] }}>Route de transit (optionnel)</Text>
      <Pressable onPress={() => setOpen(true)} style={{ height: 44, borderWidth: 1, borderColor: colors.gray[300], borderRadius: radius.md, paddingHorizontal: spacing.md, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
        <Text style={{ fontSize: 14, color: route ? colors.gray[900] : colors.gray[400] }}>{route?.name ?? 'Toutes routes (global)'}</Text>
        <Ionicons name="chevron-down" size={16} color={colors.gray[400]} />
      </Pressable>

      <Modal visible={open} transparent animationType="fade" onRequestClose={() => setOpen(false)}>
        <Pressable style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.4)', justifyContent: 'center', padding: spacing['2xl'] }} onPress={() => setOpen(false)}>
          <Pressable style={{ backgroundColor: colors.white, borderRadius: radius.lg, padding: spacing.xl, maxHeight: '70%', gap: spacing.md }}>
            <SearchBar value={q} onChange={setQ} placeholder="Rechercher une route..." />
            <Pressable onPress={() => { onChange(null); setOpen(false); }} style={{ paddingVertical: 12, paddingHorizontal: spacing.md }}>
              <Text style={{ fontSize: 14, color: colors.gray[600] }}>Toutes routes (global)</Text>
            </Pressable>
            <FlatList
              data={routes}
              keyExtractor={(r) => r.value}
              nestedScrollEnabled
              renderItem={({ item }) => (
                <Pressable onPress={() => { onChange({ id: item.value, name: item.label }); setOpen(false); }} style={({ pressed }) => ({ paddingVertical: 12, paddingHorizontal: spacing.md, borderRadius: radius.md, backgroundColor: pressed ? colors.gray[50] : 'transparent' })}>
                  <Text style={{ fontSize: 14, color: colors.gray[900] }}>{item.label}</Text>
                </Pressable>
              )}
            />
          </Pressable>
        </Pressable>
      </Modal>
    </View>
  );
}
