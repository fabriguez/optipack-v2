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

/**
 * REMISE (handover) : une remise se fait la OU le colis est PHYSIQUEMENT present
 * (agence de son entrepot courant). Contrairement a `inAgencyScope` (scope
 * transit large : destination + conteneurs), il faut que l'agence de l'ENTREPOT
 * COURANT soit une des agences du user. Sinon on remet un colis present ailleurs.
 * Admin -> toujours autorise. Colis pas en entrepot (agence inconnue) -> on laisse
 * le backend trancher (garde dure cote API). Miroir de HandoverParcelUseCase.
 */
export function parcelHandoverAllowed(
  parcel: { warehouse?: { agency?: { id?: string | null } | null; agencyId?: string | null } | null } | null | undefined,
  myAgencyIds: string[],
  isAdmin: boolean,
): boolean {
  if (isAdmin) return true;
  const currentAgencyId = parcel?.warehouse?.agency?.id ?? parcel?.warehouse?.agencyId ?? null;
  if (!currentAgencyId) return true;
  return myAgencyIds.includes(currentAgencyId);
}
