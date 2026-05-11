/**
 * PaymentRouter: orders providers for a given checkout and runs them with
 * sequential fallback. Designed to be reused on the server (API) and on the
 * client (web-client) for *previewing* the chosen chain to the user.
 *
 * The actual HTTP call to the provider lives in concrete `PaymentProvider`
 * implementations, which are wired in apps/api. This file is pure logic, so it
 * can be unit-tested and reused across runtimes.
 */

import {
  BUILTIN_CAPABILITIES,
  capabilitiesOf,
  type PaymentProvider,
} from './providers';
import type {
  ChargeAttempt,
  CheckoutInput,
  PaymentMethodKind,
  PaymentProviderId,
  ProviderCapabilities,
} from './types';

export interface RouterPolicy {
  /** Provider ids explicitly disabled for this tenant (admin choice). */
  disabledProviders?: PaymentProviderId[];
  /** Map of providerId -> priority override (positive = boost, negative = penalty). */
  priorityOverrides?: Partial<Record<PaymentProviderId, number>>;
  /** Max attempts in a fallback chain. */
  maxAttempts?: number;
}

/**
 * Build an ordered fallback chain of providers, given the checkout input and
 * the tenant routing policy. Returns the capabilities (no HTTP call here).
 */
export function buildChain(
  input: CheckoutInput,
  policy: RouterPolicy = {},
): ProviderCapabilities[] {
  const maxAttempts = policy.maxAttempts ?? 3;
  const disabled = new Set(policy.disabledProviders ?? []);

  const eligible = BUILTIN_CAPABILITIES.filter((p) => {
    if (disabled.has(p.id)) return false;
    if (p.kind !== input.kind) return false;
    if (!p.currencies.includes(input.currency as never)) return false;
    if (input.kind === 'mobile_money' && input.phone && p.phonePrefixes) {
      const stripped = input.phone.replace(/[^0-9]/g, '');
      // E.164 without leading +. We match by longest prefix first.
      const ok = p.phonePrefixes.some((pref) => stripped.startsWith(pref));
      if (!ok) return false;
    }
    return true;
  });

  // Priority sort: explicit preferredProvider first, then priority desc.
  const overrides = policy.priorityOverrides ?? {};
  eligible.sort((a, b) => {
    if (input.preferredProvider) {
      if (a.id === input.preferredProvider) return -1;
      if (b.id === input.preferredProvider) return 1;
    }
    const aPrio = a.priority + (overrides[a.id] ?? 0);
    const bPrio = b.priority + (overrides[b.id] ?? 0);
    return bPrio - aPrio;
  });

  return eligible.slice(0, maxAttempts);
}

/**
 * Iterate over the chain, returning at the first non-failing attempt. Failing
 * = status === 'FAILED' (or 'EXPIRED'). Anything else (SUCCEEDED, AWAITING_USER_OTP,
 * CHARGE_REQUESTED) is the caller's responsibility to follow up.
 *
 * Used server-side: takes concrete `PaymentProvider` instances (resolved from
 * capabilities at the call site).
 */
export async function chargeWithFallback(
  input: CheckoutInput,
  chain: ProviderCapabilities[],
  resolveProvider: (id: PaymentProviderId) => PaymentProvider | undefined,
  ctxFactory: (id: PaymentProviderId) => Parameters<PaymentProvider['charge']>[1],
): Promise<{ attempts: ChargeAttempt[]; final: ChargeAttempt }> {
  const attempts: ChargeAttempt[] = [];

  for (const cap of chain) {
    const provider = resolveProvider(cap.id);
    if (!provider) {
      attempts.push({
        providerId: cap.id,
        status: 'FAILED',
        message: `provider not registered: ${cap.id}`,
        attemptedAt: new Date().toISOString(),
      });
      continue;
    }
    try {
      const attempt = await provider.charge(input, ctxFactory(cap.id));
      attempts.push(attempt);
      // Stop if we're not in a terminal-fail state.
      if (attempt.status !== 'FAILED' && attempt.status !== 'EXPIRED') {
        return { attempts, final: attempt };
      }
    } catch (err) {
      attempts.push({
        providerId: cap.id,
        status: 'FAILED',
        message: err instanceof Error ? err.message : String(err),
        attemptedAt: new Date().toISOString(),
      });
    }
  }

  // All failed.
  const last = attempts[attempts.length - 1] ?? {
    providerId: chain[0]?.id ?? 'unknown',
    status: 'FAILED' as const,
    message: 'no providers eligible',
    attemptedAt: new Date().toISOString(),
  };
  return { attempts, final: last };
}

export { capabilitiesOf };
