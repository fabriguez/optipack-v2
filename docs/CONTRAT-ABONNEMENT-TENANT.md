# CONTRAT D'ABONNEMENT À LA PLATEFORME TRANSITSOFTSERVICES

**Contrat de fourniture de services logiciels en mode SaaS**

> Modèle à faire relire par un avocat avant première signature. Les champs entre
> crochets `[...]` sont à compléter. Les Annexes 1 à 3 font partie intégrante du
> Contrat.

---

## ENTRE LES SOUSSIGNÉS

**TransitSoftServices**, [forme juridique — ex. SARL], au capital de [montant] FCFA,
immatriculée au RCCM sous le numéro [RCCM], NIU [numéro], dont le siège social est
situé à [adresse complète], représentée par [nom, prénom], en qualité de [gérant /
directeur général], dûment habilité(e) aux fins des présentes,

ci-après « **le Prestataire** »,

**ET**

**[Dénomination sociale du client]**, [forme juridique], au capital de [montant] FCFA,
immatriculée au RCCM sous le numéro [RCCM], NIU [numéro], dont le siège social est
situé à [adresse complète], représentée par [nom, prénom], en qualité de [qualité],

ci-après « **le Client** »,

ci-après désignés ensemble « les Parties ».

---

## ARTICLE 1 — DÉFINITIONS

- **Plateforme** : la solution logicielle TransitSoftServices de gestion de transit
  aérien, maritime et terrestre, accessible en mode SaaS, comprenant les applications
  web, le portail client public, les applications mobiles et, le cas échéant,
  l'application de bureau.
- **Instance** : l'environnement technique dédié au Client (base de données,
  stockage de fichiers et services applicatifs isolés), accessible via le
  sous-domaine `[slug].transitsoftservices.com` ou un nom de domaine propre au Client.
- **Modules** : les fonctionnalités activées sur l'Instance selon le Plan souscrit
  (Annexe 1) : gestion des colis et conteneurs, bordereaux, clients et destinataires,
  facturation et comptabilité, ressources humaines, notifications multicanales,
  programme de fidélité, rapports, support par messagerie.
- **Plan** : la formule d'abonnement souscrite par le Client (Annexe 1), définissant
  les Modules, les ressources techniques allouées et le prix mensuel.
- **Utilisateurs** : les employés et préposés du Client autorisés à accéder à
  l'Instance.
- **Données Client** : l'ensemble des données saisies, importées ou générées sur
  l'Instance par le Client, ses Utilisateurs ou ses propres clients (expéditeurs,
  destinataires), en ce compris les données à caractère personnel.
- **Mise en service** : la date à laquelle l'Instance est provisionnée et accessible.

## ARTICLE 2 — OBJET

Le présent Contrat a pour objet de définir les conditions dans lesquelles le
Prestataire concède au Client, pendant la durée du Contrat, un droit d'accès et
d'utilisation de la Plateforme en mode SaaS, ainsi que les services d'hébergement,
de maintenance, de sauvegarde et de support associés.

Le Contrat n'emporte aucun transfert de propriété intellectuelle au profit du Client.

## ARTICLE 3 — DESCRIPTION DES SERVICES

**3.1 Mise à disposition.** Le Prestataire provisionne une Instance dédiée au Client,
isolée des instances des autres clients (base de données, stockage de fichiers et
conteneurs applicatifs distincts). La Mise en service intervient au plus tard
[2] jours ouvrés après signature et encaissement du premier paiement.

**3.2 Accès.** L'Instance est accessible 24h/24, 7j/7, sous réserve des périodes de
maintenance (article 8) et des cas de force majeure, via :
- l'application de gestion : `app.[slug].transitsoftservices.com` ;
- le portail public de suivi : `[slug].transitsoftservices.com` ;
- les applications mobiles compatibles.

**3.3 Modules.** Les Modules activés sont ceux du Plan souscrit (Annexe 1). Le Client
peut demander l'activation de Modules supplémentaires ; le changement de Plan prend
effet après confirmation du paiement correspondant.

**3.4 Nom de domaine personnalisé.** Sur demande, l'Instance peut être servie sous un
nom de domaine appartenant au Client. La configuration DNS relève du Client ; le
Prestataire fournit les certificats TLS.

**3.5 Marque blanche mobile.** Si le Plan le prévoit, le Prestataire publie une
version de l'application mobile aux couleurs du Client. Les frais de comptes
développeur (Apple/Google) restent à la charge du Client.

**3.6 Évolutions.** Le Prestataire fait évoluer la Plateforme (correctifs, nouvelles
fonctionnalités). Les mises à jour sont déployées selon la politique choisie par le
Client (manuelle, automatique stable, ou correctifs critiques uniquement). Chaque
mise à jour est précédée d'une sauvegarde permettant un retour arrière.

## ARTICLE 4 — DURÉE

Le Contrat prend effet à sa signature pour une durée initiale de [un (1) mois /
douze (12) mois], renouvelable tacitement par périodes successives d'égale durée,
sauf dénonciation par l'une des Parties notifiée par écrit au moins [15] jours avant
l'échéance en cours.

## ARTICLE 5 — CONDITIONS FINANCIÈRES

**5.1 Prix.** Le prix de l'abonnement est celui du Plan souscrit, exprimé en francs
CFA (XAF) hors taxes (Annexe 1). Toute taxe applicable est à la charge du Client.

**5.2 Facturation et paiement.** L'abonnement est payable d'avance, par période.
Moyens de paiement acceptés : Mobile Money (MTN MoMo, Orange Money), carte bancaire,
ou tout autre moyen convenu entre les Parties. Le paiement est réputé effectué à la
confirmation par l'opérateur de paiement.

**5.3 Retard et suspension.** À défaut de paiement à l'échéance, et après notification
restée sans effet pendant [7] jours, le Prestataire peut suspendre l'Instance
(« gel ») : les services sont arrêtés mais les Données Client sont intégralement
conservées. La réactivation intervient sans délai après régularisation. La suspension
ne dispense pas du paiement des sommes dues.

**5.4 Révision.** Le Prestataire peut réviser les tarifs moyennant un préavis écrit de
[60] jours ; la révision s'applique à la période de renouvellement suivante. En cas de
désaccord, le Client peut résilier sans pénalité avant l'entrée en vigueur du nouveau
tarif.

**5.5 Dépassement de ressources.** En cas de dépassement durable des ressources ou
limites du Plan (Annexe 1), les Parties conviennent d'un passage au Plan supérieur ;
à défaut d'accord sous [30] jours, chaque Partie peut résilier à l'échéance.

## ARTICLE 6 — OBLIGATIONS DU PRESTATAIRE

Le Prestataire s'engage à :

1. fournir les services avec diligence et selon les règles de l'art, dans le cadre
   d'une **obligation de moyens** ;
2. assurer l'hébergement, la surveillance et la maintenance de l'Instance ;
3. réaliser des **sauvegardes quotidiennes** de l'Instance, conservées au minimum
   **trente (30) jours**, ainsi qu'une sauvegarde avant chaque mise à jour ;
4. maintenir l'isolation technique des Données Client vis-à-vis des autres clients ;
5. notifier le Client de toute maintenance programmée avec un préavis raisonnable ;
6. fournir le support selon les modalités de l'Annexe 2 ;
7. informer le Client sans délai injustifié de tout incident de sécurité affectant
   ses données.

## ARTICLE 7 — OBLIGATIONS DU CLIENT

Le Client s'engage à :

1. utiliser la Plateforme conformément à sa destination, à la réglementation
   applicable à son activité (transit, douane, transport) et au présent Contrat ;
2. garantir l'exactitude des données saisies et être seul responsable du contenu des
   Données Client, notamment des documents d'identité et informations financières de
   ses propres clients et employés ;
3. disposer d'une base légale pour la collecte des données personnelles qu'il traite
   via la Plateforme et en informer les personnes concernées (article 10) ;
4. gérer les habilitations de ses Utilisateurs, préserver la confidentialité des
   identifiants et notifier sans délai toute compromission ;
5. ne pas tenter de contourner les mesures de sécurité, ni d'accéder aux données
   d'autres clients, ni de revendre l'accès à la Plateforme à des tiers ;
6. payer le prix aux échéances convenues ;
7. collaborer de bonne foi avec le Prestataire pour tout diagnostic ou incident.

## ARTICLE 8 — NIVEAUX DE SERVICE, MAINTENANCE

**8.1 Disponibilité.** Le Prestataire s'engage sur le taux de disponibilité mensuel de
l'Instance défini à l'Annexe 2 selon le Plan souscrit, hors maintenance programmée et
force majeure.

**8.2 Maintenance programmée.** Les opérations de maintenance sont, dans la mesure du
possible, réalisées en dehors des heures ouvrées du Client et notifiées au moins
[48] heures à l'avance.

**8.3 Pénalités.** En cas de non-respect du taux de disponibilité sur un mois donné,
le Client bénéficie, sur demande écrite dans les [30] jours, des avoirs définis à
l'Annexe 2. Ces avoirs constituent la seule réparation due au titre de la
disponibilité.

## ARTICLE 9 — PROPRIÉTÉ DES DONNÉES ET RÉVERSIBILITÉ

**9.1 Propriété.** Les Données Client demeurent la propriété exclusive du Client.
Le Prestataire ne les exploite que pour l'exécution du Contrat, la sécurité et la
maintenance ; il ne les vend ni ne les communique à des tiers hors sous-traitants
de l'article 11.

**9.2 Réversibilité.** À l'expiration ou à la résiliation du Contrat, le Prestataire
restitue au Client, sur demande formulée dans les **trente (30) jours**, une copie
complète des Données Client dans un format structuré et couramment utilisé (export
base de données + fichiers). Cette restitution standard est incluse ; toute prestation
d'assistance à migration complémentaire fait l'objet d'un devis.

**9.3 Destruction.** À l'issue du délai de restitution, et au plus tard [60] jours
après la fin du Contrat, le Prestataire supprime l'Instance et les Données Client,
y compris les sauvegardes à l'expiration de leur cycle de rétention, sauf obligation
légale de conservation.

## ARTICLE 10 — DONNÉES À CARACTÈRE PERSONNEL

**10.1 Rôles.** Pour les données personnelles traitées via l'Instance (clients
expéditeurs et destinataires, employés du Client), le **Client est responsable du
traitement** et le **Prestataire est sous-traitant**. Pour les données de facturation
et de compte du Client lui-même, le Prestataire est responsable du traitement.

**10.2 Engagements du Prestataire (sous-traitant).** Le Prestataire :
- ne traite les données personnelles que sur instruction documentée du Client et pour
  les seules finalités du Contrat ;
- met en œuvre des mesures techniques et organisationnelles appropriées : isolation
  par client, chiffrement des flux (TLS), chiffrement des secrets au repos, contrôle
  d'accès par rôles et permissions, journalisation des actions (audit log) ;
- notifie au Client toute violation de données personnelles dans les meilleurs délais
  après en avoir eu connaissance, avec les informations utiles à ses propres
  obligations de notification ;
- assiste raisonnablement le Client pour répondre aux demandes d'exercice de droits
  des personnes concernées (accès, rectification, suppression) ;
- impose des obligations équivalentes à ses sous-traitants ultérieurs (article 11).

**10.3 Conformité.** Chaque Partie respecte la réglementation qui lui est applicable
en matière de protection des données personnelles, notamment la réglementation
camerounaise en vigueur [et, le cas échéant, le RGPD si des personnes concernées
résident dans l'Union européenne].

**10.4 Données sensibles.** Le Client est informé que la Plateforme permet de stocker
des documents d'identité (CNI). Il lui appartient de limiter cette collecte au
nécessaire et d'en informer les personnes concernées.

## ARTICLE 11 — SOUS-TRAITANCE

Le Client autorise le Prestataire à recourir à des sous-traitants techniques pour
l'exécution du Contrat, notamment : hébergeurs (VPS), fournisseurs d'envoi d'e-mails
et de SMS, opérateurs de paiement (Mobile Money, cartes), service de messagerie
support. La liste des sous-traitants est tenue à disposition du Client et mise à jour
en cas de changement ; le Client peut s'opposer pour motif légitime dans les [15]
jours de la notification d'un changement.

Le Prestataire demeure responsable envers le Client des prestations sous-traitées.

## ARTICLE 12 — PROPRIÉTÉ INTELLECTUELLE

La Plateforme, sa documentation, ses marques et logos demeurent la propriété
exclusive du Prestataire. Le Prestataire concède au Client, pour la durée du Contrat,
un droit personnel, non exclusif, non cessible et non transférable d'utilisation de
la Plateforme, pour ses besoins propres et dans la limite du Plan souscrit.

Les éléments de marque fournis par le Client (logo, couleurs) restent la propriété du
Client ; il en concède l'usage au Prestataire pour les seuls besoins du Contrat
(personnalisation de l'Instance et, le cas échéant, marque blanche).

## ARTICLE 13 — CONFIDENTIALITÉ

Chaque Partie s'engage à garder confidentielles les informations de l'autre Partie
identifiées comme telles ou dont la confidentialité résulte de leur nature (données
commerciales, financières, techniques), pendant la durée du Contrat et [3] ans après
son terme. Ne sont pas visées les informations publiques, déjà connues, ou dont la
divulgation est exigée par la loi ou une autorité compétente.

## ARTICLE 14 — RESPONSABILITÉ

**14.1** Le Prestataire est tenu à une obligation de moyens. Il n'est pas responsable :
des contenus et de l'exactitude des Données Client ; des décisions commerciales,
comptables ou fiscales prises par le Client sur la base des états produits par la
Plateforme ; des défaillances des réseaux de télécommunication, des opérateurs de
paiement ou des canaux tiers (SMS, WhatsApp, e-mail) ; d'une utilisation non conforme.

**14.2** La responsabilité totale cumulée du Prestataire, toutes causes confondues,
est plafonnée au montant des sommes effectivement payées par le Client au titre des
**douze (12) derniers mois** précédant le fait générateur.

**14.3** Aucune Partie n'est responsable des dommages indirects (perte de chiffre
d'affaires, perte de clientèle, préjudice d'image), sous réserve des exclusions
d'ordre public.

**14.4** Rien dans le présent Contrat n'exclut la responsabilité d'une Partie en cas
de dol ou de faute lourde.

## ARTICLE 15 — SÉCURITÉ ET INTÉGRITÉ FINANCIÈRE

Le Prestataire déclare que la Plateforme applique les principes suivants : écritures
de paiement immuables (annulation par contre-passation uniquement), comptabilité en
partie double, journal d'audit des actions utilisateurs, sauvegardes régulières. Ces
mécanismes ne dispensent pas le Client de ses propres obligations comptables légales
(OHADA) ; la Plateforme est un outil de gestion, non un substitut à la comptabilité
légale certifiée du Client.

## ARTICLE 16 — SUSPENSION POUR USAGE ABUSIF

Le Prestataire peut suspendre sans délai, après notification, tout usage qui :
compromet la sécurité ou la stabilité de la Plateforme ; viole la loi (contenus
illicites, fraude) ; excède massivement les ressources allouées au point d'affecter
le service. La suspension est levée dès cessation de la cause. Le Prestataire en
limite la portée et la durée au strict nécessaire.

## ARTICLE 17 — RÉSILIATION

**17.1 Pour manquement.** En cas de manquement grave de l'une des Parties non réparé
dans les **trente (30) jours** suivant mise en demeure écrite, l'autre Partie peut
résilier de plein droit, sans préjudice de dommages-intérêts.

**17.2 Pour défaut de paiement.** À défaut de régularisation dans les [30] jours
suivant la suspension prévue à l'article 5.3, le Prestataire peut résilier de plein
droit.

**17.3 Effets.** À la date d'effet de la résiliation : l'accès à l'Instance est
fermé ; les articles 9 (réversibilité), 13 (confidentialité) et 14 (responsabilité)
survivent ; les sommes dues restent exigibles ; les sommes payées d'avance au titre
de périodes non entamées sont remboursées au prorata en cas de résiliation pour
manquement du Prestataire.

## ARTICLE 18 — FORCE MAJEURE

Aucune Partie ne sera responsable d'un manquement causé par un événement de force
majeure au sens de la jurisprudence applicable (catastrophe naturelle, guerre,
décision d'autorité, défaillance généralisée des réseaux électriques ou de
télécommunication…). Si l'événement persiste plus de [60] jours, chaque Partie peut
résilier sans indemnité.

## ARTICLE 19 — DISPOSITIONS DIVERSES

- **Cession** : le Contrat ne peut être cédé par une Partie sans accord écrit de
  l'autre, sauf cession à une société du même groupe notifiée par écrit.
- **Non-sollicitation** : pendant le Contrat et [12] mois après, chaque Partie
  s'interdit d'embaucher directement un salarié de l'autre affecté à l'exécution du
  Contrat, sauf accord écrit.
- **Intégralité** : le Contrat et ses Annexes expriment l'intégralité de l'accord des
  Parties et prévalent sur tout document antérieur.
- **Notification** : toute notification est valablement faite par écrit (courrier
  recommandé ou e-mail avec accusé) aux adresses en tête des présentes.
- **Nullité partielle** : la nullité d'une clause n'affecte pas les autres.

## ARTICLE 20 — DROIT APPLICABLE ET RÈGLEMENT DES LITIGES

Le présent Contrat est régi par le droit camerounais et, le cas échéant, par les
Actes uniformes OHADA applicables.

Les Parties s'efforceront de résoudre amiablement tout différend dans un délai de
[30] jours à compter de sa notification. À défaut, le litige sera soumis :
[au tribunal compétent de (ville), Cameroun] **ou** [à l'arbitrage selon le règlement
de la Cour Commune de Justice et d'Arbitrage (CCJA) de l'OHADA, par un arbitre unique,
siège à (ville), langue française] *(choisir une option)*.

---

Fait à [ville], le [date], en deux (2) exemplaires originaux.

| Pour le Prestataire | Pour le Client |
|---|---|
| [Nom, qualité, signature, cachet] | [Nom, qualité, signature, cachet] |

---

## ANNEXE 1 — PLANS ET CONDITIONS TARIFAIRES

| Élément | Starter | Pro | Entreprise |
|---|---|---|---|
| Prix mensuel (XAF HT) | [•] | [15 000] | Sur devis |
| Modules inclus | [liste] | [liste] | Tous + sur mesure |
| Utilisateurs max | [•] | [•] | Illimité |
| Colis / mois (indicatif) | [•] | [•] | Illimité |
| Ressources (CPU / RAM / disque) | [•] | [•] | Dédiées |
| Marque blanche mobile | Non | Option | Inclus |
| Domaine personnalisé | Non | Oui | Oui |
| API & webhooks | Non | Oui | Oui |

Le détail des Modules activés à la signature : [liste à cocher].

## ANNEXE 2 — NIVEAUX DE SERVICE ET SUPPORT

**Disponibilité mensuelle cible** (hors maintenance programmée et force majeure) :

| Plan | Disponibilité | Avoir si non atteinte |
|---|---|---|
| Starter | 99,0 % | 10 % de la mensualité |
| Pro | 99,5 % | 25 % de la mensualité |
| Entreprise | 99,9 % | 50 % de la mensualité |

> Note : ne promettez PAS 99,99 % (page marketing actuelle) tant que
> l'infrastructure repose sur un VPS unique sans redondance — 99,99 % = moins de
> 4,4 minutes d'indisponibilité par mois, intenable sans haute disponibilité.

**Support** :

| Canal | Starter | Pro | Entreprise |
|---|---|---|---|
| E-mail (support@transitsoftservices.com) | Oui | Oui | Oui |
| Chat intégré | Oui | Oui | Oui |
| WhatsApp / téléphone | Non | Oui | Oui |
| Délai de première réponse (heures ouvrées) | 48 h | 24 h | 4 h |
| Incident bloquant (production arrêtée) | 24 h | 8 h | 2 h |

Heures ouvrées : [lundi–vendredi, 8h–18h, heure de Douala].

**Sauvegardes** : quotidiennes + avant chaque mise à jour ; rétention 30 jours ;
restauration sur demande ([incluse 1×/mois / facturée au-delà]).

## ANNEXE 3 — SOUS-TRAITANTS TECHNIQUES À LA DATE DE SIGNATURE

| Catégorie | Sous-traitant | Localisation |
|---|---|---|
| Hébergement VPS | [Hetzner / OVH / …] | [UE / …] |
| E-mails transactionnels | [Resend / SendGrid / SES] | [•] |
| SMS / WhatsApp | [Twilio / Africa's Talking / Meta] | [•] |
| Paiements | [Campay, Flutterwave, NotchPay, Stripe, TaraMoney] | [•] |
| Messagerie support | [Stream (getstream.io)] | [•] |
