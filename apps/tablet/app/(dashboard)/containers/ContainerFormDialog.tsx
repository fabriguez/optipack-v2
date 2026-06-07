import { z } from 'zod';
import { View } from 'react-native';
import { AppTextInput, AppSelect, AppSwitch, AppSearchSelect, ResourceFormDialog } from '@/components/forms';
import { containersApi } from '@/lib/api/containers';
import { searchers } from '@/lib/api/searchers';
import { spacing } from '@/lib/theme/spacing';

const schema = z.object({
  designation: z.string().optional(),
  type: z.string().min(1, 'Type requis'),
  capacity: z.string().min(1, 'Capacite requise'),
  departureAgencyId: z.string().min(1, 'Agence depart requise'),
  arrivalAgencyId: z.string().min(1, 'Agence arrivee requise'),
  transitRouteId: z.string().optional(),
  carrierId: z.string().optional(),
  carrierCost: z.string().optional(),
  isForwarding: z.boolean().optional(),
});

interface Container {
  id: string;
  designation?: string;
  type?: string;
  capacity?: number | string | null;
  departureAgency?: { id?: string } | null;
  arrivalAgency?: { id?: string } | null;
  departureAgencyId?: string | null;
  arrivalAgencyId?: string | null;
  transitRoute?: { id?: string } | null;
  carrierId?: string | null;
  carrierCost?: number | string | null;
  isForwarding?: boolean;
}

const sel = (q: string, fn: (q: string) => Promise<{ value: string; label: string; sublabel?: string | null }[]>) =>
  fn(q).then((i) => i.map((x) => ({ value: x.value, label: x.label })));

export function ContainerFormDialog({ open, onClose, container }: { open: boolean; onClose: () => void; container?: Container }) {
  const isEdit = !!container;
  return (
    <ResourceFormDialog
      open={open}
      onClose={onClose}
      title={isEdit ? 'Modifier le conteneur' : 'Nouveau conteneur'}
      schema={schema}
      defaultValues={{
        designation: container?.designation ?? '',
        type: container?.type ?? 'SEA',
        capacity: container?.capacity != null ? String(container.capacity) : '',
        departureAgencyId: container?.departureAgencyId ?? container?.departureAgency?.id ?? '',
        arrivalAgencyId: container?.arrivalAgencyId ?? container?.arrivalAgency?.id ?? '',
        transitRouteId: container?.transitRoute?.id ?? '',
        carrierId: container?.carrierId ?? '',
        carrierCost: container?.carrierCost != null ? String(container.carrierCost) : '',
        isForwarding: container?.isForwarding ?? false,
      }}
      submit={(v) => {
        const payload: Record<string, unknown> = {
          designation: v.designation || undefined,
          type: v.type,
          capacity: Number(v.capacity),
          transitRouteId: v.transitRouteId || undefined,
          carrierId: v.carrierId || undefined,
          carrierCost: v.carrierCost ? Number(v.carrierCost) : undefined,
        };
        if (!isEdit) {
          payload.departureAgencyId = v.departureAgencyId;
          payload.arrivalAgencyId = v.arrivalAgencyId;
          payload.isForwarding = !!v.isForwarding;
        }
        return isEdit ? containersApi.update(container!.id, payload) : containersApi.create(payload as never);
      }}
      invalidate={[['containers']]}
      successMessage={isEdit ? 'Conteneur mis a jour' : 'Conteneur cree'}
      submitLabel={isEdit ? 'Enregistrer' : 'Creer'}
    >
      {(control) => (
        <>
          <AppTextInput control={control} name="designation" label="Designation (auto si vide)" />
          <View style={{ flexDirection: 'row', gap: spacing.lg }}>
            <View style={{ flex: 1 }}>
              <AppSelect control={control} name="type" label="Type" required options={[{ value: 'AIR', label: 'Aerien' }, { value: 'SEA', label: 'Maritime' }, { value: 'LAND', label: 'Terrestre' }]} />
            </View>
            <View style={{ flex: 1 }}>
              <AppTextInput control={control} name="capacity" label="Capacite (kg/m3)" required keyboardType="decimal-pad" />
            </View>
          </View>
          <View style={{ flexDirection: 'row', gap: spacing.lg }}>
            <View style={{ flex: 1 }}><AppSearchSelect control={control} name="departureAgencyId" label="Agence depart" required search={(q) => sel(q, searchers.agencies)} /></View>
            <View style={{ flex: 1 }}><AppSearchSelect control={control} name="arrivalAgencyId" label="Agence arrivee" required search={(q) => sel(q, searchers.agencies)} /></View>
          </View>
          <AppSearchSelect control={control} name="transitRouteId" label="Route de transit (optionnel)" search={(q) => sel(q, searchers.transitRoutes)} />
          <View style={{ flexDirection: 'row', gap: spacing.lg }}>
            <View style={{ flex: 1 }}><AppSearchSelect control={control} name="carrierId" label="Transporteur (optionnel)" search={(q) => sel(q, searchers.carriers)} /></View>
            <View style={{ flex: 1 }}><AppTextInput control={control} name="carrierCost" label="Cout transport" keyboardType="decimal-pad" /></View>
          </View>
          {!isEdit && <AppSwitch control={control} name="isForwarding" label="Conteneur d'acheminement" hint="Regroupe d'autres conteneurs" />}
        </>
      )}
    </ResourceFormDialog>
  );
}
