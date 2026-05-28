import { useEffect, type ReactNode } from 'react';
import { Pressable, Text } from 'react-native';
import { useForm, type Control, type DefaultValues, type SubmitHandler } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { useMutation, useQueryClient, type QueryKey } from '@tanstack/react-query';
import type { z, ZodTypeAny } from 'zod';
import { AppDialog } from './AppDialog';
import { toast } from '@/lib/toast';
import { extractApiError } from '@/lib/api/errorMessage';
import { colors } from '@/lib/theme/colors';
import { radius, spacing } from '@/lib/theme/spacing';

interface ResourceFormDialogProps<S extends ZodTypeAny> {
  open: boolean;
  onClose: () => void;
  title: string;
  description?: string;
  schema: S;
  defaultValues: DefaultValues<z.infer<S>>;
  submit: (values: z.infer<S>) => Promise<unknown>;
  /** Query keys to invalidate after success. */
  invalidate?: QueryKey[];
  successMessage?: string;
  errorMessage?: string;
  children: (control: Control<z.infer<S>>) => ReactNode;
  submitLabel?: string;
}

export function ResourceFormDialog<S extends ZodTypeAny>({
  open,
  onClose,
  title,
  description,
  schema,
  defaultValues,
  submit,
  invalidate,
  successMessage = 'Enregistre',
  errorMessage = "Echec de l'enregistrement",
  children,
  submitLabel = 'Enregistrer',
}: ResourceFormDialogProps<S>) {
  const qc = useQueryClient();
  const { control, handleSubmit, reset } = useForm<z.infer<S>>({
    resolver: zodResolver(schema),
    defaultValues,
  });

  useEffect(() => {
    if (open) reset(defaultValues);
    // intentional: reset on each open to apply latest defaultValues
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  const mutation = useMutation({
    mutationFn: (values: z.infer<S>) => submit(values) as Promise<unknown>,
    onSuccess: () => {
      invalidate?.forEach((k) => qc.invalidateQueries({ queryKey: k }));
      toast.success(successMessage);
      onClose();
      reset(defaultValues);
    },
    onError: (e: unknown) => {
      const err = e as { isOfflineQueued?: boolean };
      if (err?.isOfflineQueued) {
        toast.info('Action mise en file - sera envoyee a la reconnexion');
        invalidate?.forEach((k) => qc.invalidateQueries({ queryKey: k }));
        onClose();
        reset(defaultValues);
        return;
      }
      toast.error(extractApiError(e, errorMessage));
    },
  });

  const onSubmit: SubmitHandler<z.infer<S>> = (values) => mutation.mutate(values);

  return (
    <AppDialog
      open={open}
      onClose={() => {
        reset(defaultValues);
        onClose();
      }}
      title={title}
      description={description}
      footer={
        <>
          <Pressable
            onPress={() => {
              reset(defaultValues);
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
            <Text style={{ fontSize: 14, color: colors.gray[700], fontWeight: '500' }}>Annuler</Text>
          </Pressable>
          <Pressable
            onPress={handleSubmit(onSubmit)}
            disabled={mutation.isPending}
            style={{
              height: 40,
              paddingHorizontal: spacing.lg,
              borderRadius: radius.md,
              alignItems: 'center',
              justifyContent: 'center',
              backgroundColor: colors.primary[500],
              opacity: mutation.isPending ? 0.6 : 1,
            }}
          >
            <Text style={{ fontSize: 14, color: colors.white, fontWeight: '600' }}>
              {mutation.isPending ? 'Envoi...' : submitLabel}
            </Text>
          </Pressable>
        </>
      }
    >
      {children(control)}
    </AppDialog>
  );
}
