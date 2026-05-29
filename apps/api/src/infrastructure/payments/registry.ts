import type { IPaymentProvider } from './types';
import { createChildLogger } from '../../config/logger';

const logger = createChildLogger('PaymentRegistry');

const registry = new Map<string, IPaymentProvider>();

export function registerPaymentProvider(p: IPaymentProvider): void {
  registry.set(p.name.toUpperCase(), p);
  logger.info({ provider: p.name, channel: p.channel }, 'Payment provider registered');
}

export function getPaymentProvider(name: string): IPaymentProvider | null {
  return registry.get(name.toUpperCase()) ?? null;
}

export function listPaymentProviders(): IPaymentProvider[] {
  return Array.from(registry.values());
}
