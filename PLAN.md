# OptiPack v2 - Plan de travail

> Derniere mise a jour : 2026-04-16

## Legende
- [x] Fait
- [ ] A faire (polish/ameliorations futures)

---

## 1. Corrections de bugs

- [x] API deployed sur localhost -> fix Dockerfile.prod + docker-compose.prod.yml
- [x] Limite pagination API -> max passe de 100 a 200
- [x] Magasins filtre 1 seule agence -> nouveau endpoint GET /warehouses multi-agence
- [x] Employes filtre 1 seule agence -> nouveau endpoint GET /employees multi-agence
- [x] Conteneur "Charger colis" redirigeait -> dialog de selection avec checkboxes
- [x] Conteneur "Decharger" redirigeait -> confirmation dialog + API unload
- [x] Telephone inputs texte -> AppPhoneInput avec drapeaux SVG + indicatif
- [x] Pays/Ville inputs texte -> selects searchables pays->region->ville
- [x] Schema Prisma champs manquants (Debt, Expense, Container)

---

## 2. Backend - Modules implementes

- [x] **Notifications** : controller, routes, repository, event handlers (auto-creation sur events)
- [x] **Chat/Support** : controller, routes, repository (conversations + messages)
- [x] **Bordereaux (Manifests)** : controller, routes, repository (envoi, reception, comparatif)
- [x] **Routage inter-agences** : controller, routes, repository (redistribution apres depotage)
- [x] **Rapports** : controller avec 6 endpoints (colis, paiements, revenus, dettes, tresorerie, penalites)
- [x] **Configuration systeme** : controller (SystemConfig CRUD + Currency CRUD)
- [x] **Invoice PDF** : service PDFService avec generation facture professionnelle
- [x] **QR Code colis** : service QRCodeService + endpoint PNG + label PDF
- [x] **Manifest PDF** : generation PDF bordereau (envoi/reception)
- [x] **Penalty cron** : calcul automatique quotidien a 2h du matin
- [x] **Debt alerts** : verification echeances quotidienne a 8h + marquage OVERDUE a 1h
- [x] **Portail client** : auth (login/register), parcels, invoices, payments, debts, notifications, agencies

---

## 3. Frontend - Pages connectees

- [x] **Notifications** : page connectee a l'API, badge unread dans TopBar, mark as read
- [x] **Chat** : interface conversations temps reel, messages, creation, fermeture
- [x] **Rapports** : 6 rapports avec filtres date/agence, generation, export Excel
- [x] **Parametres** : tab General (config systeme) + tab Devises (CRUD currencies)
- [x] **Bordereaux** : section dans conteneur detail (envoi, reception, comparatif, impression)
- [x] **Invoice PDF** : bouton telecharger PDF sur page facture
- [x] **QR Code** : affichage QR + bouton imprimer etiquette sur page colis
- [x] **Portail client** : login, dashboard, mes colis, mes factures, nos agences

---

## 4. i18n et Multi-devise

- [x] **next-intl** installe et configure
- [x] **Traductions** : fr.json + en.json (toutes les sections de l'app)
- [x] **Language switcher** dans le TopBar (FR/EN)
- [x] **Multi-devise** : API currencies + UI dans parametres

---

## 5. Ameliorations futures (nice to have)

- [ ] Socket.io temps reel pour le chat (polling actuel a 5s)
- [ ] Envoi SMS/WhatsApp reel (integration Twilio/360dialog)
- [ ] Paiement en ligne dans le portail client (Stripe/Mobile Money)
- [ ] 2FA complet (TOTP verification route)
- [ ] Rate limiting sur routes auth
- [ ] CI/CD pipeline (GitHub Actions)
- [ ] Sauvegarde automatique BDD (pg_dump schedule)
- [ ] App mobile tablet complete (Expo)
- [ ] Utiliser useTranslations() dans toutes les pages (i18n progressif)
- [ ] Export PDF pour les rapports (pas seulement Excel)
- [ ] Scan QR code par camera dans le portail/app mobile

---

## Architecture finale

### Backend (apps/api/src/)
- 25 controllers
- 25 repositories
- 47+ use cases
- 8 route groups
- Event bus avec handlers
- Cron jobs (penalites, dettes)
- Services: PDF, QR Code, Email, Pricing

### Frontend (apps/web/app/)
- 40+ pages
- Portail client (/portal/*)
- Dashboard staff complet
- Composants: AppPhoneInput, AppCountryCitySelect, LanguageSwitcher
- i18n FR/EN

### API endpoints: 100+
