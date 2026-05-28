import { z } from 'zod';
import { View } from 'react-native';
import { AppTextInput, AppPhoneInput, AppSearchSelect, AppSwitch, ResourceFormDialog } from '@/components/forms';
import { apiClient } from '@/lib/api/client';
import { searchers } from '@/lib/api/searchers';
import { spacing } from '@/lib/theme/spacing';

const schema = z.object({
  fullName: z.string().min(1, 'Nom requis'),
  email: z.string().email('Email invalide'),
  phone: z.string().min(4, 'Telephone requis'),
  positionId: z.string().min(1, 'Poste requis'),
  agencyId: z.string().min(1, 'Agence requise'),
  isActive: z.boolean().optional(),
});

async function searchPositions(q: string) {
  const { data } = await apiClient.get('/positions', { params: { search: q, limit: 10 } });
  const items = (data?.data ?? []) as Array<{ id: string; name: string; description?: string }>;
  return items.map((p) => ({ value: p.id, label: p.name, hint: p.description }));
}

export function EmployeeFormDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  return (
    <ResourceFormDialog
      open={open}
      onClose={onClose}
      title="Nouvel employe"
      schema={schema}
      defaultValues={{ fullName: '', email: '', phone: '', positionId: '', agencyId: '', isActive: true }}
      submit={(v) => apiClient.post('/employees', v)}
      invalidate={[['employees']]}
      successMessage="Employe cree"
    >
      {(control) => (
        <>
          <AppTextInput control={control} name="fullName" label="Nom complet" required />
          <View style={{ flexDirection: 'row', gap: spacing.lg }}>
            <View style={{ flex: 1 }}>
              <AppTextInput control={control} name="email" label="Email" required keyboardType="email-address" autoCapitalize="none" />
            </View>
            <View style={{ flex: 1 }}>
              <AppPhoneInput control={control} name="phone" label="Telephone" required />
            </View>
          </View>
          <View style={{ flexDirection: 'row', gap: spacing.lg }}>
            <View style={{ flex: 1 }}>
              <AppSearchSelect control={control} name="positionId" label="Poste" required search={searchPositions} />
            </View>
            <View style={{ flex: 1 }}>
              <AppSearchSelect
                control={control}
                name="agencyId"
                label="Agence"
                required
                search={(q) => searchers.agencies(q).then((items) => items.map((i) => ({ value: i.value, label: i.label, hint: i.sublabel ?? undefined })))}
              />
            </View>
          </View>
          <AppSwitch control={control} name="isActive" label="Actif" />
        </>
      )}
    </ResourceFormDialog>
  );
}
