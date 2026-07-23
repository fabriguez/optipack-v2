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
}

/** true si l'UI doit autoriser une action sur ce colis. */
export function parcelCanAct(parcel: WithAgencyScope | null | undefined): boolean {
  return parcel?.inAgencyScope !== false;
}
