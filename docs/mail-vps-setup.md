# Mailcow VPS setup — Phase 2 messagerie (reception)

Procedure d'installation et de configuration d'un VPS Mailcow dedie pour
la **reception** des emails multi-tenant. Complementaire de la Phase 1
(envoi via Resend, deja en place dans l'orchestrator).

> Important: VPS **dedie**, jamais sur le meme host que l'orchestrator ou
> les tenants. Mailcow ouvre les ports 25/465/587/993/143/110/995/80/443
> et a un fingerprint de stack tres specifique.

## 0. Prerequis

### VPS

| Item | Valeur recommandee |
|---|---|
| OS | Debian 12 ou Ubuntu 22.04 |
| RAM | 4 Go minimum (8 Go au-dela de 100 tenants) |
| Disque | 80 Go minimum, SSD |
| CPU | 2 vCPU minimum |
| Hostname | `mail.transitsoftservices.com` |
| Port 25 sortant | **doit etre autorise par l'hebergeur** (souvent bloque par defaut chez OVH, Hetzner, Scaleway) -> ouvrir un ticket pour debloquage avant d'installer |
| Reverse DNS (PTR) | `mail.transitsoftservices.com` (voir section dediee) |

### DNS — A pousser AVANT install

A configurer chez ton registrar / Cloudflare / Route53. Indispensable pour
que Let's Encrypt puisse emettre le certificat HTTPS au boot de Mailcow.

```
A     mail.transitsoftservices.com      → IP_VPS_MAILCOW
AAAA  mail.transitsoftservices.com      → IPv6_VPS_MAILCOW   (si dispo)
MX    transitsoftservices.com           → mail.transitsoftservices.com    (priority 10)
TXT   transitsoftservices.com           → "v=spf1 mx ~all"
```

Le record DKIM sera ajoute apres install (Mailcow genere la cle au moment
ou tu actives DKIM pour le domaine).

### Reverse DNS (PTR) — pourquoi c'est obligatoire

Le DNS classique fait **nom → IP**. Le reverse DNS fait l'inverse :
**IP → nom** via les records `PTR` dans la zone `.in-addr.arpa`. C'est gere
par **l'hebergeur** (proprietaire du bloc d'IP), pas par toi via Cloudflare.

Quand ton serveur envoie un email a Gmail :
1. Mailcow se connecte depuis `185.42.18.27`
2. Il dit `HELO mail.transitsoftservices.com`
3. Gmail fait un reverse DNS sur `185.42.18.27`
   - Si ca repond `mail.transitsoftservices.com` -> coherent, OK
   - Si ca repond `static-185-42-18-27.ovh.net` -> incoherent, **spam**
   - Si ca ne repond rien -> **rejet 550**

Sans PTR matching, Gmail/Outlook/Yahoo classent direct en spam ou rejettent.

#### Comment configurer le PTR selon l'hebergeur

| Hebergeur | Procedure |
|---|---|
| OVH | Panel `Bare Metal Cloud → IPs → Modifier le reverse`. Effectif en 5-30 min |
| Hetzner | `Cloud Console → Server → Networking → Reverse DNS`. Immediat |
| Scaleway | `Console → Instances → ton serveur → Network → Reverse DNS` |
| DigitalOcean | Automatique via hostname : `hostnamectl set-hostname mail.transitsoftservices.com` |
| Vultr / Linode | Automatique via hostname (idem DO) |
| OVH/Hetzner bare metal | Parfois ticket support si l'edition n'est pas dans le panel |

#### Verification du PTR

```bash
dig -x 185.42.18.27 +short
# Doit repondre : mail.transitsoftservices.com.
```

Ou en ligne : https://mxtoolbox.com/SuperTool.aspx?action=ptr

#### Symptome typique d'un PTR manquant

Email en spam Gmail avec dans les headers :
```
Authentication-Results: ...
  spf=pass smtp.mailfrom=transitsoftservices.com;
  dkim=pass header.d=transitsoftservices.com;
  dmarc=pass;
  iprev=fail smtp.remote-ip=185.42.18.27        ← PTR pas configure
```
`iprev=fail` = reverse DNS manquant ou incoherent.

## 1. Preparation du VPS

```bash
# SSH en root vers le VPS mailcow
ssh root@mail.transitsoftservices.com

# Hostname
hostnamectl set-hostname mail.transitsoftservices.com

# Update + outils
apt update && apt upgrade -y
apt install -y curl git ca-certificates ufw fail2ban

# Docker + Docker Compose plugin
curl -fsSL https://get.docker.com | sh
systemctl enable --now docker

# Verifie : docker compose version → v2.x
docker compose version

# Firewall : on n'ouvre QUE ce que Mailcow utilise
ufw default deny incoming
ufw default allow outgoing
ufw allow 22/tcp                  # SSH
ufw allow 80,443/tcp              # webmail + ACME
ufw allow 25,465,587/tcp          # SMTP (in/out)
ufw allow 143,993/tcp             # IMAP
ufw allow 110,995/tcp             # POP3 (rare mais Mailcow l'expose)
ufw allow 4190/tcp                # Sieve (filtres)
ufw --force enable

# Verifie que rien ne squatte 25
ss -tlnp | grep ':25'             # doit etre vide
# Si exim/postfix resident :
# systemctl stop exim4 && systemctl disable exim4
```

## 2. Install Mailcow

```bash
cd /opt
git clone https://github.com/mailcow/mailcow-dockerized.git
cd mailcow-dockerized

# Generation de la config (interactif). Repondre :
#   - Hostname (FQDN) : mail.transitsoftservices.com
#   - Timezone : Europe/Paris  (ou ce que tu veux)
#   - Branch : master
./generate_config.sh

# Lance la stack (5-10 min, telecharge ~10 images)
docker compose pull
docker compose up -d

# Verifie que tout est sain
docker compose ps
```

Acces au bout de quelques minutes :
- Webmail SOGo : `https://mail.transitsoftservices.com/SOGo/`
- Admin UI : `https://mail.transitsoftservices.com`
- Login admin par defaut : `admin` / `moohoo` → **changer immediatement**

## 3. DKIM + DMARC

Dans l'UI Mailcow : **System → Configuration → ARC/DKIM keys** → "Add ARC/DKIM key"
- selector : `dkim`
- domain : `transitsoftservices.com`
- key size : 2048

Mailcow t'affiche le record TXT a coller dans le DNS :
```
TXT   dkim._domainkey.transitsoftservices.com   → v=DKIM1; k=rsa; p=MIIBI...
```

Ajoute aussi DMARC :
```
TXT   _dmarc.transitsoftservices.com   → "v=DMARC1; p=quarantine; rua=mailto:postmaster@transitsoftservices.com"
```

## 4. Activation de l'API REST

Pour que l'orchestrator pilote la creation des mailboxes des tenants.

**Mailcow UI → System → Configuration → Access → API**
- Activer **Read** + **Write**
- Restreindre l'IP source a l'IP du VPS orchestrator (sinon `0.0.0.0/0` en dev seulement)
- Regenerer la cle API et **noter** la cle `READ` + la cle `READ/WRITE`

## 5. Test rapide depuis le terminal

```bash
# Ajout d'un domaine test (quota 3 Go, 10 mailboxes, defaut 250 Mo par boite)
curl -X POST https://mail.transitsoftservices.com/api/v1/add/domain \
  -H "Content-Type: application/json" \
  -H "X-API-Key: <READ_WRITE_KEY>" \
  -d '{
    "domain": "test.transitsoftservices.com",
    "quota": "3072",
    "mailboxes": "10",
    "defquota": "250",
    "maxquota": "1024",
    "active": "1",
    "rl_value": "10",
    "rl_frame": "s"
  }'

# Ajout d'une mailbox dans ce domaine
curl -X POST https://mail.transitsoftservices.com/api/v1/add/mailbox \
  -H "Content-Type: application/json" \
  -H "X-API-Key: <READ_WRITE_KEY>" \
  -d '{
    "local_part": "contact",
    "domain": "test.transitsoftservices.com",
    "name": "Test Contact",
    "quota": "250",
    "password": "Sup3rPass!23",
    "password2": "Sup3rPass!23",
    "active": "1"
  }'
```

Reponse attendue : `{"type":"success", ...}`.

Test webmail : `https://mail.transitsoftservices.com/SOGo/` avec
`contact@test.transitsoftservices.com` / `Sup3rPass!23`.

## 6. Variables a transmettre a l'orchestrator

Une fois etapes 1-5 validees, ajouter dans le `.env` de l'orchestrator :

```env
MAILCOW_URL=https://mail.transitsoftservices.com
MAILCOW_API_KEY=<READ_WRITE_KEY>
MAILCOW_DEFAULT_QUOTA_MB=250    # quota par defaut par mailbox
```

L'integration cote orchestrator (a coder ensuite) :
- `MailcowClient` (equivalent de `ResendClient`)
- `ProvisionTenantMailboxUseCase` qui cree le domaine + la mailbox + applique
  le quota du plan
- Section UI "Reception" en haut de la page Messagerie avec :
  - Credentials webmail generes
  - Lien direct vers SOGo
  - Jauge de quota utilise / dispo
- Champ `mailboxQuotaMb` et `maxMailboxes` au modele `ResourcePlan` + UI pour
  upgrade payant

## 7. Maintenance

### Backup
Mailcow fournit `helper-scripts/backup_and_restore.sh`. A cron quotidien :
```bash
0 3 * * * cd /opt/mailcow-dockerized && BACKUP_LOCATION=/backup ./helper-scripts/backup_and_restore.sh backup all --delete-days 14
```

### Update
```bash
cd /opt/mailcow-dockerized
./update.sh        # backup automatique + pull + redeploy
```

### Logs
```bash
docker compose logs -f postfix-mailcow      # SMTP
docker compose logs -f dovecot-mailcow      # IMAP
docker compose logs -f rspamd-mailcow       # anti-spam
```

### Capacite

| Tenants | Mailbox / tenant | Quota total | RAM | Disque |
|---|---|---|---|---|
| 50 | 1 × 250 Mo | 12 Go | 4 Go | 30 Go |
| 200 | 1 × 250 Mo | 50 Go | 8 Go | 100 Go |
| 500 | 3 × 1 Go | 1.5 To | 16 Go | 2 To |

Au-dela : sharder par groupe de tenants sur plusieurs VPS Mailcow, ou
passer sur Mailu (plus leger) ou un service manage type Migadu.

## 8. Validation finale (de bout en bout)

Apres install + DKIM + PTR, test :
```bash
echo "Test" | mail -s "Test" toi@gmail.com -aFrom:test@transitsoftservices.com
```
Email doit arriver en **inbox Gmail** (pas spam). Sinon, regarder les headers
`Authentication-Results` pour identifier le piler qui echoue (spf/dkim/dmarc/iprev).
