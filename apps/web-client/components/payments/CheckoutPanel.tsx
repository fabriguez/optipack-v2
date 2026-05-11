'use client';

import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { CreditCard, Smartphone, Banknote } from 'lucide-react';
import { MobileMoneyForm } from './MobileMoneyForm';
import { StripeCardForm } from './StripeCardForm';

type Tab = 'mobile_money' | 'card' | 'cash';

interface Props {
  amount: number;
  currency: string;
  reference: string;
  referenceType: 'PARCEL' | 'INVOICE' | 'TOPUP';
  customer: { fullName: string; phone?: string; email?: string };
  /** Methods to expose. Defaults to mobile_money + card. */
  methods?: Tab[];
  onSuccess: (orderId: string) => void;
}

const TAB_META: Record<Tab, { label: string; Icon: typeof CreditCard }> = {
  mobile_money: { label: 'Mobile Money', Icon: Smartphone },
  card: { label: 'Carte', Icon: CreditCard },
  cash: { label: 'Especes', Icon: Banknote },
};

export function CheckoutPanel(props: Props) {
  const methods = props.methods ?? ['mobile_money', 'card'];
  const [tab, setTab] = useState<Tab>(methods[0]);

  return (
    <div className="p-6 space-y-5 skin-card">
      <div>
        <p
          className="text-xs font-semibold uppercase tracking-[0.2em]"
          style={{ color: 'var(--skin-primary)' }}
        >
          Paiement
        </p>
        <div
          className="mt-1 flex items-baseline gap-2 skin-font-heading"
          style={{ color: 'var(--skin-foreground)' }}
        >
          <span className="text-3xl font-bold">
            {props.amount.toLocaleString('fr-FR')}
          </span>
          <span className="text-base" style={{ color: 'var(--skin-muted)' }}>
            {props.currency}
          </span>
        </div>
        <p
          className="mt-1 text-xs"
          style={{ color: 'var(--skin-muted)' }}
        >
          {props.referenceType} #{props.reference}
        </p>
      </div>

      <div
        className="flex items-center gap-1 p-1 skin-radius"
        style={{ background: 'var(--skin-background)' }}
      >
        {methods.map((m) => {
          const { label, Icon } = TAB_META[m];
          const active = tab === m;
          return (
            <button
              key={m}
              type="button"
              onClick={() => setTab(m)}
              className="relative flex-1 inline-flex items-center justify-center gap-1.5 px-3 py-2 text-sm font-semibold transition-colors"
              style={{
                color: active ? '#fff' : 'var(--skin-foreground)',
                background: active ? 'var(--skin-primary)' : 'transparent',
                borderRadius: 'calc(var(--skin-radius) - 0.2rem)',
              }}
            >
              <Icon className="h-4 w-4" />
              {label}
            </button>
          );
        })}
      </div>

      <AnimatePresence mode="wait">
        <motion.div
          key={tab}
          initial={{ opacity: 0, y: 6 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -6 }}
          transition={{ duration: 0.15 }}
        >
          {tab === 'mobile_money' && (
            <MobileMoneyForm
              amount={props.amount}
              currency={props.currency}
              reference={props.reference}
              referenceType={props.referenceType}
              customer={props.customer}
              onSuccess={props.onSuccess}
            />
          )}
          {tab === 'card' && (
            <StripeCardForm
              amount={props.amount}
              currency={props.currency}
              reference={props.reference}
              referenceType={props.referenceType}
              onSuccess={props.onSuccess}
            />
          )}
          {tab === 'cash' && (
            <div
              className="p-4 text-sm skin-radius"
              style={{
                background:
                  'color-mix(in oklab, var(--skin-primary) 8%, transparent)',
                color: 'var(--skin-foreground)',
              }}
            >
              Vous reglerez en especes a la prise en charge du colis. Aucune
              action requise maintenant.
            </div>
          )}
        </motion.div>
      </AnimatePresence>
    </div>
  );
}
