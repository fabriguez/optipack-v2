'use client';

import { motion } from 'framer-motion';
import {
  Check,
  CircleAlert,
  Clock,
  ExternalLink,
  Hourglass,
  Loader2,
  RefreshCw,
  Smartphone,
} from 'lucide-react';
import type { ChargeAttempt, PaymentOrder } from '@transitsoftservices/payments';

export function PaymentStatusView({
  order,
  onRetry,
}: {
  order: PaymentOrder;
  onRetry: () => void;
}) {
  const latest = order.attempts[order.attempts.length - 1];
  const { Icon, color, title, body } = describe(order, latest);

  return (
    <motion.div
      initial={{ opacity: 0, y: 14 }}
      animate={{ opacity: 1, y: 0 }}
      className="p-6 skin-card"
    >
      <div className="flex items-center gap-3">
        <div
          className="flex h-12 w-12 items-center justify-center skin-radius-lg"
          style={{
            background: `color-mix(in oklab, ${color} 14%, transparent)`,
            color,
          }}
        >
          <Icon className="h-5 w-5" />
        </div>
        <div className="min-w-0">
          <h3
            className="text-base font-semibold skin-font-heading"
            style={{ color: 'var(--skin-foreground)' }}
          >
            {title}
          </h3>
          <p className="text-sm" style={{ color: 'var(--skin-muted)' }}>
            {body}
          </p>
        </div>
      </div>

      {latest?.next?.type === 'redirect' && (
        <div
          className="mt-4 flex items-start gap-3 p-4 skin-radius-sm"
          style={{
            background:
              'color-mix(in oklab, var(--skin-primary) 8%, transparent)',
            border: '1px dashed var(--skin-primary)',
          }}
        >
          <ExternalLink
            className="mt-0.5 h-5 w-5 shrink-0"
            style={{ color: 'var(--skin-primary)' }}
          />
          <div className="min-w-0 flex-1">
            <p
              className="text-sm font-semibold"
              style={{ color: 'var(--skin-foreground)' }}
            >
              Finalisation requise sur la page de paiement
            </p>
            <p className="mt-1 text-sm" style={{ color: 'var(--skin-muted)' }}>
              Cliquez sur le bouton ci-dessous pour completer votre paiement en toute securite.
            </p>
            <a
              href={latest.next.url}
              target="_blank"
              rel="noreferrer"
              className="mt-3 inline-flex items-center gap-2 px-4 py-2 text-sm font-semibold skin-btn-primary"
            >
              <ExternalLink className="h-4 w-4" />
              Finaliser sur TaraMoney
            </a>
          </div>
        </div>
      )}

      {latest?.next?.type === 'otp' && (
        <div
          className="mt-4 flex items-start gap-3 p-4 skin-radius-sm"
          style={{
            background:
              'color-mix(in oklab, var(--skin-primary) 8%, transparent)',
            border: '1px dashed var(--skin-primary)',
          }}
        >
          <Smartphone
            className="mt-0.5 h-5 w-5"
            style={{ color: 'var(--skin-primary)' }}
          />
          <div>
            <p
              className="text-sm font-semibold"
              style={{ color: 'var(--skin-foreground)' }}
            >
              Action requise sur votre telephone
            </p>
            <p className="mt-1 text-sm" style={{ color: 'var(--skin-muted)' }}>
              {latest.next.instruction}
            </p>
          </div>
        </div>
      )}

      {order.attempts.length > 1 && (
        <div className="mt-5">
          <p
            className="text-xs font-semibold uppercase tracking-[0.2em]"
            style={{ color: 'var(--skin-muted)' }}
          >
            Tentatives ({order.attempts.length})
          </p>
          <ul
            className="mt-2 space-y-1.5 border-l-2 pl-3"
            style={{ borderColor: 'var(--skin-border)' }}
          >
            {order.attempts.map((a, i) => (
              <li
                key={i}
                className="text-xs"
                style={{ color: 'var(--skin-foreground)' }}
              >
                <span
                  className="mr-2 inline-block h-1.5 w-1.5 rounded-full"
                  style={{
                    background:
                      a.status === 'SUCCEEDED'
                        ? '#16a34a'
                        : a.status === 'FAILED'
                        ? '#dc2626'
                        : 'var(--skin-primary)',
                  }}
                />
                <span className="font-semibold">{a.providerId}</span>
                <span className="ml-1" style={{ color: 'var(--skin-muted)' }}>
                  - {a.status}
                  {a.message ? ` (${a.message})` : ''}
                </span>
              </li>
            ))}
          </ul>
        </div>
      )}

      {order.status === 'FAILED' && (
        <button
          type="button"
          onClick={onRetry}
          className="mt-5 inline-flex items-center gap-2 px-4 py-2 text-sm font-semibold skin-btn-ghost"
        >
          <RefreshCw className="h-4 w-4" />
          Reessayer avec une autre methode
        </button>
      )}
    </motion.div>
  );
}

function describe(order: PaymentOrder, latest: ChargeAttempt | undefined) {
  switch (order.status) {
    case 'SUCCEEDED':
      return {
        Icon: Check,
        color: '#16a34a',
        title: 'Paiement valide',
        body: `Encaisse via ${order.finalProvider ?? 'le provider'}. Merci !`,
      };
    case 'FAILED':
      return {
        Icon: CircleAlert,
        color: '#dc2626',
        title: 'Echec du paiement',
        body: latest?.message ?? 'Aucun provider n\'a pu encaisser le montant.',
      };
    case 'EXPIRED':
      return {
        Icon: Clock,
        color: '#a16207',
        title: 'Expire',
        body: "Le delai d'autorisation est depasse. Reessayez.",
      };
    case 'CANCELLED':
      return {
        Icon: CircleAlert,
        color: 'var(--skin-muted)',
        title: 'Annule',
        body: "Vous avez annule la transaction.",
      };
    case 'AWAITING_USER_OTP':
      return {
        Icon: Hourglass,
        color: 'var(--skin-primary)',
        title: "En attente de votre confirmation",
        body: 'Verifiez votre telephone et validez avec votre code.',
      };
    case 'CHARGE_REQUESTED':
      return {
        Icon: Loader2,
        color: 'var(--skin-primary)',
        title: 'Demande envoyee...',
        body: 'On contacte le provider, patientez quelques secondes.',
      };
    default:
      return {
        Icon: Loader2,
        color: 'var(--skin-primary)',
        title: 'Initialisation',
        body: 'Preparation du paiement...',
      };
  }
}
