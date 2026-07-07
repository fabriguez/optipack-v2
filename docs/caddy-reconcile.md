# Reconciliation Caddy — Caddyfile sur disque + merge

## Le probleme resolu

Avant : l'orchestrateur poussait la config Caddy via l'admin API `/load`
(**full replace** en RAM). Deux consequences :

1. Toute route ajoutee a la main dans `/etc/caddy/Caddyfile` (whatsapp, s3,
   storage, domaines perso...) etait **ecrasee** au prochain reconcile → `ERR_SSL_PROTOCOL`
   (plus de route → plus de cert servi pour ce host).
2. La config `/load`ee ne vivait qu'en RAM → **perdue au restart** de Caddy
   (le systemd natif du host relit `/etc/caddy/Caddyfile`, qui n'etait jamais
   mis a jour).

## La solution

Le **Caddyfile sur disque est la source de verite** (survit au restart). Chaque
reconcile ne regenere QUE la region delimitee par des marqueurs :

```
# >>> OPTIPACK-MANAGED:BEGIN ... >>>
app.transitsoftservices.com {
	encode gzip
	reverse_proxy 127.0.0.1:3008
	header { X-Content-Type-Options nosniff; X-Frame-Options SAMEORIGIN; Referrer-Policy strict-origin-when-cross-origin }
}
transitsoftservices.com, www.transitsoftservices.com { encode gzip; reverse_proxy 127.0.0.1:3010; header {...SAMEORIGIN...} }
api.transitsoftservices.com { encode gzip; reverse_proxy 127.0.0.1:3009; header {...DENY...} }
ops.transitsoftservices.com { encode gzip; reverse_proxy 127.0.0.1:4020; header {...DENY...} }
ops-admin.transitsoftservices.com { encode gzip; reverse_proxy 127.0.0.1:3020; header {...SAMEORIGIN...} }
# <<< OPTIPACK-MANAGED:END <<<
```

Les blocs générés incluent `encode gzip` + headers sécurité (nosniff /
X-Frame-Options / Referrer-Policy), alignés sur le durcissement manuel du self :
X-Frame-Options `DENY` pour api/ops, `SAMEORIGIN` pour staff/public/ops-admin.

Tout ce qui est **hors marqueurs** (bloc global `admin`, whatsapp, s3, storage,
domaines perso) est **preserve verbatim**. En plus, le merge retire les blocs
top-level dont l'adresse est desormais geree (evite les doublons quand un host
gere etait ecrit a la main avant migration).

Garde-fous a chaque ecriture : **validation via `POST /adapt`** (rejette une
config invalide avant tout ecrit) + **backup date** (`backups/Caddyfile.<ts>`,
10 derniers gardes) → rollback automatique si le reload echoue.

### Deux topologies

| | Self (host principal) | VPS distant |
|---|---|---|
| Caddy | natif systemd, `/etc/caddy/Caddyfile` | conteneur, `~/.optipack/caddy/Caddyfile` |
| Acces orchestrateur | **bind-mount** `/etc/caddy` (root conteneur = root host, **pas de sudo**) | **SSH** |
| Reload | admin API `/load` (host.docker.internal:2019) | `docker exec caddy caddy reload` |

Le routage self→local / distant→SSH se fait dans `CaddyService.applyForVps`
(`vps.name === OPS_SELF_VPS_NAME`).

## Ajouter une route interne geree (recommande)

Pour qu'une route type whatsapp soit **regeneree** (pas juste preservee), l'ajouter
a `CADDY_STATIC_ROUTES` (env orchestrateur, format `host=upstream`, virgule).
⚠️ Si set, cet env **remplace** le defaut → re-inclure `ops` + `ops-admin` :

```
CADDY_STATIC_ROUTES=ops.transitsoftservices.com=127.0.0.1:4020,ops-admin.transitsoftservices.com=127.0.0.1:3020,whatsapp-api.transitsoftservices.com=127.0.0.1:3210,whatsapp-dashboard.transitsoftservices.com=127.0.0.1:3211
```

Sinon, laisser ces blocs a la main dans le Caddyfile : ils sont preserves tels
quels (avec leur `encode`, `header`, cache...).

## Rollout

### Host self (immediat, sans downtime)

1. Redeploy orchestrateur (le compose ajoute le mount `/etc/caddy:/etc/caddy`) :
   ```
   docker compose -f docker-compose.control-plane.yml up -d orchestrator
   ```
2. Reconcilier :
   ```
   ./scripts/reconcile-caddy.sh
   ```
   1er passage : retire les blocs app/api/apex/ops/ops-admin ecrits a la main,
   ajoute la region geree, **preserve whatsapp/s3/storage/brightkyefoo/admin**.
   Reload gracieux via admin API (aucune coupure).

Prerequis : le tenant principal doit avoir en BDD `webPort=3008`, `apiPort=3009`,
`webClientPort=3010` (l'apex → web-client 3010, comme le bloc manuel actuel).

### VPS distants (fenetre de maintenance)

Les conteneurs caddy existants tournent en mode JSON (`bootstrap.json --resume`).
Le nouveau bootstrap les migre en mode fichier (`docker rm -f caddy` + recreate
avec `-v ~/.optipack/caddy:/etc/caddy`). **Il y a une courte coupure** tant que
le reconcile n'a pas repeuple la region geree → enchainer bootstrap **puis**
reconcile du VPS dans la meme operation. Les nouveaux VPS demarrent directement
en mode fichier.
