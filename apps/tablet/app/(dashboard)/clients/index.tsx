import { useState } from 'react';
import { useRouter } from 'expo-router';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { Pressable, Text, View } from 'react-native';
import { ResourceListScreen } from '@/components/data/ResourceListScreen';
import { ListRow } from '@/components/data/ListRow';
import { AppDialog, AppTextInput, AppPhoneInput, AppSearchSelect } from '@/components/forms';
import { clientsApi } from '@/lib/api/clients';
import { useCreateClient } from '@/lib/hooks/useClients';
import { searchers } from '@/lib/api/searchers';
import { colors } from '@/lib/theme/colors';
import { radius, spacing } from '@/lib/theme/spacing';

interface Client {
  id: string;
  fullName: string;
  phone?: string | null;
  email?: string | null;
  clientType?: string | null;
  agency?: { name?: string } | null;
}

const schema = z.object({
  fullName: z.string().min(1, 'Nom requis'),
  phone: z.string().min(4, 'Telephone requis'),
  email: z.string().email('Email invalide').optional().or(z.literal('')),
  agencyId: z.string().min(1, 'Agence requise'),
});
type FormValues = z.infer<typeof schema>;

function ClientFormDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  const create = useCreateClient();
  const { control, handleSubmit, reset } = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: { fullName: '', phone: '', email: '', agencyId: '' },
  });
  const submit = handleSubmit(async (v) => {
    await create.mutateAsync({
      fullName: v.fullName,
      phone: v.phone,
      email: v.email || undefined,
      agencyId: v.agencyId,
    } as never);
    reset();
    onClose();
  });
  return (
    <AppDialog
      open={open}
      onClose={() => { reset(); onClose(); }}
      title="Nouveau client"
      footer={
        <>
          <Pressable onPress={() => { reset(); onClose(); }} style={{ height: 40, paddingHorizontal: spacing.lg, borderRadius: radius.md, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.gray[100] }}>
            <Text style={{ fontSize: 14, color: colors.gray[700], fontWeight: '500' }}>Annuler</Text>
          </Pressable>
          <Pressable onPress={submit} disabled={create.isPending} style={{ height: 40, paddingHorizontal: spacing.lg, borderRadius: radius.md, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.primary[500], opacity: create.isPending ? 0.6 : 1 }}>
            <Text style={{ fontSize: 14, color: colors.white, fontWeight: '600' }}>{create.isPending ? '...' : 'Enregistrer'}</Text>
          </Pressable>
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
      <AppSearchSelect
        control={control}
        name="agencyId"
        label="Agence"
        required
        search={(q) => searchers.agencies(q).then((items) => items.map((i) => ({ value: i.value, label: i.label, hint: i.sublabel ?? undefined })))}
      />
    </AppDialog>
  );
}

export default function ClientsScreen() {
  const [open, setOpen] = useState(false);
  const router = useRouter();
  return (
    <>
      <ResourceListScreen<Client>
        title="Clients"
        subtitle="Annuaire clients"
        queryKey={['clients']}
        fetcher={(params) => clientsApi.list(params)}
        keyExtractor={(c) => c.id}
        createPermission="client.create"
        onCreate={() => setOpen(true)}
        renderRow={(c) => (
          <ListRow
            title={c.fullName}
            subtitle={c.phone ?? undefined}
            metadata={[c.email ?? '', c.agency?.name ?? '', c.clientType ?? '']}
            onPress={() => router.push(`/(dashboard)/clients/${c.id}` as never)}
          />
        )}
      />
      <ClientFormDialog open={open} onClose={() => setOpen(false)} />
    </>
  );
}
