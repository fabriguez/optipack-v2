// Scope agence des COLIS, côté UI (confort seulement — l'API fait foi via
// parcelScope.assert). Un colis se lit partout (toutes agences) mais on ne peut
// AGIR (remise, maj statut, suppression, images, édition) que si son agence
// intersecte celle du user. Le backend expose `inAgencyScope` sur le DTO colis.
//
// `inAgencyScope` absent (admin = accès total, ou réponse legacy) => on autorise
// l'action : le backend tranchera (404 si hors scope). On ne masque QUE quand le
// backend a explicitement posé `inAgencyScope === false`.

export interface WithAgencyScope {
  inAgencyScope?: boolean;
  /** Remise possible : colis physiquement en magasin d'une de mes agences (pas en transit). */
  canHandover?: boolean;
}

/**
 * true si l'UI doit autoriser une ACTION sur ce colis. Le flag `inAgencyScope`
 * est calcule cote API selon la regle produit : on ne peut agir que sur un colis
 * PHYSIQUEMENT present dans un magasin d'une de ses agences (cf.
 * agencyScope.parcelInScope). La lecture reste ouverte a tous.
 */
export function parcelCanAct(parcel: WithAgencyScope | null | undefined): boolean {
  return parcel?.inAgencyScope !== false;
}

/**
 * true si l'UI doit afficher l'action REMISE. Plus strict que parcelCanAct : le
 * colis doit etre PHYSIQUEMENT receptionne dans un magasin d'une de mes agences
 * (jamais en transit). Flag `canHandover` calcule cote API. Absent => on laisse
 * le backend trancher (bouton affiche, la remise 409 si en transit).
 */
export function parcelCanHandover(parcel: WithAgencyScope | null | undefined): boolean {
  return parcel?.canHandover !== false;
}
