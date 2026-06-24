import { z } from 'zod';
import { View } from 'react-native';
import { useWatch, type Control } from 'react-hook-form';
import { AppTextInput, AppSelect, AppSwitch, AppSearchSelect, ResourceFormDialog } from '@/components/forms';
import { transitRoutesApi } from '@/lib/api/transitRoutes';
import type { TransitRoute } from '@/lib/hooks/useTransitRoutes';
import { COUNTRIES } from '@/lib/data/countries';
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
  addedValueType: z.string().optional(),
  addedValue: z.string().optional(),
  isActive: z.boolean().optional(),
});
type FormValues = z.infer<typeof schema>;

const ADDED_VALUE_OPTIONS = [
  { value: 'NONE', label: 'Aucune' },
  { value: 'AMOUNT', label: 'Montant fixe' },
  { value: 'PERCENT', label: 'Pourcentage' },
];

/** Champ "Valeur ajoutee" affiche uniquement quand un type est selectionne. */
function AddedValueField({ control }: { control: Control<FormValues> }) {
  const type = useWatch({ control, name: 'addedValueType' });
  if (!type || type === 'NONE') return null;
  return (
    <View style={{ flex: 1 }}>
      <AppTextInput
        control={control}
        name="addedValue"
        label={type === 'PERCENT' ? 'Valeur ajoutee (%)' : 'Valeur ajoutee (FCFA)'}
        keyboardType="decimal-pad"
        required
      />
    </View>
  );
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
        addedValueType: route?.addedValueType ?? 'NONE',
        addedValue: route?.addedValue != null ? String(route.addedValue) : '',
        isActive: route?.isActive ?? true,
      }}
      submit={(v) => {
        const hasAddedValue = v.addedValueType === 'AMOUNT' || v.addedValueType === 'PERCENT';
        const addedValue = hasAddedValue && v.addedValue ? Number(v.addedValue) : null;
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
          addedValue: addedValue && addedValue > 0 ? addedValue : null,
          addedValueType: addedValue && addedValue > 0 ? v.addedValueType : null,
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
            <View style={{ flex: 1 }}><AppSearchSelect control={control} name="departureCountry" label="Pays depart" required items={COUNTRIES} /></View>
          </View>
          <View style={{ flexDirection: 'row', gap: spacing.lg }}>
            <View style={{ flex: 1 }}><AppTextInput control={control} name="arrivalCity" label="Ville arrivee" required /></View>
            <View style={{ flex: 1 }}><AppSearchSelect control={control} name="arrivalCountry" label="Pays arrivee" required items={COUNTRIES} /></View>
          </View>
          <View style={{ flexDirection: 'row', gap: spacing.lg }}>
            <View style={{ flex: 1 }}><AppTextInput control={control} name="pricePerKg" label="Prix /kg (Aerien/Terrestre)" keyboardType="decimal-pad" /></View>
            <View style={{ flex: 1 }}><AppTextInput control={control} name="pricePerVolume" label="Prix /m3 (Maritime/Terrestre)" keyboardType="decimal-pad" /></View>
          </View>
          <View style={{ flexDirection: 'row', gap: spacing.lg }}>
            <View style={{ flex: 1 }}>
              <AppSelect control={control} name="addedValueType" label="Type de valeur ajoutee" options={ADDED_VALUE_OPTIONS} />
            </View>
            <AddedValueField control={control} />
          </View>
          <AppSwitch control={control} name="isActive" label="Active" />
        </>
      )}
    </ResourceFormDialog>
  );
}
