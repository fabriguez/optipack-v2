/**
 * Provider interface + built-in capabilities registry. Concrete implementations
 * live in the API (they hit real HTTP APIs and read tenant secrets). This
 * package only declares the contract + the static capabilities catalogue used
 * by the router/UI.
 */

import type {
  ChargeAttempt,
  CheckoutInput,
  PaymentProviderId,
  ProviderCapabilities,
} from '../types';

/**
 * Concrete provider contract (server-side).
 *  - `charge` initiates a payment attempt
 *  - `verify` polls or processes a webhook to get the final status
 *  - `refund` reverses a successful payment
 */
export interface PaymentProvider {
  capabilities: ProviderCapabilities;
  charge(input: CheckoutInput, ctx: ProviderContext): Promise<ChargeAttempt>;
  verify(externalRef: string, ctx: ProviderContext): Promise<ChargeAttempt>;
  refund?(externalRef: string, ctx: ProviderContext): Promise<ChargeAttempt>;
}

export interface ProviderContext {
  tenantSlug: string;
  /** Resolved at runtime by the API : per-tenant secrets stored in Organization.paymentCredentials. */
  credentials: Record<string, string | undefined>;
  /** Where the provider should POST async updates. */
  webhookUrl: string;
}

export const BUILTIN_CAPABILITIES: ProviderCapabilities[] = [
  {
    id: 'mtn-momo',
    name: 'MTN Mobile Money',
    kind: 'mobile_money',
    currencies: ['XAF', 'XOF', 'GHS', 'NGN'],
    phonePrefixes: ['237', '233', '234', '256'],
    priority: 90,
    supportsOtpPush: true,
  },
  {
    id: 'orange-money',
    name: 'Orange Money',
    kind: 'mobile_money',
    currencies: ['XAF', 'XOF'],
    phonePrefixes: ['237', '225', '221', '223'],
    priority: 85,
    supportsOtpPush: true,
  },
  {
    id: 'wave',
    name: 'Wave',
    kind: 'mobile_money',
    currencies: ['XOF'],
    phonePrefixes: ['221', '225'],
    priority: 70,
    supportsOtpPush: false, // redirect-based
  },
  {
    id: 'airtel-money',
    name: 'Airtel Money',
    kind: 'mobile_money',
    currencies: ['XAF', 'NGN', 'UGX'],
    phonePrefixes: ['237', '234', '256'],
    priority: 65,
    supportsOtpPush: true,
  },
  {
    id: 'moov-money',
    name: 'Moov Money',
    kind: 'mobile_money',
    currencies: ['XAF', 'XOF'],
    phonePrefixes: ['225', '227'],
    priority: 50,
    supportsOtpPush: true,
  },
  {
    id: 'stripe',
    name: 'Stripe (Cartes Visa/Mastercard)',
    kind: 'card',
    currencies: ['USD', 'EUR', 'XAF', 'XOF'],
    priority: 100, // cards are fast and reliable, top-priority when chosen by user
    supportsOtpPush: false,
  },
];

/** Lookup by id. */
export function capabilitiesOf(
  id: PaymentProviderId,
): ProviderCapabilities | undefined {
  return BUILTIN_CAPABILITIES.find((p) => p.id === id);
}
