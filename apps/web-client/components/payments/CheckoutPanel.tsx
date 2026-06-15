'use client';

import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { CreditCard, Smartphone, Banknote } from 'lucide-react';
import { MobileMoneyForm } from './MobileMoneyForm';
import { StripeCardForm } from './StripeCardForm';

type Tab = 'mobile_money' | 'card' | 'cash';

interface Props {
  /** Solde restant (montant max). */
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
  const [rawAmount, setRawAmount] = useState(String(props.amount));
  const parsedAmount = Math.round(Number(rawAmount) || 0);
  const payAmount = Math.min(Math.max(parsedAmount, 1), props.amount);
  const amountError =
    parsedAmount > props.amount
      ? `Maximum : ${props.amount.toLocaleString('fr-FR')} ${props.currency}`
      : parsedAmount <= 0
        ? 'Montant invalide'
        : null;

  return (
    <div className="p-6 space-y-5 skin-card">
      <div>
        <p
          className="text-xs font-semibold uppercase tracking-[0.2em]"
          style={{ color: 'var(--skin-primary)' }}
        >
          Paiement
        </p>
        <p
          className="mt-1 text-xs"
          style={{ color: 'var(--skin-muted)' }}
        >
          {props.referenceType} #{props.reference}
        </p>
      </div>

      {/* Saisie du montant (acompte possible) */}
      <div>
        <label
          className="block text-xs font-semibold mb-1"
          style={{ color: 'var(--skin-foreground)' }}
        >
          Montant a payer
        </label>
        <div className="flex items-center gap-2">
          <input
            type="number"
            min={1}
            max={props.amount}
            value={rawAmount}
            onChange={(e) => setRawAmount(e.target.value)}
            className="flex-1 px-3 py-2 text-lg font-semibold skin-radius border outline-none"
            style={{
              background: 'var(--skin-background)',
              color: 'var(--skin-foreground)',
              borderColor: amountError ? '#dc2626' : 'var(--skin-border)',
            }}
          />
          <span className="text-sm font-medium" style={{ color: 'var(--skin-muted)' }}>
            {props.currency}
          </span>
        </div>
        {amountError ? (
          <p className="mt-1 text-xs" style={{ color: '#dc2626' }}>{amountError}</p>
        ) : parsedAmount < props.amount ? (
          <p className="mt-1 text-xs" style={{ color: 'var(--skin-muted)' }}>
            Acompte — solde restant apres : {(props.amount - parsedAmount).toLocaleString('fr-FR')} {props.currency}
          </p>
        ) : (
          <p className="mt-1 text-xs" style={{ color: 'var(--skin-muted)' }}>
            Solde total : {props.amount.toLocaleString('fr-FR')} {props.currency}
          </p>
        )}
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
              payAmount={payAmount}
              currency={props.currency}
              reference={props.reference}
              referenceType={props.referenceType}
              customer={props.customer}
              onSuccess={props.onSuccess}
            />
          )}
          {tab === 'card' && (
            <StripeCardForm
              amount={payAmount}
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
