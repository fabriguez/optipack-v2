import { z } from 'zod';
import { View } from 'react-native';
import { AppTextInput, AppSelect, AppSwitch, ResourceFormDialog } from '@/components/forms';
import { transitRoutesApi } from '@/lib/api/transitRoutes';
import { spacing } from '@/lib/theme/spacing';

const schema = z.object({
  name: z.string().min(2, 'Nom requis'),
  type: z.string().min(1, 'Type requis'),
  departureCity: z.string().min(2, 'Ville depart requise'),
  departureCountry: z.string().min(2, 'Pays depart requis'),
  arrivalCity: z.string().min(2, 'Ville arrivee requise'),
  arrivalCountry: z.string().min(2, 'Pays arrivee requis'),
  pricePerKg: z.string().optional(),
  pricePerVolume: z.string().optional(),
  estimatedDurationDays: z.string().optional(),
  isActive: z.boolean().optional(),
});

interface TransitRoute {
  id: string;
  name?: string;
  type?: string;
  departureCity?: string;
  departureCountry?: string;
  arrivalCity?: string;
  arrivalCountry?: string;
  pricePerKg?: number | string | null;
  pricePerVolume?: number | string | null;
  estimatedDurationDays?: number | null;
  isActive?: boolean;
}

export function TransitRouteFormDialog({ open, onClose, route }: { open: boolean; onClose: () => void; route?: TransitRoute }) {
  const isEdit = !!route;
  return (
    <ResourceFormDialog
      open={open}
      onClose={onClose}
      title={isEdit ? 'Modifier la route' : 'Nouvelle route de transit'}
      schema={schema}
      defaultValues={{
        name: route?.name ?? '',
        type: route?.type ?? 'AIR',
        departureCity: route?.departureCity ?? '',
        departureCountry: route?.departureCountry ?? '',
        arrivalCity: route?.arrivalCity ?? '',
        arrivalCountry: route?.arrivalCountry ?? '',
        pricePerKg: route?.pricePerKg != null ? String(route.pricePerKg) : '',
        pricePerVolume: route?.pricePerVolume != null ? String(route.pricePerVolume) : '',
        estimatedDurationDays: route?.estimatedDurationDays != null ? String(route.estimatedDurationDays) : '',
        isActive: route?.isActive ?? true,
      }}
      submit={(v) => {
        const payload = {
          name: v.name,
          type: v.type,
          departureCity: v.departureCity,
          departureCountry: v.departureCountry,
          arrivalCity: v.arrivalCity,
          arrivalCountry: v.arrivalCountry,
          pricePerKg: v.type === 'SEA' ? null : v.pricePerKg ? Number(v.pricePerKg) : null,
          pricePerVolume: v.type === 'AIR' ? null : v.pricePerVolume ? Number(v.pricePerVolume) : null,
          estimatedDurationDays: v.estimatedDurationDays ? Number(v.estimatedDurationDays) : 0,
          isActive: v.isActive ?? true,
        };
        return isEdit ? transitRoutesApi.update(route!.id, payload) : transitRoutesApi.create(payload);
      }}
      invalidate={[['transit-routes']]}
      successMessage={isEdit ? 'Route mise a jour' : 'Route creee'}
      submitLabel={isEdit ? 'Enregistrer' : 'Creer'}
    >
      {(control) => (
        <>
          <AppTextInput control={control} name="name" label="Nom" required />
          <View style={{ flexDirection: 'row', gap: spacing.lg }}>
            <View style={{ flex: 1 }}>
              <AppSelect control={control} name="type" label="Type" required options={[{ value: 'AIR', label: 'Aerien' }, { value: 'SEA', label: 'Maritime' }, { value: 'LAND', label: 'Terrestre' }]} />
            </View>
            <View style={{ flex: 1 }}>
              <AppTextInput control={control} name="estimatedDurationDays" label="Delai (jours)" keyboardType="number-pad" />
            </View>
          </View>
          <View style={{ flexDirection: 'row', gap: spacing.lg }}>
            <View style={{ flex: 1 }}><AppTextInput control={control} name="departureCity" label="Ville depart" required /></View>
            <View style={{ flex: 1 }}><AppTextInput control={control} name="departureCountry" label="Pays depart" required /></View>
          </View>
          <View style={{ flexDirection: 'row', gap: spacing.lg }}>
            <View style={{ flex: 1 }}><AppTextInput control={control} name="arrivalCity" label="Ville arrivee" required /></View>
            <View style={{ flex: 1 }}><AppTextInput control={control} name="arrivalCountry" label="Pays arrivee" required /></View>
          </View>
          <View style={{ flexDirection: 'row', gap: spacing.lg }}>
            <View style={{ flex: 1 }}><AppTextInput control={control} name="pricePerKg" label="Prix /kg (Aerien/Terrestre)" keyboardType="decimal-pad" /></View>
            <View style={{ flex: 1 }}><AppTextInput control={control} name="pricePerVolume" label="Prix /m3 (Maritime/Terrestre)" keyboardType="decimal-pad" /></View>
          </View>
          <AppSwitch control={control} name="isActive" label="Active" />
        </>
      )}
    </ResourceFormDialog>
  );
}
