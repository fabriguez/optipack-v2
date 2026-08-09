/**
 * Codes promo du client mobilisables sur une facture, application en un tap.
 *
 * Affiche au guichet ce que le client peut utiliser sur ces colis : l'agent
 * n'a pas besoin de connaitre les codes. Les codes refuses restent visibles
 * (replies) avec leur motif, pour repondre au client qui presente un code qui
 * ne passe pas.
 */
import { useState } from 'react';
import { View, Text, ActivityIndicator, Pressable } from 'react-native';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Ionicons } from '@expo/vector-icons';
import { formatAmount } from '@transitsoftservices/shared';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import {
  invoicePromoApi,
  type InvoicePromoCandidates,
  type PromoCandidate,
} from '@/lib/api/promoCodes';
import { extractApiError } from '@/lib/api/errorMessage';
import { toast } from '@/lib/toast';
import { colors } from '@/lib/theme/colors';
import { radius, spacing } from '@/lib/theme/spacing';

interface Props {
  invoiceId: string;
  /** Appele apres application : rafraichir le solde / le montant saisi. */
  onApplied?: () => void;
}

/** Libelle court de la regle du code : "-10%" ou "-2 000 XAF". */
function discountLabel(c: PromoCandidate): string {
  return c.discountType === 'PERCENT' ? `-${c.discountValue}%` : `-${formatAmount(c.discountValue)}`;
}

export function ClientPromoCodePicker({ invoiceId, onApplied }: Props) {
  const qc = useQueryClient();
  const [showRejected, setShowRejected] = useState(false);

  const { data, isLoading } = useQuery({
    queryKey: ['invoice-promo-candidates', invoiceId],
    queryFn: () => invoicePromoApi.available(invoiceId),
    enabled: !!invoiceId,
  });

  const apply = useMutation({
    mutationFn: (code: string) => invoicePromoApi.apply(invoiceId, code),
    onSuccess: () => {
      toast.success('Code promo applique');
      qc.invalidateQueries({ queryKey: ['invoice-promo-candidates', invoiceId] });
      qc.invalidateQueries({ queryKey: ['invoices', invoiceId] });
      onApplied?.();
    },
    onError: (e) => toast.error(extractApiError(e, "Ce code n'a pas pu etre applique")),
  });

  const candidates: PromoCandidate[] = data?.data?.candidates ?? [];
  const applied: InvoicePromoCandidates['applied'] = data?.data?.applied ?? null;
  const eligible = candidates.filter((c) => c.evaluation.ok);
  const rejected = candidates.filter((c) => !c.evaluation.ok);

  // Un seul code par facture : si un code est deja pose, rien a proposer.
  if (applied) {
    return (
      <View
        style={{
          flexDirection: 'row',
          alignItems: 'center',
          gap: 8,
          backgroundColor: colors.primary[50],
          borderRadius: radius.md,
          padding: spacing.md,
        }}
      >
        <Ionicons name="pricetag" size={16} color={colors.primary[600]} />
        <Text style={{ flex: 1, fontSize: 12, fontWeight: '600', color: colors.gray[900] }} numberOfLines={2}>
          {applied.label ?? applied.code ?? 'Code promo applique'}
        </Text>
        <Text style={{ fontSize: 12, fontWeight: '700', color: colors.primary[600] }}>
          - {formatAmount(applied.discountAmount)}
        </Text>
      </View>
    );
  }

  if (isLoading) return <ActivityIndicator size="small" color={colors.gray[400]} />;
  if (candidates.length === 0) return null;

  return (
    <View style={{ gap: 8 }}>
      <Text style={{ fontSize: 11, fontWeight: '700', color: colors.gray[500], textTransform: 'uppercase' }}>
        Codes promo du client ({eligible.length} applicable{eligible.length > 1 ? 's' : ''})
      </Text>

      {eligible.map((c) => (
        <View
          key={c.id}
          style={{
            flexDirection: 'row',
            alignItems: 'center',
            gap: 10,
            backgroundColor: colors.primary[50],
            borderRadius: radius.md,
            padding: spacing.md,
          }}
        >
          <View style={{ flex: 1, gap: 2 }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
              <Text style={{ fontFamily: 'monospace', fontSize: 13, fontWeight: '700', color: colors.gray[900] }}>
                {c.code}
              </Text>
              <Badge>{discountLabel(c)}</Badge>
              {c.source === 'ASSIGNED' && <Badge variant="success">Attribue</Badge>}
            </View>
            <Text style={{ fontSize: 11, color: colors.gray[600] }} numberOfLines={1}>
              {c.label}
            </Text>
            <Text style={{ fontSize: 11, color: colors.gray[500] }}>
              Remise {formatAmount(c.evaluation.ok ? c.evaluation.discountAmount : 0)}
              {c.remainingUses != null ? ` · ${c.remainingUses} usage(s) restant(s)` : ''}
            </Text>
          </View>
          <Button size="sm" loading={apply.isPending} onPress={() => apply.mutate(c.code)}>
            Appliquer
          </Button>
        </View>
      ))}

      {eligible.length === 0 && (
        <Text style={{ fontSize: 11, color: colors.gray[500] }}>Aucun code applicable sur cette facture.</Text>
      )}

      {rejected.length > 0 && (
        <View style={{ gap: 4 }}>
          <Pressable
            onPress={() => setShowRejected((v) => !v)}
            style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}
            hitSlop={6}
          >
            <Ionicons name={showRejected ? 'chevron-up' : 'chevron-down'} size={12} color={colors.gray[500]} />
            <Text style={{ fontSize: 11, color: colors.gray[500] }}>
              {rejected.length} code(s) non applicable(s)
            </Text>
          </Pressable>
          {showRejected &&
            rejected.map((c) => (
              <View key={c.id} style={{ backgroundColor: colors.gray[50], borderRadius: radius.sm, padding: spacing.sm }}>
                <Text style={{ fontFamily: 'monospace', fontSize: 11, fontWeight: '700', color: colors.gray[700] }}>
                  {c.code} · {discountLabel(c)}
                </Text>
                <Text style={{ fontSize: 11, color: colors.error }}>
                  {c.evaluation.ok ? '' : c.evaluation.message}
                </Text>
              </View>
            ))}
        </View>
      )}
    </View>
  );
}
