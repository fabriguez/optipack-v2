import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { Pressable, Text, View } from 'react-native';
import { AppDialog, AppTextInput, AppSearchSelect } from '@/components/forms';
import { useCreateParcel } from '@/lib/hooks/useParcels';
import { searchers } from '@/lib/api/searchers';
import { colors } from '@/lib/theme/colors';
import { radius, spacing } from '@/lib/theme/spacing';

const schema = z.object({
  designation: z.string().min(1, 'Designation requise'),
  clientId: z.string().min(1, 'Client requis'),
  recipientId: z.string().optional(),
  warehouseId: z.string().min(1, 'Magasin requis'),
  weight: z.string().optional(),
  observation: z.string().optional(),
});
type FormValues = z.infer<typeof schema>;

interface ParcelFormDialogProps {
  open: boolean;
  onClose: () => void;
}

export function ParcelFormDialog({ open, onClose }: ParcelFormDialogProps) {
  const create = useCreateParcel();
  const { control, handleSubmit, reset } = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: { designation: '', clientId: '', warehouseId: '', weight: '', observation: '' },
  });

  const onSubmit = handleSubmit(async (values) => {
    await create.mutateAsync({
      designation: values.designation,
      clientId: values.clientId,
      recipientId: values.recipientId || undefined,
      warehouseId: values.warehouseId,
      weight: values.weight ? Number(values.weight) : undefined,
      observation: values.observation || undefined,
    } as never);
    reset();
    onClose();
  });

  return (
    <AppDialog
      open={open}
      onClose={() => {
        reset();
        onClose();
      }}
      title="Nouveau colis"
      description="Enregistrer un colis (sera mis en file si hors ligne)"
      footer={
        <>
          <Pressable
            onPress={() => {
              reset();
              onClose();
            }}
            style={{
              height: 40,
              paddingHorizontal: spacing.lg,
              borderRadius: radius.md,
              alignItems: 'center',
              justifyContent: 'center',
              backgroundColor: colors.gray[100],
            }}
          >
            <Text style={{ fontSize: 14, fontWeight: '500', color: colors.gray[700] }}>Annuler</Text>
          </Pressable>
          <Pressable
            onPress={onSubmit}
            disabled={create.isPending}
            style={{
              height: 40,
              paddingHorizontal: spacing.lg,
              borderRadius: radius.md,
              alignItems: 'center',
              justifyContent: 'center',
              backgroundColor: colors.primary[500],
              opacity: create.isPending ? 0.6 : 1,
            }}
          >
            <Text style={{ fontSize: 14, fontWeight: '600', color: colors.white }}>
              {create.isPending ? 'Enregistrement...' : 'Enregistrer'}
            </Text>
          </Pressable>
        </>
      }
    >
      <AppTextInput control={control} name="designation" label="Designation" required />
      <View style={{ flexDirection: 'row', gap: spacing.lg }}>
        <View style={{ flex: 1 }}>
          <AppSearchSelect
            control={control}
            name="clientId"
            label="Client"
            required
            search={(q) =>
              searchers.clients(q).then((items) =>
                items.map((i) => ({ value: i.value, label: i.label, hint: i.sublabel ?? undefined })),
              )
            }
          />
        </View>
        <View style={{ flex: 1 }}>
          <AppSearchSelect
            control={control}
            name="recipientId"
            label="Destinataire"
            search={(q) =>
              searchers.recipients(q).then((items) =>
                items.map((i) => ({ value: i.value, label: i.label, hint: i.sublabel ?? undefined })),
              )
            }
          />
        </View>
      </View>
      <AppSearchSelect
        control={control}
        name="warehouseId"
        label="Magasin"
        required
        search={(q) =>
          searchers.warehouses(q).then((items) =>
            items.map((i) => ({ value: i.value, label: i.label, hint: i.sublabel ?? undefined })),
          )
        }
      />
      <View style={{ flexDirection: 'row', gap: spacing.lg }}>
        <View style={{ flex: 1 }}>
          <AppTextInput control={control} name="weight" label="Poids (kg)" keyboardType="decimal-pad" />
        </View>
      </View>
      <AppTextInput control={control} name="observation" label="Observation" multiline />
    </AppDialog>
  );
}
