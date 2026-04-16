# OptiPack v2 - Plan de travail restant

> Derniere mise a jour : 2026-04-16

## Legende
- [x] Fait
- [ ] A faire
- [~] Partiel (schema/UI existe mais pas complet)

---

## 1. Corrections de bugs et ameliorations urgentes

- [x] **API deployed sur localhost** : `NEXT_PUBLIC_API_URL` non injecte au build Docker (fix Dockerfile.prod + docker-compose.prod.yml)
- [x] **Limite pagination API** : `limit` max passe de 100 a 200 dans `paginationSchema`
- [x] **Magasins** : liste filtree par 1 seule agence -> nouveau endpoint `GET /warehouses` multi-agence
- [x] **Employes** : meme probleme -> nouveau endpoint `GET /employees` multi-agence
- [x] **Conteneur / Charger colis** : redirigeait vers listing conteneurs -> dialog de selection de colis IN_STOCK avec checkbox
- [x] **Conteneur / Decharger** : action "decharger" redirigeait vers le colis -> confirmation dialog + appel `POST /containers/:id/unload`
- [x] **Telephone** : inputs texte basiques -> `AppPhoneInput` avec drapeaux SVG, indicatif, placeholder dynamique (`react-phone-number-input`)
- [x] **Pays/Ville** : inputs texte libres -> selects searchables avec dependance dynamique pays->region->ville (`react-country-state-city`)
- [x] **Schema Prisma** : champs manquants ajoutes (Debt: creditor, paymentMethod, paymentProofUrl, installmentCount / Expense: orderer, parcelId, associationType / Container: loadingDate)

---

## 2. Modules backend a completer

### 2.1 Notifications (routes + envoi reel)
- [ ] Creer `NotificationController` et routes CRUD
- [ ] `GET /notifications` (filtrer par userId, clientId, agencyId, status)
- [ ] `POST /notifications/:id/read` (marquer comme lu)
- [ ] Integrer un service d'envoi reel (Email: Resend/Nodemailer, SMS: Twilio, WhatsApp: Twilio/360dialog)
- [ ] Declenchement automatique sur evenements (colis enregistre, expedie, arrive, paiement recu, penalite)
- [ ] Worker/queue pour envoi asynchrone (infrastructure queue existe deja)

### 2.2 Chat / Support client
- [ ] Creer `ChatController` et routes
- [ ] `GET /chat/conversations` (list conversations)
- [ ] `POST /chat/conversations` (creer conversation)
- [ ] `GET /chat/conversations/:id/messages` (historique)
- [ ] `POST /chat/conversations/:id/messages` (envoyer message)
- [ ] `POST /chat/conversations/:id/close` (fermer)
- [ ] Integration Socket.io pour temps reel (client socket.io deja installe)

### 2.3 Bordereaux (ShippingManifest)
- [ ] Creer `ManifestController` et routes
- [ ] `POST /manifests/dispatch/:containerId` (bordereau d'envoi auto)
- [ ] `POST /manifests/reception/:containerId` (bordereau de reception auto)
- [ ] `GET /manifests/comparison/:containerId` (rapport comparatif envoi vs reception)
- [ ] `GET /manifests/:id/pdf` (generation PDF)

### 2.4 Routage inter-agences
- [ ] Creer `RoutingController` et routes
- [ ] `POST /routing/redistribute/:containerId` (redistribution apres depotage)
- [ ] Logique de mise en stock automatique dans le magasin de destination

### 2.5 Rapports et exports
- [ ] `GET /reports/parcels` (rapport colis par periode, agence, statut)
- [ ] `GET /reports/payments` (rapport paiements)
- [ ] `GET /reports/revenue` (rapport revenus par agence/periode)
- [ ] `GET /reports/debts` (rapport dettes clients)
- [ ] `GET /reports/cash-flow` (rapport tresorerie)
- [ ] `GET /reports/penalties` (rapport penalites)
- [ ] Generation PDF serveur (pdfkit ou puppeteer)
- [ ] Generation Excel serveur (exceljs)

### 2.6 Configuration systeme
- [ ] Creer `ConfigController` et routes
- [ ] `GET /config` / `PUT /config` (parametres systeme)
- [ ] Gestion des devises (`GET /currencies`, `POST /currencies`, `PATCH /currencies/:id`)
- [ ] Parametres penalites (jours de grace, taux journalier)
- [ ] Parametres fidélite (seuils, pourcentages de remise)

### 2.7 Ameliorations existantes
- [ ] Facture : `GET /invoices/:id/pdf` (generation PDF)
- [ ] Colis : generation QR code reel (qrcode lib + stockage MinIO)
- [ ] Colis : impression etiquette (PDF avec QR + infos)
- [ ] Penalites : cron job / scheduled task pour calcul automatique quotidien
- [ ] Dettes : alertes automatiques sur echeancier (cron + notifications)
- [ ] 2FA : route `POST /auth/2fa/verify` pour completer le flux

---

## 3. Modules frontend a completer

### 3.1 Notifications
- [ ] Connecter la page `/notifications` a l'API
- [ ] Icone notification avec badge dans le TopBar
- [ ] Notification en temps reel via Socket.io

### 3.2 Chat / Support
- [ ] Connecter la page `/chat` a l'API
- [ ] Interface conversation en temps reel
- [ ] Indicateur de messages non lus

### 3.3 Rapports
- [ ] Connecter les boutons de telechargement de `/reports` au backend
- [ ] Filtres par date, agence, type

### 3.4 Parametres
- [ ] Connecter la page `/settings` a l'API config
- [ ] Sauvegarde des preferences (devises, penalites, notifications)

### 3.5 Bordereaux
- [ ] Page de listing des bordereaux
- [ ] Boutons "Bordereau d'envoi" / "Bordereau de reception" dans la page conteneur
- [ ] Visualisation et impression PDF

### 3.6 Facture PDF
- [ ] Bouton "Telecharger PDF" sur la page facture (connecter au backend)
- [ ] Impression directe

### 3.7 QR Code colis
- [ ] Affichage QR code sur la page detail colis
- [ ] Bouton "Imprimer etiquette" (QR + infos colis)
- [ ] Scanner QR code (camera ou upload image)

---

## 4. Interface client (portail)

Module complet a creer - l'authentification client est prevue (champs `passwordHash`, `isPortalActive` sur Client).

- [ ] Page login client separee
- [ ] Dashboard client : suivi colis, factures, dettes
- [ ] Suivi de colis par numero de tracking
- [ ] Historique des factures et paiements
- [ ] Paiement en ligne (integration mobile money / stripe)
- [ ] Notifications client
- [ ] Page "Nos agences" avec adresses + lien Google Maps
- [ ] Page "Nos services"

---

## 5. Fonctionnalites techniques

### 5.1 Multi-langue (i18n)
- [ ] Installer next-intl ou next-i18next
- [ ] Extraire toutes les chaines en fichiers de traduction
- [ ] Supporter au minimum : Francais, Anglais
- [ ] Selecteur de langue dans les settings/TopBar

### 5.2 Multi-devise
- [ ] Routes API gestion devises
- [ ] Conversion automatique selon la devise selectionnee
- [ ] Affichage devise dans toutes les pages financieres

### 5.3 Securite
- [ ] Completer le flux 2FA (TOTP)
- [ ] Rate limiting sur les routes d'authentification
- [ ] CSRF protection
- [ ] Validation des permissions agence dans les controllers warehouse/employee (verifier que l'user a acces)

### 5.4 Infrastructure
- [ ] Sauvegarde automatique BDD (pg_dump schedule)
- [ ] Monitoring / health check dashboard
- [ ] Logs structures (winston/pino)
- [ ] CI/CD pipeline (GitHub Actions)

---

## 6. App mobile (Tablet - Expo)

L'app tablet existe dans `apps/tablet/` mais n'a que la page settings.

- [ ] Ecran login
- [ ] Dashboard simplifie
- [ ] Scan QR code colis (camera native)
- [ ] Enregistrement rapide de colis
- [ ] Chargement/dechargement conteneur
- [ ] Notifications push

---

## Priorites recommandees

| Priorite | Module | Raison |
|----------|--------|--------|
| P0 | Migration Prisma + deploy | Debloquer les corrections de schema |
| P1 | QR Code + etiquettes | Critique pour operations terrain |
| P1 | Bordereaux (envoi/reception) | Obligatoire pour le transit |
| P1 | Facture PDF | Indispensable pour la facturation |
| P2 | Notifications (API + envoi) | Communication client |
| P2 | Rapports (backend generation) | Suivi d'activite |
| P2 | Parametres (persistance) | Configuration systeme |
| P3 | Interface client (portail) | Service client |
| P3 | Chat / Support | Support client |
| P3 | Multi-langue | Internationalisation |
| P3 | Multi-devise | Si operations multi-pays |
| P4 | App mobile | Complement terrain |
