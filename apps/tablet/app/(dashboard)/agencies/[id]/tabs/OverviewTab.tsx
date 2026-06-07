import { useState } from 'react';
import { View, Text } from 'react-native';
import { formatAmount } from '@transitsoftservices/shared';
import { AppDataTable, type Column } from '@/components/data/AppDataTable';
import { HeaderAction } from '@/components/data/PageHeader';
import { SectionCard, InfoCard } from '../_components';
import { useAgencyWarehouses, useAgencyClients } from '@/lib/hooks/useAgencyDetail';
import { WarehouseFormDialog } from '../../../warehouses/WarehouseFormDialog';
import { Badge } from '@/components/ui/Badge';
import { colors } from '@/lib/theme/colors';
import { spacing } from '@/lib/theme/spacing';

export function OverviewTab({ agency, cash }: { agency: any; cash: any }) {
  const id = agency.id as string;
  const { data: warehousesData } = useAgencyWarehouses(id);
  const { data: clientsData } = useAgencyClients(id);
  const [showWarehouse, setShowWarehouse] = useState(false);

  const warehouses = warehousesData?.data ?? [];
  const clients = clientsData?.data ?? [];

  const warehouseColumns: Column<any>[] = [
    { key: 'name', label: 'Nom', width: 200, render: (r) => <Text style={{ fontSize: 14, fontWeight: '500', color: colors.primary[700] }}>{r.name}</Text> },
    { key: 'location', label: 'Emplacement', width: 200 },
    { key: '_count', label: 'Colis', width: 90, align: 'center', render: (r) => <Text style={{ fontSize: 14 }}>{r._count?.parcels ?? 0}</Text> },
  ];

  const clientColumns: Column<any>[] = [
    { key: 'fullName', label: 'Nom', width: 200, render: (r) => <Text style={{ fontSize: 14, fontWeight: '500', color: colors.primary[700] }}>{r.fullName}</Text> },
    { key: 'phone', label: 'Telephone', width: 160 },
    { key: 'loyaltyTier', label: 'Fidelite', width: 120, render: (r) => <Badge>{r.loyaltyTier ?? '-'}</Badge> },
  ];

  return (
    <View style={{ gap: spacing.xl }}>
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: spacing.md }}>
        <InfoCard icon="location-outline" label="Adresse" value={agency.address || '-'} />
        <InfoCard icon="call-outline" label="Telephone" value={agency.phone || '-'} />
        <InfoCard icon="mail-outline" label="Email" value={agency.email || 'Non renseigne'} />
        <InfoCard icon="cash-outline" label="Solde caisse" value={cash ? formatAmount(Number(cash.currentBalance)) : '-'} />
      </View>

      <SectionCard
        title={`Magasins (${warehouses.length})`}
        action={<HeaderAction label="Ajouter" icon="add" onPress={() => setShowWarehouse(true)} />}
      >
        <AppDataTable columns={warehouseColumns} data={warehouses} emptyMessage="Aucun magasin" />
      </SectionCard>

      <SectionCard title={`Clients (${clientsData?.meta?.total ?? clients.length})`}>
        <AppDataTable columns={clientColumns} data={clients} emptyMessage="Aucun client" />
      </SectionCard>

      <WarehouseFormDialog open={showWarehouse} onClose={() => setShowWarehouse(false)} />
    </View>
  );
}
