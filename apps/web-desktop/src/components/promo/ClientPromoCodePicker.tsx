
import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Ticket, ChevronDown, ChevronUp } from 'lucide-react';
import { toast } from 'sonner';
import { AppButton } from '@/components/ui/AppButton';
import { AppBadge } from '@/components/ui/AppBadge';
import { invoicePromoApi, type PromoCandidate } from '@/lib/api/promoCodes';
import { extractApiError } from '@/lib/api/errorMessage';
import { usePermission } from '@/lib/hooks/usePermission';
import { formatAmount } from '@transitsoftservices/shared';

interface Props {
  invoiceId: string;
  /** Facture soldee / annulee : lecture seule. */
  disabled?: boolean;
  /** Appele apres application d'un code (rafraichir la facture appelante). */
  onApplied?: () => void;
}

/** Libelle court de la regle du code : "-10%" ou "-2 000 XAF". */
function discountLabel(c: PromoCandidate): string {
  return c.discountType === 'PERCENT'
    ? `-${c.discountValue}%`
    : `-${formatAmount(c.discountValue)}`;
}

/**
 * Codes promo du client mobilisables sur une facture, avec application en un
 * clic depuis le guichet.
 *
 * L'agent n'a pas a connaitre les codes du client : l'API renvoie les
 * attributions nominatives et les codes publics valides, deja evalues contre
 * les colis de la facture. Les codes non applicables restent affiches (repliés)
 * avec leur motif de refus, pour que l'agent puisse repondre au client qui
 * presente un code refuse.
 */
export function ClientPromoCodePicker({ invoiceId, disabled, onApplied }: Props) {
  const qc = useQueryClient();
  const canApply = usePermission('promocode.apply');
  const [showRejected, setShowRejected] = useState(false);

  const { data, isLoading } = useQuery({
    queryKey: ['invoice-promo-candidates', invoiceId],
    queryFn: () => invoicePromoApi.available(invoiceId),
    enabled: !!invoiceId,
  });

  const applyMutation = useMutation({
    mutationFn: (code: string) => invoicePromoApi.apply(invoiceId, code),
    onSuccess: () => {
      toast.success('Code promo applique');
      qc.invalidateQueries({ queryKey: ['invoice-promo-candidates', invoiceId] });
      qc.invalidateQueries({ queryKey: ['invoices', invoiceId] });
      qc.invalidateQueries({ queryKey: ['invoice-for-payment', invoiceId] });
      onApplied?.();
    },
    onError: (e) => toast.error(extractApiError(e, "Ce code n'a pas pu etre applique")),
  });

  const candidates = data?.data?.candidates ?? [];
  const applied = data?.data?.applied ?? null;
  const eligible = candidates.filter((c) => c.evaluation.ok);
  const rejected = candidates.filter((c) => !c.evaluation.ok);

  // Un code est deja pose : le panneau parent affiche la remise et le retrait,
  // proposer d'autres codes ici n'aurait pas de sens (un seul code par facture).
  if (applied) return null;
  if (isLoading) {
    return <p className="text-xs text-gray-500">Recherche des codes promo du client...</p>;
  }
  if (candidates.length === 0) return null;

  return (
    <div className="space-y-2">
      <div className="flex items-center gap-2">
        <Ticket className="h-4 w-4 text-primary-600" />
        <p className="text-xs font-semibold uppercase tracking-wider text-gray-500">
          Codes promo du client ({eligible.length} applicable{eligible.length > 1 ? 's' : ''})
        </p>
      </div>

      {eligible.length === 0 ? (
        <p className="text-xs text-gray-500">
          Aucun code applicable sur cette facture.
        </p>
      ) : (
        <ul className="space-y-2">
          {eligible.map((c) => (
            <li
              key={c.id}
              className="flex items-center justify-between gap-3 rounded-xl border border-primary-100 bg-primary-50/40 p-3"
            >
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="font-mono text-sm font-semibold text-gray-900">{c.code}</span>
                  <AppBadge variant="default">{discountLabel(c)}</AppBadge>
                  {c.source === 'ASSIGNED' && <AppBadge variant="success">Attribue</AppBadge>}
                </div>
                <p className="truncate text-xs text-gray-600">{c.label}</p>
                <p className="text-xs text-gray-500">
                  Remise :{' '}
                  <span className="font-semibold text-emerald-700">
                    {formatAmount(c.evaluation.ok ? c.evaluation.discountAmount : 0)}
                  </span>
                  {c.remainingUses != null && ` - ${c.remainingUses} usage(s) restant(s)`}
                  {c.expiresAt && ` - expire le ${new Date(c.expiresAt).toLocaleDateString('fr-FR')}`}
                </p>
              </div>
              {canApply && (
                <AppButton
                  type="button"
                  size="sm"
                  disabled={disabled || applyMutation.isPending}
                  loading={applyMutation.isPending && applyMutation.variables === c.code}
                  onClick={() => applyMutation.mutate(c.code)}
                >
                  Appliquer
                </AppButton>
              )}
            </li>
          ))}
        </ul>
      )}

      {rejected.length > 0 && (
        <div>
          <button
            type="button"
            onClick={() => setShowRejected((v) => !v)}
            className="flex items-center gap-1 text-xs text-gray-500 hover:text-gray-700"
          >
            {showRejected ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />}
            {rejected.length} code(s) non applicable(s)
          </button>
          {showRejected && (
            <ul className="mt-2 space-y-1">
              {rejected.map((c) => (
                <li key={c.id} className="rounded-lg bg-gray-50 px-3 py-2">
                  <div className="flex items-center gap-2">
                    <span className="font-mono text-xs font-semibold text-gray-700">{c.code}</span>
                    <span className="text-xs text-gray-500">{discountLabel(c)}</span>
                  </div>
                  <p className="text-xs text-red-600">
                    {c.evaluation.ok ? '' : c.evaluation.message}
                  </p>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}
