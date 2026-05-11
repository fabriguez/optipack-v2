/**
 * Cross-package payment types.
 * - Used by the API to build PaymentOrder records.
 * - Used by web-client for typed RPC + UI state.
 * - Used by the orchestrator to wire tenant-level provider credentials.
 */

import { z } from 'zod';

/** Identifier of a provider (aggregator). Extensible - new providers can be registered. */
export type PaymentProviderId =
  | 'mtn-momo'
  | 'orange-money'
  | 'wave'
  | 'airtel-money'
  | 'moov-money'
  | 'stripe'
  | (string & {});

/** High-level family of the method. */
export type PaymentMethodKind = 'mobile_money' | 'card' | 'bank_transfer' | 'cash';

/** Currencies we natively handle. */
export type Currency = 'XAF' | 'XOF' | 'NGN' | 'GHS' | 'USD' | 'EUR' | (string & {});

/**
 * State machine for a payment order, from creation to terminal status.
 *
 *   PENDING       -> CHARGE_REQUESTED -> AWAITING_USER_OTP -> SUCCEEDED
 *                                                          \
 *                                                           -> FAILED (-> FAILOVER -> ...)
 *                 -> EXPIRED
 *                 -> CANCELLED
 *                 -> REFUNDED  (terminal)
 */
export type PaymentStatus =
  | 'PENDING'
  | 'CHARGE_REQUESTED'
  | 'AWAITING_USER_OTP'
  | 'SUCCEEDED'
  | 'FAILED'
  | 'FAILOVER'
  | 'EXPIRED'
  | 'CANCELLED'
  | 'REFUNDED';

export interface MoneyAmount {
  /** Amount in MAJOR units (e.g. 1500 = 1500 XAF, not 1 500 000 minor units). */
  amount: number;
  currency: Currency;
}

/** Input to start a checkout. */
export const checkoutInputSchema = z.object({
  amount: z.number().positive(),
  currency: z.string().min(3).max(4),
  /** Payment kind chosen by the user. */
  kind: z.enum(['mobile_money', 'card', 'bank_transfer', 'cash']),
  /** Phone number for mobile-money payments (E.164, no spaces). Required if kind=mobile_money. */
  phone: z.string().optional(),
  /** Preferred provider id; if absent, the router chooses based on phone/country. */
  preferredProvider: z.string().optional(),
  /** Reference object (e.g. parcel id or invoice id) for reconciliation. */
  reference: z.string(),
  referenceType: z.enum(['PARCEL', 'INVOICE', 'TOPUP']),
  /** Customer info, for receipts and provider KYC fields. */
  customer: z.object({
    fullName: z.string(),
    phone: z.string().optional(),
    email: z.string().email().optional(),
  }),
  /** Idempotency key (UUID). Sent by the client to prevent duplicate charges on retry. */
  idempotencyKey: z.string().min(8),
});

export type CheckoutInput = z.infer<typeof checkoutInputSchema>;

/** Charge attempt outcome returned by a single provider. */
export interface ChargeAttempt {
  providerId: PaymentProviderId;
  status: PaymentStatus;
  /** Provider-side id of the transaction (used for webhooks + polling). */
  externalRef?: string;
  /** Optional human-readable message. */
  message?: string;
  /** Optional next-step (e.g. push OTP, redirect URL for 3DS). */
  next?:
    | {
        type: 'otp';
        /** Hint the UI shows ("Composez *126# pour confirmer", etc.). */
        instruction: string;
      }
    | {
        type: 'redirect';
        url: string;
      }
    | {
        type: 'qr';
        /** Base64 PNG. */
        qrPng: string;
      };
  /** Server timestamp. */
  attemptedAt: string;
}

/** Final order after all (sequential) attempts. */
export interface PaymentOrder {
  id: string;
  status: PaymentStatus;
  /** Provider id that ultimately succeeded (if SUCCEEDED), else last tried. */
  finalProvider?: PaymentProviderId;
  amount: MoneyAmount;
  reference: string;
  referenceType: 'PARCEL' | 'INVOICE' | 'TOPUP';
  /** Chronological attempts (first to last). */
  attempts: ChargeAttempt[];
  createdAt: string;
  updatedAt: string;
}

/** Provider capabilities advertised by each implementation. */
export interface ProviderCapabilities {
  id: PaymentProviderId;
  name: string;
  kind: PaymentMethodKind;
  currencies: Currency[];
  /** Country prefixes (E.164) supported (e.g. ['237'] for Cameroun). */
  phonePrefixes?: string[];
  /** Higher = preferred. Routing falls back to the next provider on failure. */
  priority: number;
  /** Whether the provider can issue an OTP push (USSD) - vs requiring a redirect. */
  supportsOtpPush: boolean;
}
