import { useEffect } from 'react';
import { View } from 'react-native';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { AppDialog, AppTextInput, AppPhoneInput, AppSelect, AppSearchSelect } from '@/components/forms';
import { Button } from '@/components/ui/Button';
import { useCreateClient } from '@/lib/hooks/useClients';
import { searchers } from '@/lib/api/searchers';
import { spacing } from '@/lib/theme/spacing';

const schema = z.object({
  fullName: z.string().min(2, 'Nom requis'),
  phone: z.string().min(4, 'Telephone requis'),
  email: z.string().email('Email invalide').optional().or(z.literal('')),
  clientType: z.string().optional(),
  agencyId: z.string().min(1, 'Agence requise'),
});
type FormValues = z.infer<typeof schema>;

const TYPES = [
  { value: 'INDIVIDUAL', label: 'Particulier' },
  { value: 'COMPANY', label: 'Entreprise' },
  { value: 'PARTNER', label: 'Partenaire' },
];

/** Creation rapide d'un destinataire (mirror web RecipientQuickCreateDialog). */
export function RecipientQuickCreateDialog({
  open,
  onClose,
  initialName,
  onCreated,
}: {
  open: boolean;
  onClose: () => void;
  initialName?: string;
  onCreated: (id: string, name: string) => void;
}) {
  const create = useCreateClient();
  const { control, handleSubmit, reset } = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: { fullName: '', phone: '', email: '', clientType: 'INDIVIDUAL', agencyId: '' },
  });

  useEffect(() => {
    if (open) reset({ fullName: initialName ?? '', phone: '', email: '', clientType: 'INDIVIDUAL', agencyId: '' });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  const submit = handleSubmit(async (v) => {
    const res: any = await create.mutateAsync({
      fullName: v.fullName,
      phone: v.phone,
      email: v.email || undefined,
      clientType: v.clientType || 'INDIVIDUAL',
      agencyId: v.agencyId,
    } as never);
    const c = res?.data ?? res;
    if (c?.id) onCreated(c.id, c.fullName ?? v.fullName);
    reset();
    onClose();
  });

  return (
    <AppDialog
      open={open}
      onClose={() => { reset(); onClose(); }}
      title="Nouveau destinataire"
      width={480}
      footer={
        <>
          <Button variant="ghost" onPress={() => { reset(); onClose(); }}>Annuler</Button>
          <Button loading={create.isPending} onPress={submit}>Creer</Button>
        </>
      }
    >
      <AppTextInput control={control} name="fullName" label="Nom complet" required />
      <View style={{ flexDirection: 'row', gap: spacing.lg }}>
        <View style={{ flex: 1 }}>
          <AppPhoneInput control={control} name="phone" label="Telephone" required />
        </View>
        <View style={{ flex: 1 }}>
          <AppTextInput control={control} name="email" label="Email" keyboardType="email-address" autoCapitalize="none" />
        </View>
      </View>
      <View style={{ flexDirection: 'row', gap: spacing.lg }}>
        <View style={{ flex: 1 }}>
          <AppSelect control={control} name="clientType" label="Type" options={TYPES} />
        </View>
        <View style={{ flex: 1 }}>
          <AppSearchSelect control={control} name="agencyId" label="Agence" required search={(q) => searchers.agencies(q).then((i) => i.map((x) => ({ value: x.value, label: x.label })))} />
        </View>
      </View>
    </AppDialog>
  );
}
