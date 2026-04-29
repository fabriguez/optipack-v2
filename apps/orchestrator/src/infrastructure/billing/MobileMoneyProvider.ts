import { injectable } from 'tsyringe';
import { logger } from '../logger';

/**
 * Provider Mobile Money (MTN MoMo + Orange Money).
 *
 * Chaque operateur a sa propre API. Pour eviter d'embarquer chaque SDK, on expose
 * une API unifiee `initiate(provider, phone, amount, ref) -> { reference, status, ussd? }`.
 *
 * Strategie operationnelle pour zone CEMAC :
 *  - MTN MoMo : Collections API (Sandbox + Production), polling toutes les 30s
 *  - Orange Money : Web Payment API ou USSD push
 *
 * Pour cette V1 on implemente le squelette + un mode "mock" qui simule un paiement
 * reussi (utile en dev). L'integration reelle viendra avec les credentials operateur.
 */

export type MoMoOperator = 'mtn' | 'orange';

interface InitiateInput {
  operator: MoMoOperator;
  phone: string; // ex: "+237691234567"
  amount: number; // en XAF (entier)
  externalRef: string; // notre identifiant de transaction (PlanChange.id, ...)
  description?: string;
}

interface InitiateResult {
  externalRef: string;
  providerRef: string;
  status: 'pending' | 'succeeded' | 'failed';
  ussdCode?: string; // certains operateurs renvoient un code a composer
  message?: string;
}

@injectable()
export class MobileMoneyProvider {
  isConfigured(): boolean {
    // Les credentials viennent par operateur. On considere "configure" si au moins un operateur l'est.
    return !!(process.env.MTN_MOMO_API_KEY || process.env.ORANGE_MONEY_API_KEY);
  }

  async initiate(input: InitiateInput): Promise<InitiateResult> {
    // Mode mock pour dev sans credentials
    if (process.env.MOMO_MODE === 'mock') {
      logger.warn({ ref: input.externalRef }, '[momo] MOCK : auto-success');
      return {
        externalRef: input.externalRef,
        providerRef: `mock-${Date.now()}`,
        status: 'succeeded',
        message: 'Mock payment success',
      };
    }

    if (input.operator === 'mtn') {
      return this.initiateMtn(input);
    }
    return this.initiateOrange(input);
  }

  /**
   * Verifie le statut d'une transaction (utile pour polling, le webhook MoMo n'etant
   * pas toujours fiable / configurable).
   */
  async verify(operator: MoMoOperator, providerRef: string): Promise<{ status: 'pending' | 'succeeded' | 'failed' }> {
    if (process.env.MOMO_MODE === 'mock') {
      return { status: 'succeeded' };
    }
    if (operator === 'mtn') return this.verifyMtn(providerRef);
    return this.verifyOrange(providerRef);
  }

  // ---- MTN MoMo (Collections API) ----
  private async initiateMtn(input: InitiateInput): Promise<InitiateResult> {
    // Reference doc : https://momodeveloper.mtn.com/
    // Endpoint : POST /collection/v1_0/requesttopay
    // TODO : implementer avec les credentials sandbox + prod via env vars MTN_*
    logger.warn('[momo] MTN integration TODO');
    return {
      externalRef: input.externalRef,
      providerRef: 'mtn-todo',
      status: 'pending',
      message: 'MTN integration en cours',
    };
  }

  private async verifyMtn(_ref: string): Promise<{ status: 'pending' | 'succeeded' | 'failed' }> {
    return { status: 'pending' };
  }

  // ---- Orange Money ----
  private async initiateOrange(input: InitiateInput): Promise<InitiateResult> {
    // Reference doc operateur Orange Money Cameroun.
    // TODO : implementer avec ORANGE_MONEY_*
    logger.warn('[momo] Orange integration TODO');
    return {
      externalRef: input.externalRef,
      providerRef: 'orange-todo',
      status: 'pending',
      message: 'Orange integration en cours',
    };
  }

  private async verifyOrange(_ref: string): Promise<{ status: 'pending' | 'succeeded' | 'failed' }> {
    return { status: 'pending' };
  }
}
