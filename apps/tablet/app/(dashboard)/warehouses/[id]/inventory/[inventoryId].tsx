import { useState } from 'react';
import { View, Text, ScrollView, Pressable, TextInput, ActivityIndicator, RefreshControl } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { formatDateTime } from '@transitsoftservices/shared';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { SectionCard, StatCard, EmptyState } from '@/components/data/DetailCards';
import { AppDataTable, type Column } from '@/components/data/AppDataTable';
import { ScannerDialog } from '@/components/data/ScannerDialog';
import { AppDialog } from '@/components/forms/AppDialog';
import { ConfirmDialog } from '@/components/ui/ConfirmDialog';
import { useInventory, useInventoryUninventoried, useInventoryActions } from '@/lib/hooks/useWarehouses';
import { toast } from '@/lib/toast';
import { colors } from '@/lib/theme/colors';
import { radius, spacing } from '@/lib/theme/spacing';

export default function InventoryDetailScreen() {
  const { id, inventoryId } = useLocalSearchParams<{ id: string; inventoryId: string }>();
  const warehouseId = String(id);
  const invId = String(inventoryId);
  const router = useRouter();
  const { data, isLoading, refetch } = useInventory(invId);
  const { data: uninvData, refetch: refetchUninv } = useInventoryUninventoried(invId);
  const { scan, mark, close } = useInventoryActions(invId, warehouseId);

  const [scanInput, setScanInput] = useState('');
  const [observation, setObservation] = useState('');
  const [showClose, setShowClose] = useState(false);
  const [showScanner, setShowScanner] = useState(false);
  const [noteTarget, setNoteTarget] = useState<any | null>(null);
  const [noteObs, setNoteObs] = useState('');
  const [refreshing, setRefreshing] = useState(false);

  const inventory = data?.data;
  const uninventoried: any[] = uninvData?.data ?? [];

  const onRefresh = async () => {
    setRefreshing(true);
    try { await Promise.all([refetch(), refetchUninv()]); } finally { setRefreshing(false); }
  };

  if (isLoading) return <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}><ActivityIndicator size="large" color={colors.primary[500]} /></View>;
  if (!inventory) return <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', padding: spacing['3xl'] }}><Text style={{ color: colors.gray[500] }}>Inventaire introuvable</Text></View>;

  const isOpen = inventory.status === 'IN_PROGRESS';
  const counts = inventory.counts ?? {};
  const items: any[] = inventory.items ?? [];
  const matched = items.filter((i) => i.expected && i.scanned);
  const missing = items.filter((i) => i.expected && !i.scanned);
  const extra = items.filter((i) => !i.expected && i.scanned);

  const doScan = (code: string, obs?: string) => {
    const v = code.trim();
    if (!v) return;
    scan.mutate({ trackingNumber: v, observation: obs?.trim() || undefined }, {
      onSuccess: (res: any) => {
        const status = res?.data?.status;
        if (status === 'scanned') toast.success(`Scanne : ${res.data.parcel?.trackingNumber ?? ''}`);
        else if (status === 'extra') toast.info(`Inattendu : ${res.data.parcel?.trackingNumber ?? ''}`);
        else if (status === 'already_scanned') toast.info('Deja scanne');
        setScanInput('');
        setObservation('');
      },
    });
  };
  const submitScan = () => doScan(scanInput, observation);

  const itemColumns: Column<any>[] = [
    { key: 'tracking', label: 'Tracking', width: 150, render: (it) => <Text style={{ fontFamily: 'monospace', fontSize: 12, fontWeight: '700', color: colors.primary[700] }}>{it.parcel?.trackingNumber}</Text> },
    { key: 'designation', label: 'Designation', width: 180, render: (it) => <Text style={{ fontSize: 13 }}>{it.parcel?.designation ?? '-'}</Text> },
    { key: 'client', label: 'Client', width: 150, render: (it) => <Text style={{ fontSize: 13, color: colors.gray[500] }}>{it.parcel?.client?.fullName ?? '-'}</Text> },
    { key: 'observation', label: 'Observation', width: 180, render: (it) => <Text style={{ fontSize: 12, fontStyle: 'italic', color: colors.gray[500] }}>{it.observation ?? '-'}</Text> },
  ];

  return (
    <View style={{ flex: 1, backgroundColor: 'transparent' }}>
      <ScrollView
        style={{ flex: 1 }}
        contentContainerStyle={{ padding: spacing['2xl'], gap: spacing.xl }}
        keyboardShouldPersistTaps="handled"
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.primary[500]} />}
      >
        {/* Header */}
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.lg }}>
          <Pressable onPress={() => router.navigate(`/warehouses/${warehouseId}`)} style={({ pressed }) => ({ width: 40, height: 40, borderRadius: 12, alignItems: 'center', justifyContent: 'center', backgroundColor: pressed ? colors.gray[100] : 'transparent' })}>
            <Ionicons name="arrow-back" size={22} color={colors.gray[600]} />
          </Pressable>
          <View style={{ flex: 1 }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.sm, flexWrap: 'wrap' }}>
              <Text style={{ fontSize: 22, fontWeight: '700', color: colors.gray[900] }}>Inventaire — {inventory.warehouse?.name}</Text>
              {isOpen && <Badge variant="warning">En cours</Badge>}
              {inventory.status === 'CLOSED' && <Badge variant="success">Cloture</Badge>}
              {inventory.status === 'CANCELLED' && <Badge variant="error">Annule</Badge>}
            </View>
            <Text style={{ fontSize: 13, color: colors.gray[500], marginTop: 2 }}>
              Demarre le {formatDateTime(inventory.startedAt)}
              {inventory.closedAt ? ` · Cloture le ${formatDateTime(inventory.closedAt)}` : ''}
            </Text>
          </View>
        </View>

        {/* Counts */}
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: spacing.md }}>
          <StatCard label="Attendus" value={String(counts.expected ?? 0)} />
          <StatCard label="Scannes" value={String(counts.scanned ?? 0)} />
          <StatCard label="Conformes" value={String(counts.matched ?? 0)} color={colors.primary[700]} />
          <StatCard label="Manquants" value={String(counts.missing ?? 0)} color={colors.error} />
          <StatCard label="En plus" value={String(counts.extra ?? 0)} color={colors.warning} />
        </View>

        {/* Scan */}
        {isOpen && (
          <SectionCard title="Scanner un colis" action={<Button size="sm" variant="outline" onPress={() => setShowClose(true)}>Cloturer</Button>}>
            <View style={{ flexDirection: 'row', gap: spacing.sm, alignItems: 'flex-end' }}>
              <View style={{ flex: 1 }}>
                <TextInput
                  value={scanInput}
                  onChangeText={setScanInput}
                  onSubmitEditing={submitScan}
                  placeholder="Numero de tracking / code-barres..."
                  placeholderTextColor={colors.gray[400]}
                  autoFocus
                  style={{ height: 44, borderWidth: 1, borderColor: colors.gray[300], borderRadius: radius.md, paddingHorizontal: spacing.md, fontSize: 14, color: colors.gray[900] }}
                />
              </View>
              <Button variant="outline" onPress={() => setShowScanner(true)}>Camera</Button>
              <Button loading={scan.isPending} disabled={!scanInput.trim()} onPress={submitScan}>Valider</Button>
            </View>
            <View style={{ marginTop: spacing.md }}>
              <Input label="Observation (optionnelle)" value={observation} onChangeText={setObservation} placeholder="Ex: emballage abime..." />
            </View>
          </SectionCard>
        )}

        {/* Uninventoried quick-mark */}
        {isOpen && (
          <SectionCard title={`Colis presents dans le magasin (${uninventoried.length})`} subtitle="Si le code est defectueux, marquez Present / Absent">
            {uninventoried.length === 0 ? (
              <EmptyState text="Aucun colis non inventorie" />
            ) : (
              <View style={{ gap: spacing.sm }}>
                {uninventoried.map((p) => (
                  <View key={p.id} style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.md, backgroundColor: colors.gray[50], borderRadius: radius.md, padding: spacing.md }}>
                    <View style={{ flex: 1 }}>
                      <Text style={{ fontFamily: 'monospace', fontSize: 12, fontWeight: '700', color: colors.primary[700] }}>{p.trackingNumber}</Text>
                      <Text style={{ fontSize: 12, color: colors.gray[500] }} numberOfLines={1}>{p.designation} · {p.client?.fullName ?? '-'}</Text>
                    </View>
                    <Pressable onPress={() => mark.mutate({ parcelId: p.id, present: true })} style={btnStyle('#E8F5E9')}>
                      <Ionicons name="checkmark" size={16} color="#1B5E20" />
                      <Text style={{ fontSize: 12, fontWeight: '600', color: '#1B5E20' }}>Present</Text>
                    </Pressable>
                    <Pressable onPress={() => { setNoteTarget(p); setNoteObs(''); }} style={btnStyle(colors.gray[100])}>
                      <Ionicons name="create-outline" size={16} color={colors.gray[700]} />
                      <Text style={{ fontSize: 12, fontWeight: '600', color: colors.gray[700] }}>+ Note</Text>
                    </Pressable>
                    <Pressable onPress={() => mark.mutate({ parcelId: p.id, present: false, observation: 'Marque absent' })} style={btnStyle('#FFEBEE')}>
                      <Ionicons name="close" size={16} color={colors.error} />
                      <Text style={{ fontSize: 12, fontWeight: '600', color: colors.error }}>Absent</Text>
                    </Pressable>
                  </View>
                ))}
              </View>
            )}
          </SectionCard>
        )}

        {/* Sections */}
        <SectionCard title={`Colis inventories (${matched.length})`}>
          <AppDataTable columns={itemColumns} data={matched} emptyMessage="Aucun colis inventorie" />
        </SectionCard>
        <SectionCard title={`Colis absents (${missing.length})`}>
          <AppDataTable columns={itemColumns} data={missing} emptyMessage="Aucun colis manquant" />
        </SectionCard>
        <SectionCard title={`Colis en plus (${extra.length})`}>
          <AppDataTable columns={itemColumns} data={extra} emptyMessage="Aucun colis inattendu" />
        </SectionCard>
      </ScrollView>

      <ConfirmDialog
        open={showClose}
        onClose={() => setShowClose(false)}
        onConfirm={() => close.mutate(undefined, { onSuccess: () => setShowClose(false) })}
        title="Cloturer l'inventaire"
        message={`Confirmer la cloture ? ${counts.missing ?? 0} manquant(s), ${counts.extra ?? 0} en plus.`}
        confirmLabel="Cloturer"
        loading={close.isPending}
      />

      {/* Present + note */}
      <AppDialog
        open={!!noteTarget}
        onClose={() => setNoteTarget(null)}
        title={noteTarget ? `Marquer present : ${noteTarget.trackingNumber}` : 'Marquage'}
        width={460}
        footer={
          <>
            <Button variant="ghost" onPress={() => setNoteTarget(null)}>Annuler</Button>
            <Button loading={mark.isPending} onPress={() => noteTarget && mark.mutate({ parcelId: noteTarget.id, present: true, observation: noteObs.trim() || undefined }, { onSuccess: () => setNoteTarget(null) })}>
              Confirmer
            </Button>
          </>
        }
      >
        <Input label="Observation" value={noteObs} onChangeText={setNoteObs} placeholder="Etat du colis, raison sans scan..." />
      </AppDialog>

      <ScannerDialog
        open={showScanner}
        onClose={() => setShowScanner(false)}
        onDetected={(code) => doScan(code, observation)}
        title="Scanner pour inventorier"
      />
    </View>
  );
}

function btnStyle(bg: string) {
  return { flexDirection: 'row' as const, alignItems: 'center' as const, gap: 4, paddingHorizontal: spacing.md, paddingVertical: 8, borderRadius: radius.md, backgroundColor: bg };
}
