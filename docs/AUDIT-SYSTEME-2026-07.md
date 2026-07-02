# Audit système OptiPack v2 / TransitSoftServices — Juillet 2026

## 1. Vue d'ensemble

Monorepo pnpm + turbo. Architecture propre (clean architecture) respectée côté API :
présentation (controllers/routes/middleware) → application (use-cases/services) →
domaine (entités/constantes) → infrastructure (Prisma, paiements, notifications, cron).

| App | Rôle |
|---|---|
| `api` | Backend Express multi-tenant, Socket.io, webhooks |
| `web` | Dashboard staff (Next.js) |
| `web-client` | Portail client public + marketing + checkout |
| `mobile` / `tablet` | Apps staff RN+Expo (white-label possible) |
| `web-desktop` | Wrapper Tauri du dashboard |
| `orchestrator` | Control plane : provisioning tenants, billing SaaS, releases, backups |
| `ops-admin` | Console super-admin ops |

Isolation tenant : chaque tenant client = stack Docker Compose dédiée (Postgres, Redis,
MinIO, api, web, web-client), ports 30000-39999, Caddy + Let's Encrypt, sous-domaine
`{slug}.transitsoftservices.com`. À l'intérieur d'une stack, `organizationId` scope
toutes les tables. Double isolation = bon design.

Points forts structurels :
- Finance immuable : `Payment`, `DisbursementVoucher`, `JournalEntry` sans update,
  annulation par écriture inverse uniquement. Comptabilité en partie double.
- Snapshots de prix (`Parcel.pricingBreakdown`, `ManifestLine`) : traçabilité.
- Self-heal du plan comptable (`AccountingAccountService.ensureCoreAccounts()`).
- Chaîne de providers paiement avec fallback (Campay, Flutterwave, NotchPay, Stripe,
  TaraMoney…) + `PaymentAttempt` par tentative.
- Provisioning avec backup pré-update + rollback.

Points faibles structurels :
- **Tests quasi inexistants** : 2 fichiers de tests sur toute l'API (ABAC uniquement).
  Zéro test sur pricing, comptabilité, rapports. C'est le risque n°1 du projet.
- Fichiers >700 lignes (règle interne violée) : `PDFService.ts` (~1580),
  `NotificationHandler.ts` (~1354), `ClientPortalController.ts` (~985),
  `DailyReportService.ts` (~919), `TenantWhatsAppSessionService.ts` (~918),
  `invoice.routes.ts` (~834), `EmployeeController.ts` (~794).
- Logique auth/checkout dupliquée entre web, web-client, mobile, tablet, web-desktop.
- Pas de clés d'idempotence visibles sur les handlers d'événements/webhooks (risque
  double traitement sur retry).

## 2. Calculs sur les bordereaux (manifests) — verdict

### 2.1 Ce qui est bien

- Prix colis (`PricingService.calculate`) : formule claire et saine.
  `prixPoids = round(poids × tarif/kg)` ; `prixVolume = round(volume × tarif/m³)` ;
  si les deux dimensions existent → `max(prixPoids, prixVolume)` (standard du métier) ;
  puis valeur ajoutée route (montant fixe ou %). Tarif partenaire prioritaire sur tarif
  route. Arrondi à l'entier FCFA à chaque étape : correct pour du XAF.
- Totaux de bordereau non stockés, recalculés depuis `ManifestLine` : pas de dérive.
- `Container.currentLoad` dénormalisé mais auto-corrigé à la lecture
  (`refreshCurrentLoad()`) : dérive maîtrisée.
- Rapport journalier figé en JSON à la clôture : bon pour l'audit.

### 2.2 Problèmes trouvés (par gravité)

**P0 — Avance/solde figés à la création du bordereau.**
`loadParcelsWithFinancials()` calcule avance/solde depuis la facture au moment de la
création, puis snapshot dans `ManifestLine.advanceAmount/balanceAmount`
(`PrismaManifestRepository.ts:94-115, 235-264`). Si le client paie après génération du
bordereau, le PDF montre toujours l'ancien solde. Le bordereau n'est donc PAS fiable
comme document de recouvrement à l'arrivée — c'est pourtant son usage principal.
→ Fix : recalculer avance/solde à la volée au rendu PDF (garder le snapshot pour
l'historique, mais afficher l'état courant, ou afficher les deux).

**P0 — Colis « extra » enregistrés à prix 0.**
`RegisterExtraManifestParcelUseCase` crée le colis avec `price: 0`. Bordereau de
comparaison montre solde 0 pour un colis qui aurait dû être facturé. Perte de revenu
silencieuse. → Fix : calculer le prix via `PricingService` avec poids/volume saisis,
ou forcer une saisie de prix, jamais 0 par défaut.

**P1 — Prorata avance cassé pour prix 0.**
Répartition du `paidAmount` d'une facture multi-colis au prorata du prix
(`ratio = prix / totalPrix`). Colis à prix 0 → ratio 0 → avance 0 même si la facture
est partiellement payée. Combiné au bug extra-parcels, les deux se renforcent.

**P1 — Changement de destination possible en statut ARRIVED.**
`UpdateParcelUseCase` bloque seulement RECEIVED. Un colis ARRIVED peut changer de
`destinationAgencyId` → bordereau DISPATCH devient incohérent avec la réalité.
→ Fix : bloquer aussi ARRIVED (et tout statut post-départ).

**P2 — Poids/volume NULL comptés comme 0 dans les agrégats** (rapport journalier,
totaux). Acceptable mais masque « inconnu » derrière « zéro ». Afficher distinctement.

**P2 — `refreshCurrentLoad` mono-dimension.** SEA ne somme que le volume, AIR/LAND que
le poids ; un colis mal saisi (dimension manquante) disparaît du taux de remplissage.

### 2.2bis Sémantique transit intermédiaire (corrigé le 02/07/2026)

Sémantique métier confirmée : ARRIVED = conteneur arrivé (y compris hub intermédiaire,
colis pas encore déchargé) ; RECEIVED = réceptionné à l'agence de DESTINATION
uniquement. `UnloadParcelUseCase` implémente correctement la règle
(`reachedFinalDestination` → RECEIVED, sinon IN_STOCK au magasin de transit, phase
magasinage TRANSIT gratuite). Deux bugs corrigés :

- `UnloadParcelUseCase.ts` : l'historique écrivait `statusAfter: 'RECEIVED'` en dur
  même pour un déchargement intermédiaire → le pivot recette/avance du rapport
  journalier (première occurrence `statusAfter='RECEIVED'`) prenait la date du hub
  → paiements sur le tronçon hub→destination classés recette au lieu d'avance.
  Corrigé : `statusAfter: finalStatus`.
- `RegisterExtraManifestParcelUseCase.ts` : colis extra créé `RECEIVED` en dur même
  si sa destination fournie ≠ agence d'arrivée du conteneur. Corrigé : même règle
  `reachedFinalDestination` (statut + historique).

Reste ouvert : statut `IN_STOCK` surchargé (stock départ vs stock hub de transit) —
l'UI doit dériver le libellé « en attente de ré-acheminement » via
`warehouse.agencyId ≠ destinationAgencyId` ; envisager à terme un statut dédié.

### 2.3 Verdict global bordereaux

La mécanique de calcul des prix est **correcte et bien pensée** (max poids/volume,
snapshots, tarifs partenaires). Le défaut n'est pas dans les formules mais dans la
**fraîcheur des données financières** : le bordereau fige avance/solde à un instant T
et personne ne le rafraîchit. Tant que ce n'est pas corrigé, ne présentez pas le
bordereau comme document financier fiable aux agences d'arrivée.

## 2bis. Rapports journaliers (`DailyReportService`, vérifié ligne par ligne)

### Ce qui est bien

- Fenêtre = session caisse (`register.createdAt` → `closedAt`), pas jour calendaire :
  règle « post-clôture = jour suivant » bien implémentée côté caisse
  (`findOrCreateForToday` bascule sur le prochain jour ouvrable).
- Résolution du jour dans le fuseau de l'agence + snap au prochain jour ouvré.
- Split recette/avance basé sur le TIMING (paiement après passage RECEIVED via
  `ParcelHistory`) : stable à la regénération, bonne conception.
- Fallback split égalitaire si tous les prix sont 0 (`DailyReportService.ts:333-339`) —
  mieux que le prorata des bordereaux.
- Dédup dépense/décaissement dans le profit (pas de double comptage).
- Regen préserve `status`/`observation` (update partiel payload uniquement).
- Handler de regen débouncé 2 s, best-effort.

### Problèmes trouvés

**P0 — Rapport CLOSED pas immuable, écrasé automatiquement.**
Trois sources se contredisent : le schéma dit « immutable apres cloture »
(`schema.prisma:210`), le service dit « regen interdite si CLOSED, verrouillage côté
controller » (`DailyReportService.ts:881`), le controller dit « Regeneration toujours
permise (y compris CLOSED) » (`AgencyController.ts:236`). Résultat : `generate()`
upsert sans vérifier le statut (`DailyReportService.ts:884-896`) et
`DailyReportRegenHandler` l'appelle sur TOUT événement métier ; si toutes les caisses
sont clôturées, `resolveActiveRegisterDate` retourne la dernière caisse (clôturée)
→ le rapport CLOSED du jour est réécrit.

**P0 — Sections snapshot non fenêtrées.**
`flowIn` (« flux des entrées ») et `stockState` lisent l'état ACTUEL des colis
(aucun filtre temporel, `DailyReportService.ts:359-372, 597-610`). Toute regen après
le jour J remplace le stock du jour J par le stock d'aujourd'hui. Combiné au P0
précédent : les rapports historiques se corrompent silencieusement. Au passage,
`flowIn` et `stockState` sont la MÊME requête — le « flux des entrées » affiché est
en réalité le stock courant, pas les entrées du jour.

**P1 — Void rétroactif falsifie l'historique.**
Paiement jour X voidé jour Y : la caisse est correcte (sortie jour Y via
`VoidPaymentUseCase` → `addExit` sur la caisse courante), mais une regen du rapport X
exclut le paiement (`isVoided: false`) → rapport X ≠ caisse X (`totalEntries`
l'inclut toujours).

**P1 — Paiements en ligne comptés en recette mais absents de la caisse.**
Le settlement en ligne crée le Payment avec `agencyId` (`OnlinePaymentSettlementService.ts:164`)
→ inclus dans `paymentsTotal`/recettes du rapport ; mais la caisse n'est pas créditée
(voulu) et le journal n'existe pas (cf. §3). `paymentsTotal ≠ cashRegister.totalEntries`
dès qu'il y a un paiement en ligne, et rien dans le payload ne sépare cash physique
vs en ligne.

**P1 — Zone morte entre deux sessions caisse.**
`windowStart = register.createdAt`, or la caisse du lendemain n'est créée qu'à la
première ACTION DE CAISSE. Les événements colis (scans, mises en stock) entre la
clôture de la veille et cette création tombent hors des deux fenêtres → absents des
flux/stockIn des deux rapports.

**P2 — Timezone incohérente.** `findOrCreateForToday` utilise minuit LOCAL SERVEUR
(`setHours(0,0,0,0)`, `PrismaCashRegisterRepository.ts:27-28`) ; rapport et auto-close
utilisent minuit FUSEAU AGENCE (`startOfDayInTimezone`). Autour de minuit, date de
caisse ≠ date de rapport possible.

**P2 — Transferts PENDING comptés** dans les totaux entrants/sortants (non confirmés).

**P2 — Profit basé sur `expense.createdAt`, pas la date de paiement.** Dépense créée
hier, payée aujourd'hui : hors fenêtre aujourd'hui, décaissement lié dédupliqué →
la sortie de cash n'impacte le profit d'aucun jour.

**P2 — Divers** : `totalRemainingAmount: 0` codé en dur ; parts prorata stockées en
flottants non arrondis dans le payload (à formater au rendu).

### Correctifs appliqués le 02/07/2026

1. **Verrou immutabilité** (`DailyReportService.generate`) : rapport CLOSED → regen
   refusée, payload existant retourné tel quel. Regen forcée réservée à l'endpoint
   manuel (`{ force: true }` dans `AgencyController.generateDailyReport`) et tracée :
   le rapport passe en AMENDED. Handler de regen et clôtures (manuelle/auto) ne
   forcent pas → les rapports historiques ne sont plus écrasés.
2. **Fenêtres contiguës** : `windowStart` = `closedAt` de la caisse précédente quand
   elle existe (sinon `createdAt` de la caisse du jour, sinon minuit). Plus de zone
   morte entre clôture de la veille et première action de caisse.
3. **Ventilation par canal** : payload `paymentsByChannel { counter, online }`
   (`receivedByUserId` NULL = en ligne). Seul `counter` se rapproche de
   `cashRegister.totalEntries`.
4. **Régularisations void** : payload `voidedPayments[]` + `voidedPaymentsTotal` —
   paiements annulés pendant la fenêtre (la sortie caisse a lieu au void). Le rapport
   du jour d'encaissement reste intact (verrou #1).
5. **Timezone unifiée** : `startOfDayInTimezone` extrait dans
   `domain/utils/timezone.ts`, utilisé par `DailyReportService`, `AutoClose` ET
   `PrismaCashRegisterRepository.findOrCreateForToday` (avant : minuit local serveur
   → date de caisse décalée d'un jour selon le fuseau serveur). Jours de semaine lus
   en UTC (convention UTC-midnight du jour agence).

### Reste ouvert (décision produit requise)

- Profit : dépense comptée à `createdAt`, pas au jour du paiement (décaissement lié).
- Transferts PENDING inclus dans les totaux entrants/sortants.
- `totalRemainingAmount: 0` codé en dur.
- `flowIn` ≡ `stockState` (même requête) : renommer ou dériver l'un de l'autre.

## 3. Flux finance/comptabilité — trous dans le journal

Tableau de couverture du journal comptable :

| Flux | Écriture journal | Caisse | Immuable |
|---|---|---|---|
| Paiement guichet (agent) | Oui (101000/301000) | Oui | Oui |
| Paiement en ligne (MoMo/carte portail) | **Non** | Non (voulu) | Oui |
| Décaissement | Oui (701000/101000) | Oui | Oui |
| Paiement de charge (`PayExpenseFromCashRegisterUseCase`) | **Non** | Oui | — |
| Transfert de fonds agence | Oui | Oui | Oui |
| Transfert de fonds siège (HQ) | **Non** | Oui | Oui |

Conséquence : le grand livre ne reflète pas tout l'argent qui bouge. Un audit externe
(commissaire aux comptes, contrôle fiscal) trouvera des paiements en facture absents du
journal. Autres risques : split de paiement sur facture groupée non transactionnel
(échec partiel = état incohérent), accumulation d'arrondis (`Math.round` par colis,
~1-2 FCFA × milliers de colis), fallback de référence par suffixe aléatoire pas
totalement race-safe.

## 4. La suite — plan d'action priorisé

### Semaine 1-2 (intégrité financière, P0)
1. Écriture journal pour paiements en ligne : débit 102000 (Banque/provider),
   crédit 301000 (Créances). Compte dédié par provider si besoin de réconciliation.
2. Écriture journal pour `PayExpenseFromCashRegisterUseCase` (701000/101000) et
   transferts HQ.
3. Wrapper `prisma.$transaction` autour du split de paiement facture groupée.
4. Avance/solde bordereau recalculés au rendu PDF.
5. Prix des colis extra : jamais 0 — PricingService ou saisie obligatoire.

### Semaine 3-4 (fiabilisation, P1)
6. Rapport de réconciliation nocturne (cron) : `SUM(Invoice.paidAmount)` vs
   `SUM(JournalEntry débits caisse+banque)` par agence/jour ; alerte si écart.
7. Bloquer changement destination post-départ (ARRIVED inclus).
8. Tests unitaires sur : PricingService, split prorata, GroupInvoiceService.sync,
   RecordPayment/Void (journal équilibré), StorageChargeService. C'est le minimum
   vital avant toute évolution du moteur financier.

### Mois 2 (dette technique, P2)
9. Découper les 7 fichiers >700 lignes (commencer par PDFService et
   NotificationHandler).
10. Clés d'idempotence sur webhooks paiement et handlers d'événements.
11. Finir les chantiers ouverts : ABAC phases 2-3 (scoping+masking), settlement MoMo
    (sync DB), conversion points fidélité.

## 5. Sources

Audit réalisé par 4 passes d'exploration (calculs bordereaux, architecture, finance,
business). Fichiers pivots : `PricingService.ts`, `PrismaManifestRepository.ts`,
`DailyReportService.ts`, `RecordPaymentUseCase.ts`, `OnlinePaymentSettlementService.ts`,
`GroupInvoiceService.ts`, `RegisterExtraManifestParcelUseCase.ts`, `schema.prisma`
(api + orchestrator).
