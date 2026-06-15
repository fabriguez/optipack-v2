import { registerPaymentProvider } from '../registry';
import { CampayProvider } from './CampayProvider';
import { StripeProvider } from './StripeProvider';
import { NotchPayProvider } from './NotchPayProvider';
import { FlutterwaveProvider } from './FlutterwaveProvider';
import { MesombProvider } from './MesombProvider';
import { TaraMoneyProvider } from './TaraMoneyProvider';

/**
 * Catalogue providers :
 *  - TaraMoney      (MoMo 14+ pays Afrique : CM, SN, CI, BF, GH, KE, RW, UG, TZ, ...)
 *  - Campay         (MoMo MTN/Orange, focus CM)
 *  - NotchPay       (MoMo + cartes, Cameroun + Afrique Ouest)
 *  - MeSomb         (MoMo MTN/Orange, Cameroun)
 *  - Flutterwave    (multi-Africa : MoMo CM + cartes Visa/Mastercard)
 *  - Stripe         (cartes internationales)
 * Le tenant choisit l'ordre et les pays via paymentProvidersConfig.
 */
export function registerAllPaymentProviders(): void {
  registerPaymentProvider(new TaraMoneyProvider());
  registerPaymentProvider(new CampayProvider());
  registerPaymentProvider(new NotchPayProvider());
  registerPaymentProvider(new MesombProvider());
  registerPaymentProvider(new FlutterwaveProvider());
  registerPaymentProvider(new StripeProvider());
}
