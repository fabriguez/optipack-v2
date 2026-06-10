import { z } from 'zod';
import { View, Text } from 'react-native';
import { AppTextInput, AppPhoneInput, AppSearchSelect, AppSelect, AppSwitch, ResourceFormDialog } from '@/components/forms';
import { apiClient } from '@/lib/api/client';
import { employeesApi } from '@/lib/api/employees';
import { searchers } from '@/lib/api/searchers';
import { colors } from '@/lib/theme/colors';
import { spacing } from '@/lib/theme/spacing';

const schema = z.object({
  fullName: z.string().min(1, 'Nom requis'),
  email: z.string().email('Email invalide').optional().or(z.literal('')),
  phone: z.string().optional(),
  positionId: z.string().min(1, 'Poste requis'),
  position: z.string().optional(),
  agencyId: z.string().min(1, 'Agence requise'),
  idNumber: z.string().optional(),
  baseSalary: z.string().optional(),
  contractType: z.string().optional(),
  educationLevel: z.string().optional(),
  specialty: z.string().optional(),
  isAgencyManager: z.boolean().optional(),
  isActive: z.boolean().optional(),
  emergencyContactName: z.string().optional(),
  emergencyContactPhone: z.string().optional(),
  emergencyContactRelation: z.string().optional(),
});

const CONTRACTS = [{ value: 'CDI', label: 'CDI' }, { value: 'CDD', label: 'CDD' }, { value: 'STAGIAIRE', label: 'Stagiaire' }, { value: 'PRESTATAIRE', label: 'Prestataire' }];

async function searchPositions(q: string) {
  const { data } = await apiClient.get('/positions', { params: { search: q, limit: 10 } });
  const items = (data?.data ?? []) as Array<{ id: string; name: string; description?: string }>;
  return items.map((p) => ({ value: p.id, label: p.name, hint: p.description }));
}

export function EmployeeFormDialog({ open, onClose, employee }: { open: boolean; onClose: () => void; employee?: any }) {
  const isEdit = !!employee;
  return (
    <ResourceFormDialog
      open={open}
      onClose={onClose}
      title={isEdit ? "Modifier l'employe" : 'Nouvel employe'}
      schema={schema}
      defaultValues={{
        fullName: employee?.fullName ?? '', email: employee?.user?.email ?? employee?.email ?? '', phone: employee?.phone ?? '',
        positionId: employee?.positionId ?? '', position: employee?.position ?? '', agencyId: employee?.agencyId ?? employee?.agency?.id ?? '',
        idNumber: employee?.idNumber ?? '', baseSalary: employee?.baseSalary != null ? String(employee.baseSalary) : '',
        contractType: employee?.contractType ?? 'CDI', educationLevel: employee?.educationLevel ?? '', specialty: employee?.specialty ?? '',
        isAgencyManager: employee?.isAgencyManager ?? false, isActive: employee?.isActive ?? true,
        emergencyContactName: employee?.emergencyContactName ?? '', emergencyContactPhone: employee?.emergencyContactPhone ?? '', emergencyContactRelation: employee?.emergencyContactRelation ?? '',
      }}
      submit={(v) => {
        const payload = { ...v, email: v.email || undefined, baseSalary: v.baseSalary ? Number(v.baseSalary) : undefined };
        return isEdit ? employeesApi.update(employee.id, payload) : apiClient.post('/employees', payload);
      }}
      invalidate={[['employees']]}
      successMessage={isEdit ? 'Employe mis a jour' : 'Employe cree'}
      submitLabel={isEdit ? 'Enregistrer' : 'Creer'}
    >
      {(control) => (
        <>
          <AppTextInput control={control} name="fullName" label="Nom complet" required />
          <View style={{ flexDirection: 'row', gap: spacing.lg }}>
            <View style={{ flex: 1 }}><AppTextInput control={control} name="email" label="Email" keyboardType="email-address" autoCapitalize="none" /></View>
            <View style={{ flex: 1 }}><AppPhoneInput control={control} name="phone" label="Telephone" /></View>
          </View>
          <View style={{ flexDirection: 'row', gap: spacing.lg }}>
            <View style={{ flex: 1 }}><AppSearchSelect control={control} name="positionId" label="Poste" required search={searchPositions} /></View>
            <View style={{ flex: 1 }}><AppSearchSelect control={control} name="agencyId" label="Agence" required search={(q) => searchers.agencies(q).then((items) => items.map((i) => ({ value: i.value, label: i.label, hint: i.sublabel ?? undefined })))} /></View>
          </View>
          <View style={{ flexDirection: 'row', gap: spacing.lg }}>
            <View style={{ flex: 1 }}><AppTextInput control={control} name="idNumber" label="Matricule (auto si vide)" /></View>
            <View style={{ flex: 1 }}><AppTextInput control={control} name="baseSalary" label="Salaire de base" keyboardType="numeric" /></View>
          </View>
          <View style={{ flexDirection: 'row', gap: spacing.lg }}>
            <View style={{ flex: 1 }}><AppSelect control={control} name="contractType" label="Type de contrat" options={CONTRACTS} /></View>
            <View style={{ flex: 1 }}><AppTextInput control={control} name="educationLevel" label="Niveau d'etude" /></View>
          </View>
          <AppTextInput control={control} name="specialty" label="Specialite" />
          <AppSwitch control={control} name="isAgencyManager" label="Chef d'agence" hint="Valide conges/sanctions/pointage de l'agence" />
          {isEdit && <AppSwitch control={control} name="isActive" label="Actif" />}

          <Text style={{ fontSize: 13, fontWeight: '600', color: colors.gray[700], marginTop: spacing.sm }}>Contact d'urgence</Text>
          <View style={{ flexDirection: 'row', gap: spacing.lg }}>
            <View style={{ flex: 1 }}><AppTextInput control={control} name="emergencyContactName" label="Nom" /></View>
            <View style={{ flex: 1 }}><AppPhoneInput control={control} name="emergencyContactPhone" label="Telephone" /></View>
          </View>
          <AppTextInput control={control} name="emergencyContactRelation" label="Lien de parente" />
        </>
      )}
    </ResourceFormDialog>
  );
}
