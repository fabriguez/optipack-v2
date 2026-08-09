/**
 * Saisie d'un code promo sur une facture, cote client.
 *
 * Deux etats :
 *  - aucun code pose : champ de saisie + bouton "Appliquer". Le code est
 *    d'abord simule (preview) pour afficher un message d'erreur explicite
 *    sans rien ecrire, puis applique.
 *  - code deja pose : rappel du libelle + montant de la remise, avec un
 *    bouton "Retirer" tant que la facture n'est pas soldee.
 *
 * Toute mutation invalide la facture pour que le solde a payer se recalcule.
 */
import { useState } from 'react';
import { View, Text, ActivityIndicator, Pressable } from 'react-native';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Ionicons } from '@expo/vector-icons';
import { Card, CardHeader } from '@/components/ui/Card';
import { Input } from '@/components/ui/Input';
import { Button } from '@/components/ui/Button';
import { portalApi } from '@/lib/api/portal';
import { colors, radius, spacing } from '@/lib/theme/colors';
import { formatAmount } from '@transitsoftservices/shared';
import { toast } from '@/lib/toast';

interface PromoCodeFieldProps {
  invoiceId: string;
  /** Remise promo deja posee sur la facture (0 = aucun code). */
  promoDiscount: number;
  promoCodeLabel: string | null;
  /** Facture soldee : le code n'est plus modifiable. */
  locked?: boolean;
}

/** Message d'erreur exploitable, quelle que soit la forme de la reponse API. */
function errorMessage(err: unknown, fallback: string): string {
  const data = (err as { response?: { data?: { message?: string } } })?.response?.data;
  return data?.message ?? fallback;
}

export function PromoCodeField({
  invoiceId,
  promoDiscount,
  promoCodeLabel,
  locked,
}: PromoCodeFieldProps) {
  const qc = useQueryClient();
  const [code, setCode] = useState('');
  const [error, setError] = useState<string | null>(null);

  const refresh = () => {
    qc.invalidateQueries({ queryKey: ['portal', 'invoices', invoiceId] });
    qc.invalidateQueries({ queryKey: ['portal', 'invoices'] });
  };

  const apply = useMutation({
    mutationFn: async (raw: string) => {
      // Simulation d'abord : le verdict porte un message affichable tel quel
      // (code inconnu, expire, quota atteint, montant hors bornes...).
      const preview = await portalApi.previewPromoCode(invoiceId, raw);
      const evaluation = preview?.data?.evaluation;
      if (evaluation && evaluation.ok === false) {
        throw new Error(evaluation.message ?? 'Code promo non applicable.');
      }
      return portalApi.applyPromoCode(invoiceId, raw);
    },
    onSuccess: () => {
      setCode('');
      setError(null);
      toast.success('Code promo applique.');
      refresh();
    },
    onError: (err) => {
      const msg = err instanceof Error && err.message
        ? err.message
        : errorMessage(err, 'Code promo non applicable.');
      setError(msg);
    },
  });

  const remove = useMutation({
    mutationFn: () => portalApi.removePromoCode(invoiceId),
    onSuccess: () => {
      setError(null);
      toast.success('Code promo retire.');
      refresh();
    },
    onError: (err) => setError(errorMessage(err, 'Retrait impossible.')),
  });

  const busy = apply.isPending || remove.isPending;

  if (promoDiscount > 0) {
    return (
      <Card>
        <CardHeader title="Code promo" />
        <View
          style={{
            flexDirection: 'row',
            alignItems: 'center',
            gap: 10,
            backgroundColor: colors.primary[50],
            borderRadius: radius.md,
            padding: spacing.md,
          }}
        >
          <Ionicons name="pricetag" size={18} color={colors.primary[600]} />
          <View style={{ flex: 1 }}>
            <Text style={{ fontSize: 13, fontWeight: '700', color: colors.gray[900] }} numberOfLines={2}>
              {promoCodeLabel ?? 'Code promo applique'}
            </Text>
            <Text style={{ fontSize: 12, color: colors.primary[600], fontWeight: '600' }}>
              - {formatAmount(promoDiscount)}
            </Text>
          </View>
          {!locked && (
            <Pressable onPress={() => remove.mutate()} disabled={busy} hitSlop={8} style={{ padding: 4 }}>
              {remove.isPending ? (
                <ActivityIndicator size="small" color={colors.gray[500]} />
              ) : (
                <Text style={{ fontSize: 12, fontWeight: '600', color: colors.gray[600] }}>Retirer</Text>
              )}
            </Pressable>
          )}
        </View>
        {error && <Text style={{ fontSize: 11, color: colors.error, marginTop: 6 }}>{error}</Text>}
      </Card>
    );
  }

  if (locked) return null;

  return (
    <Card>
      <CardHeader title="Code promo" subtitle="Saisissez un code pour reduire le montant a payer" />
      <View style={{ gap: 8 }}>
        <Input
          placeholder="Ex : BIENVENUE10"
          value={code}
          onChangeText={(v) => {
            setCode(v.toUpperCase());
            if (error) setError(null);
          }}
          autoCapitalize="characters"
          autoCorrect={false}
          error={error ?? undefined}
        />
        <Button
          onPress={() => apply.mutate(code.trim())}
          disabled={busy || code.trim().length === 0}
          loading={apply.isPending}
        >
          Appliquer
        </Button>
      </View>
    </Card>
  );
}
