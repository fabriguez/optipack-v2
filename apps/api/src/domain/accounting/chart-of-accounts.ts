/**
 * Plan comptable minimal ("chart of accounts") requis pour la comptabilité
 * en partie double. Chaque tenant DOIT disposer de ces comptes, sinon toute
 * écriture au journal (paiement, décaissement, transfert de fonds...) échoue
 * avec un connect Prisma sur un `AccountingAccount` inexistant.
 *
 * Source de vérité unique : réutilisé par le seed (`prisma/seed.ts`) et par le
 * self-heal runtime (`AccountingAccountService`).
 */
export type AccountKind = 'ASSET' | 'LIABILITY' | 'EQUITY' | 'REVENUE' | 'EXPENSE';

export interface ChartAccount {
  code: string;
  name: string;
  type: AccountKind;
}

export const DEFAULT_CHART_OF_ACCOUNTS: ReadonlyArray<ChartAccount> = [
  { code: '101000', name: 'Caisse', type: 'ASSET' },
  { code: '102000', name: 'Banque', type: 'ASSET' },
  { code: '301000', name: 'Creances Clients', type: 'ASSET' },
  { code: '401000', name: 'Dettes Fournisseurs', type: 'LIABILITY' },
  { code: '501000', name: 'Capital', type: 'EQUITY' },
  { code: '601000', name: 'Revenus Transport', type: 'REVENUE' },
  { code: '602000', name: 'Revenus Penalites', type: 'REVENUE' },
  { code: '701000', name: 'Charges Exploitation', type: 'EXPENSE' },
  { code: '702000', name: 'Salaires', type: 'EXPENSE' },
];

/** Codes indispensables au posting d'un paiement (caisse + créances clients). */
export const CORE_ACCOUNT_CODES = ['101000', '301000'] as const;
