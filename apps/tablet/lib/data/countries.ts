/**
 * Liste de pays (nom FR) pour les selecteurs "pays" des formulaires.
 * Le backoffice web utilise des datasets JSON complets (pays/etats/villes)
 * servis depuis /public ; trop volumineux a embarquer dans l'app RN, donc on
 * fournit ici une liste de pays searchable. Les villes restent en saisie libre.
 */
export interface CountryOption {
  value: string;
  label: string;
}

const NAMES = [
  'Cameroun', 'France', 'Chine', 'Belgique', 'Allemagne', 'Italie', 'Espagne', 'Royaume-Uni', 'Etats-Unis',
  'Canada', 'Turquie', 'Emirats arabes unis', 'Arabie saoudite', 'Qatar', 'Maroc', 'Algerie', 'Tunisie',
  'Egypte', 'Senegal', "Cote d'Ivoire", 'Nigeria', 'Ghana', 'Togo', 'Benin', 'Gabon', 'Congo',
  'RD Congo', 'Tchad', 'Niger', 'Mali', 'Burkina Faso', 'Guinee', 'Guinee equatoriale',
  'Centrafrique', 'Kenya', 'Ethiopie', 'Tanzanie', 'Ouganda', 'Rwanda', 'Afrique du Sud',
  'Angola', 'Mozambique', 'Zambie', 'Zimbabwe', 'Mauritanie', 'Mauritanie', 'Liban', 'Inde',
  'Pakistan', 'Bangladesh', 'Thailande', 'Vietnam', 'Indonesie', 'Malaisie', 'Singapour',
  'Japon', 'Coree du Sud', 'Hong Kong', 'Bresil', 'Argentine', 'Mexique', 'Portugal',
  'Pays-Bas', 'Suisse', 'Suede', 'Norvege', 'Danemark', 'Pologne', 'Grece', 'Russie',
  'Australie', 'Nouvelle-Zelande', 'Sao Tome-et-Principe',
];

export const COUNTRIES: CountryOption[] = Array.from(new Set(NAMES))
  .sort((a, b) => a.localeCompare(b))
  .map((n) => ({ value: n, label: n }));
