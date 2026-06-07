import { z } from 'zod';
import { View } from 'react-native';
import { AppTextInput, AppSearchSelect, ResourceFormDialog } from '@/components/forms';
import { warehousesApi } from '@/lib/api/warehouses';
import { searchers } from '@/lib/api/searchers';
import { spacing } from '@/lib/theme/spacing';

const schema = z.object({
  name: z.string().min(1, 'Nom requis'),
  location: z.string().min(1, 'Localisation requise'),
  agencyId: z.string().min(1, 'Agence requise'),
  capacity: z.string().optional(),
});

interface Warehouse {
  id: string;
  name?: string;
  location?: string | null;
  agencyId?: string | null;
  agency?: { id?: string } | null;
  capacity?: number | null;
}

export function WarehouseFormDialog({
  open,
  onClose,
  warehouse,
  defaultAgencyId,
}: {
  open: boolean;
  onClose: () => void;
  warehouse?: Warehouse;
  defaultAgencyId?: string;
}) {
  const isEdit = !!warehouse;
  return (
    <ResourceFormDialog
      open={open}
      onClose={onClose}
      title={isEdit ? 'Modifier le magasin' : 'Nouveau magasin'}
      schema={schema}
      defaultValues={{
        name: warehouse?.name ?? '',
        location: warehouse?.location ?? '',
        agencyId: warehouse?.agencyId ?? warehouse?.agency?.id ?? defaultAgencyId ?? '',
        capacity: warehouse?.capacity != null ? String(warehouse.capacity) : '',
      }}
      submit={(v) => {
        const payload = { name: v.name, location: v.location, capacity: v.capacity ? Number(v.capacity) : undefined };
        return isEdit
          ? warehousesApi.update(warehouse!.id, payload)
          : warehousesApi.create({ ...payload, agencyId: v.agencyId });
      }}
      invalidate={[['warehouses']]}
      successMessage={isEdit ? 'Magasin mis a jour' : 'Magasin cree'}
      submitLabel={isEdit ? 'Enregistrer' : 'Creer'}
    >
      {(control) => (
        <>
          <AppTextInput control={control} name="name" label="Nom" required />
          <AppTextInput control={control} name="location" label="Localisation" required />
          <View style={{ flexDirection: 'row', gap: spacing.lg }}>
            <View style={{ flex: 1 }}>
              <AppSearchSelect
                control={control}
                name="agencyId"
                label="Agence"
                required
                search={(q) => searchers.agencies(q).then((items) => items.map((i) => ({ value: i.value, label: i.label, hint: i.sublabel ?? undefined })))}
              />
            </View>
            <View style={{ flex: 1 }}>
              <AppTextInput control={control} name="capacity" label="Capacite" keyboardType="numeric" />
            </View>
          </View>
        </>
      )}
    </ResourceFormDialog>
  );
}
