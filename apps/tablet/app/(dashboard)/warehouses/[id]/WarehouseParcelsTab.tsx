import { useState } from 'react';
import { View, Text, Pressable } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { formatAmount } from '@transitsoftservices/shared';
import { SectionCard } from '@/components/data/DetailCards';
import { HeaderAction } from '@/components/data/PageHeader';
import { AppDataTable, type Column } from '@/components/data/AppDataTable';
import { RowActions } from '@/components/data/RowActions';
import { ScannerDialog } from '@/components/data/ScannerDialog';
import { EntityPicker } from '@/components/data/EntityPicker';
import { ParcelHandoverDialog } from '@/components/data/ParcelHandoverDialog';
import { AppDialog } from '@/components/forms/AppDialog';
import { Button } from '@/components/ui/Button';
import { Badge } from '@/components/ui/Badge';
import { ConfirmDialog } from '@/components/ui/ConfirmDialog';
import { parcelsApi } from '@/lib/api/parcels';
import { apiClient } from '@/lib/api/client';
import { searchers } from '@/lib/api/searchers';
import { useWarehouseSpaces, useMoveParcelToSpace } from '@/lib/hooks/useWarehouseSpaces';
import { toast } from '@/lib/toast';
import { colors } from '@/lib/theme/colors';
import { radius, spacing } from '@/lib/theme/spacing';
import { ParcelFormDialog } from '../../parcels/ParcelFormDialog';

type ScanMode = 'add' | 'remove' | 'transfer' | null;

export function WarehouseParcelsTab({ warehouseId, agencyId }: { warehouseId: string; agencyId?: string }) {
  const router = useRouter();
  const qc = useQueryClient();
  const [view, setView] = useState<'parcels' | 'groups'>('parcels');
  const [scanMode, setScanMode] = useState<ScanMode>(null);
  const [transferTarget, setTransferTarget] = useState({ id: '', name: '' });
  const [showTransferTarget, setShowTransferTarget] = useState(false);
  const [showCreate, setShowCreate] = useState(false);
  const [showUntracked, setShowUntracked] = useState(false);
  const [handoverParcel, setHandoverParcel] = useState<any | null>(null);
  const [moveParcel, setMoveParcel] = useState<any | null>(null);
  const [moveSpaceId, setMoveSpaceId] = useState<string | null>(null);
  const [confirmAction, setConfirmAction] = useState<{ kind: 'remove' | 'lost' | 'delete'; parcel: any } | null>(null);
  const [selected, setSelected] = useState<Set<string>>(new Set());

  const { data, isLoading } = useQuery({ queryKey: ['parcels', 'warehouse', warehouseId], queryFn: () => parcelsApi.list({ warehouseId, onlyPresent: 'true', limit: 50 } as never), enabled: !!warehouseId });
  const { data: groupsData } = useQuery({ queryKey: ['parcel-groups', 'agency', agencyId], queryFn: () => apiClient.get('/parcel-groups', { params: { agencyId } }).then((r) => r.data), enabled: view === 'groups' && !!agencyId });
  const { data: spacesData } = useWarehouseSpaces(warehouseId);
  const move = useMoveParcelToSpace(warehouseId);

  const parcels: any[] = data?.data ?? [];
  const groups: any[] = groupsData?.data ?? [];
  const spaces: any[] = (spacesData?.data ?? spacesData ?? []).filter((s: any) => s.isActive !== false);
  const invalidate = () => { qc.invalidateQueries({ queryKey: ['parcels'] }); qc.invalidateQueries({ queryKey: ['warehouses', warehouseId] }); };

  const findByTracking = async (raw: string) => {
    const r = await parcelsApi.search(raw.trim());
    const list: any[] = r?.data ?? [];
    return list.find((p) => p.trackingNumber === raw.trim()) ?? list[0];
  };

  const onScan = async (code: string) => {
    try {
      const p = await findByTracking(code);
      if (!p) { toast.error(`Introuvable : ${code}`); return; }
      if (scanMode === 'add') { await parcelsApi.setWarehouse(p.id, warehouseId); toast.success(`Ajoute : ${p.trackingNumber}`); }
      else if (scanMode === 'remove') {
        if (p.warehouseId !== warehouseId) { toast.error('Pas dans ce magasin'); return; }
        await parcelsApi.setWarehouse(p.id, null); toast.success(`Retire : ${p.trackingNumber}`);
      } else if (scanMode === 'transfer') {
        if (!transferTarget.id) { toast.error('Choisir un magasin destination'); return; }
        await parcelsApi.setWarehouse(p.id, transferTarget.id); toast.success(`Transfere : ${p.trackingNumber}`);
      }
      invalidate();
    } catch (e: any) {
      toast.error(e?.response?.data?.message ?? 'Echec');
    }
  };

  const doConfirm = async () => {
    if (!confirmAction) return;
    const { kind, parcel } = confirmAction;
    try {
      if (kind === 'remove') await parcelsApi.setWarehouse(parcel.id, null);
      else if (kind === 'lost') await parcelsApi.updateStatus(parcel.id, 'LOST');
      else if (kind === 'delete') await parcelsApi.remove(parcel.id);
      toast.success('Effectue');
      invalidate();
    } catch (e: any) {
      toast.error(e?.response?.data?.message ?? 'Echec');
    }
    setConfirmAction(null);
  };

  const transferSelected = async () => {
    if (!transferTarget.id || selected.size === 0) return;
    let ok = 0;
    for (const pid of selected) {
      try { await parcelsApi.setWarehouse(pid, transferTarget.id); ok++; } catch { /* skip */ }
    }
    toast.success(`${ok} colis transfere(s)`);
    setSelected(new Set());
    setTransferTarget({ id: '', name: '' });
    invalidate();
  };

  const toggleOne = (id: string) => setSelected((prev) => { const n = new Set(prev); n.has(id) ? n.delete(id) : n.add(id); return n; });
  const selectable = parcels.filter((p) => p.status === 'IN_STOCK');
  const allSelected = selectable.length > 0 && selectable.every((p) => selected.has(p.id));
  const toggleAll = () => setSelected((prev) => { const n = new Set(prev); if (allSelected) selectable.forEach((p) => n.delete(p.id)); else selectable.forEach((p) => n.add(p.id)); return n; });

  const parcelColumns: Column<any>[] = [
    { key: 'sel', label: '', width: 44, render: (r) => r.status === 'IN_STOCK' ? (
      <Pressable onPress={() => toggleOne(r.id)} hitSlop={8}><Ionicons name={selected.has(r.id) ? 'checkbox' : 'square-outline'} size={20} color={selected.has(r.id) ? colors.primary[600] : colors.gray[400]} /></Pressable>
    ) : <Text /> },
    { key: 'trackingNumber', label: 'Tracking', width: 150, render: (r) => <Text style={{ fontFamily: 'monospace', fontSize: 12, fontWeight: '700', color: colors.primary[700] }}>{r.trackingNumber}</Text> },
    { key: 'designation', label: 'Designation', width: 170 },
    { key: 'client', label: 'Client', width: 150, render: (r) => <Text style={{ fontSize: 13 }}>{r.client?.fullName ?? '-'}</Text> },
    { key: 'space', label: 'Zone', width: 120, render: (r) => <Text style={{ fontSize: 13, color: colors.gray[500] }}>{r.space?.name ?? '-'}</Text> },
    { key: 'price', label: 'Prix', width: 110, align: 'right', render: (r) => <Text style={{ fontSize: 13 }}>{formatAmount(Number(r.price ?? 0))}</Text> },
    { key: 'status', label: 'Statut', width: 120, render: (r) => <Badge>{r.status}</Badge> },
    {
      key: 'actions', label: '', width: 60, align: 'center',
      render: (r) => (
        <RowActions actions={[
          { label: 'Voir', icon: <Ionicons name="eye-outline" size={18} color={colors.gray[700]} />, onPress: () => router.push(`/parcels/${r.id}`) },
          { label: 'Remettre au client', icon: <Ionicons name="hand-left-outline" size={18} color={colors.gray[700]} />, onPress: () => setHandoverParcel(r) },
          { label: 'Deplacer vers une zone', icon: <Ionicons name="grid-outline" size={18} color={colors.gray[700]} />, onPress: () => { setMoveParcel(r); setMoveSpaceId(r.space?.id ?? null); } },
          { label: 'Transferer', icon: <Ionicons name="swap-horizontal-outline" size={18} color={colors.gray[700]} />, onPress: () => { setSelected(new Set([r.id])); setShowTransferTarget(true); } },
          { label: 'Retirer du magasin', icon: <Ionicons name="exit-outline" size={18} color={colors.gray[700]} />, onPress: () => setConfirmAction({ kind: 'remove', parcel: r }) },
          { label: 'Marquer perdu', icon: <Ionicons name="alert-circle-outline" size={18} color={colors.warning} />, onPress: () => setConfirmAction({ kind: 'lost', parcel: r }) },
          { label: 'Supprimer', icon: <Ionicons name="trash-outline" size={18} color={colors.error} />, onPress: () => setConfirmAction({ kind: 'delete', parcel: r }), variant: 'destructive' },
        ]} />
      ),
    },
  ];

  const groupColumns: Column<any>[] = [
    { key: 'reference', label: 'Reference', width: 160, render: (r) => <Text style={{ fontFamily: 'monospace', fontSize: 12, fontWeight: '700', color: colors.primary[700] }}>{r.reference}</Text> },
    { key: 'label', label: 'Libelle', width: 160, render: (r) => <Text style={{ fontSize: 13 }}>{r.label ?? '-'}</Text> },
    { key: 'client', label: 'Client', width: 150, render: (r) => <Text style={{ fontSize: 13 }}>{r.client?.fullName ?? '-'}</Text> },
    { key: 'parcels', label: 'Colis', width: 80, align: 'center', render: (r) => <Badge>{String(r._count?.parcels ?? r.parcels?.length ?? 0)}</Badge> },
    { key: 'status', label: 'Statut', width: 120, render: (r) => <Badge>{r.status}</Badge> },
  ];

  return (
    <View style={{ gap: spacing.lg }}>
      {/* Toggle Colis / Groupes */}
      <View style={{ flexDirection: 'row', gap: spacing.sm }}>
        {(['parcels', 'groups'] as const).map((v) => (
          <Pressable key={v} onPress={() => setView(v)} style={{ flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: spacing.lg, paddingVertical: 8, borderRadius: radius.md, backgroundColor: view === v ? colors.primary[50] : colors.gray[100] }}>
            <Ionicons name={v === 'parcels' ? 'cube-outline' : 'albums-outline'} size={16} color={view === v ? colors.primary[700] : colors.gray[500]} />
            <Text style={{ fontSize: 13, fontWeight: '600', color: view === v ? colors.primary[700] : colors.gray[600] }}>{v === 'parcels' ? 'Colis' : 'Groupes de colis'}</Text>
          </Pressable>
        ))}
      </View>

      {view === 'parcels' ? (
        <SectionCard title={`Colis dans ce magasin (${data?.meta?.total ?? parcels.length})`}>
          {/* Actions (ligne dediee, wrap) */}
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm, marginBottom: spacing.lg }}>
            <HeaderAction label="Voir tout" icon="open-outline" variant="outline" onPress={() => router.push('/parcels')} />
            <HeaderAction label="Remettre non enregistre" icon="hand-left-outline" variant="outline" onPress={() => setShowUntracked(true)} />
            <HeaderAction label="Ajouter par scan" icon="camera-outline" variant="outline" onPress={() => setScanMode('add')} />
            <HeaderAction label="Retirer par scan" icon="scan-outline" variant="outline" onPress={() => setScanMode('remove')} />
            <HeaderAction label="Transferer par scan" icon="swap-horizontal-outline" variant="outline" onPress={() => { setTransferTarget({ id: '', name: '' }); setShowTransferTarget(true); }} />
            <HeaderAction label="Ajouter colis" icon="add" onPress={() => setShowCreate(true)} />
          </View>

          {/* Selection bar */}
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.md, marginBottom: spacing.md, minHeight: 36 }}>
            <Pressable onPress={toggleAll} style={{ flexDirection: 'row', alignItems: 'center', gap: 6, height: 36 }}>
              <Ionicons name={allSelected ? 'checkbox' : 'square-outline'} size={20} color={allSelected ? colors.primary[600] : colors.gray[400]} />
              <Text style={{ fontSize: 13, color: colors.gray[600] }}>Tout cocher (page)</Text>
            </Pressable>
            {selected.size > 0 && (
              <>
                <View style={{ height: 36, justifyContent: 'center' }}>
                  <Badge variant="success">{`${selected.size} selectionne(s)`}</Badge>
                </View>
                <View style={{ flex: 1 }} />
                <Button size="sm" onPress={() => setShowTransferTarget(true)}>Transferer</Button>
                <Pressable onPress={() => setSelected(new Set())} style={{ height: 36, justifyContent: 'center' }}>
                  <Text style={{ fontSize: 13, color: colors.gray[500] }}>Annuler</Text>
                </Pressable>
              </>
            )}
          </View>
          <AppDataTable columns={parcelColumns} data={parcels} isLoading={isLoading} emptyMessage="Aucun colis" onRowClick={(r) => router.push(`/parcels/${r.id}`)} />
        </SectionCard>
      ) : (
        <SectionCard title={`Groupes de colis (${groups.length})`}>
          <AppDataTable columns={groupColumns} data={groups} emptyMessage="Aucun groupe" onRowClick={(r) => router.push(`/parcel-groups/${r.id}`)} />
        </SectionCard>
      )}

      {/* Scanner add/remove/transfer (chaine) */}
      <ScannerDialog
        open={scanMode !== null}
        onClose={() => setScanMode(null)}
        onDetected={onScan}
        closeOnDetect={false}
        title={scanMode === 'add' ? 'Ajouter par scan' : scanMode === 'remove' ? 'Retirer par scan' : `Transferer vers ${transferTarget.name}`}
      />

      {/* Choix magasin destination (transfert) */}
      <AppDialog
        open={showTransferTarget}
        onClose={() => setShowTransferTarget(false)}
        title="Magasin destination"
        width={460}
        footer={
          <>
            <Button variant="ghost" onPress={() => setShowTransferTarget(false)}>Annuler</Button>
            {selected.size > 0 ? (
              <Button disabled={!transferTarget.id} onPress={() => { setShowTransferTarget(false); transferSelected(); }}>{`Transferer ${selected.size}`}</Button>
            ) : (
              <Button disabled={!transferTarget.id} onPress={() => { setShowTransferTarget(false); setScanMode('transfer'); }}>Scanner</Button>
            )}
          </>
        }
      >
        <Text style={{ fontSize: 12, color: colors.gray[500] }}>Magasins de la meme agence uniquement.</Text>
        <EntityPicker
          value={transferTarget.id}
          name={transferTarget.name}
          onChange={(id, nm) => setTransferTarget({ id, name: nm })}
          searcher={(q) => searchers.warehouses(q, 20, agencyId ? { agencyId } : undefined)}
          queryKey="warehouses"
          placeholder="Choisir un magasin..."
        />
      </AppDialog>

      {/* Deplacer vers zone */}
      <AppDialog
        open={!!moveParcel}
        onClose={() => setMoveParcel(null)}
        title="Deplacer vers une zone"
        width={440}
        footer={
          <>
            <Button variant="ghost" onPress={() => setMoveParcel(null)}>Annuler</Button>
            <Button loading={move.isPending} onPress={() => moveParcel && move.mutate({ parcelId: moveParcel.id, spaceId: moveSpaceId }, { onSuccess: () => setMoveParcel(null) })}>Deplacer</Button>
          </>
        }
      >
        <Pressable onPress={() => setMoveSpaceId(null)} style={{ paddingVertical: 10, flexDirection: 'row', alignItems: 'center', gap: 8 }}>
          <Ionicons name={moveSpaceId === null ? 'radio-button-on' : 'radio-button-off'} size={18} color={colors.primary[600]} />
          <Text style={{ fontSize: 14, color: colors.gray[700] }}>Aucune zone</Text>
        </Pressable>
        {spaces.map((s) => (
          <Pressable key={s.id} onPress={() => setMoveSpaceId(s.id)} style={{ paddingVertical: 10, flexDirection: 'row', alignItems: 'center', gap: 8 }}>
            <Ionicons name={moveSpaceId === s.id ? 'radio-button-on' : 'radio-button-off'} size={18} color={colors.primary[600]} />
            <Text style={{ fontSize: 14, color: colors.gray[900] }}>{s.name} ({s.parcelCount ?? 0})</Text>
          </Pressable>
        ))}
      </AppDialog>

      <ParcelHandoverDialog open={!!handoverParcel} onClose={() => setHandoverParcel(null)} parcel={handoverParcel} onSuccess={invalidate} />
      <ParcelHandoverDialog open={showUntracked} onClose={() => setShowUntracked(false)} untracked={agencyId ? { agencyId, warehouseId } : null} onSuccess={invalidate} />
      <ParcelFormDialog open={showCreate} onClose={() => setShowCreate(false)} />

      <ConfirmDialog
        open={!!confirmAction}
        onClose={() => setConfirmAction(null)}
        onConfirm={doConfirm}
        title={confirmAction?.kind === 'delete' ? 'Supprimer le colis' : confirmAction?.kind === 'lost' ? 'Marquer perdu' : 'Retirer du magasin'}
        message={`Colis ${confirmAction?.parcel?.trackingNumber ?? ''}`}
        confirmLabel="Confirmer"
        variant={confirmAction?.kind === 'delete' ? 'destructive' : 'primary'}
      />
    </View>
  );
}
