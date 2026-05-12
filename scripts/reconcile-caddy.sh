#!/bin/sh
# Reconcilie la config Caddy via l'orchestrator (POST /ops/caddy/reconcile).
#
# Usage :
#   ./scripts/reconcile-caddy.sh [VPS_ID]
#
# Variables d'env :
#   OPS_URL       URL de l'orchestrator (defaut: http://127.0.0.1:4020)
#   OPS_EMAIL     email du super-admin (defaut: admin@transitsoftservices.com)
#   OPS_PASSWORD  mot de passe (sinon prompt)
#   OPS_TOTP      code TOTP 6 chiffres (si 2FA deja active)
#   OPS_RECOVERY  code de recuperation (alternative au TOTP)
#
# Premier login : 2FA pas encore active, le script enchaine SETUP -> CONFIRM
# interactivement. Tu n'as qu'a scanner le secret dans une app authenticator
# (Authy, Google Authenticator, 1Password, ...) et coller le code a 6 chiffres.

set -eu

OPS_URL="${OPS_URL:-http://127.0.0.1:4020}"
OPS_EMAIL="${OPS_EMAIL:-admin@transitsoftservices.com}"
OPS_DEBUG="${OPS_DEBUG:-0}"
VPS_ID="${1:-}"

need() { command -v "$1" >/dev/null 2>&1 || { echo "[err] '$1' requis." >&2; exit 1; }; }
need curl
need jq

# Parse la reponse {success, data:{...}} -> renvoie la valeur sous data.<key>
extract() { printf '%s' "$1" | jq -r --arg k "$2" '.data[$k] // empty'; }

# --- Helper HTTP avec logs formates ---
# Usage : do_request METHOD PATH JSON_BODY
# Imprime requete + reponse sur stderr quand OPS_DEBUG=1, ou sur erreur HTTP.
# Renvoie le BODY de la reponse sur stdout. Sort 0 si tout va bien, code HTTP sinon.
do_request() {
  _method="$1"
  _path="$2"
  _body="${3:-}"
  _url="$OPS_URL$_path"
  _tmp_body=$(mktemp)
  _tmp_hdr=$(mktemp)

  if [ "$OPS_DEBUG" = "1" ]; then
    echo "----- HTTP $_method $_url -----" >&2
    if [ -n "$_body" ]; then
      # Masque les champs sensibles dans le log
      _sanitized=$(printf '%s' "$_body" | jq -c '
        if has("password") then .password = "***" else . end
        | if has("totpCode") then .totpCode = "***" else . end
        | if has("recoveryCode") then .recoveryCode = "***" else . end
      ' 2>/dev/null || printf '%s' "$_body")
      echo "Body  : $_sanitized" >&2
    fi
  fi

  _start=$(date +%s%3N 2>/dev/null || date +%s)

  if [ -n "$_body" ]; then
    _code=$(curl -sS -o "$_tmp_body" -D "$_tmp_hdr" -w '%{http_code}' \
      --max-time 30 \
      -X "$_method" "$_url" \
      ${_auth_header:+-H "Authorization: Bearer $_auth_header"} \
      -H 'Content-Type: application/json' \
      -d "$_body" \
      2>/dev/null) || _code="000"
  else
    _code=$(curl -sS -o "$_tmp_body" -D "$_tmp_hdr" -w '%{http_code}' \
      --max-time 30 \
      -X "$_method" "$_url" \
      ${_auth_header:+-H "Authorization: Bearer $_auth_header"} \
      2>/dev/null) || _code="000"
  fi

  _end=$(date +%s%3N 2>/dev/null || date +%s)
  _ms=$((_end - _start))

  _resp=$(cat "$_tmp_body")
  rm -f "$_tmp_body" "$_tmp_hdr"

  # POSIX-only : pas de ${var:0:1}. Le 'case' qui suit fait aussi office de check 2xx.
  _is_2xx=0
  case "$_code" in 2*) _is_2xx=1 ;; esac

  if [ "$OPS_DEBUG" = "1" ] || [ "$_is_2xx" -eq 0 ]; then
    echo "Status: $_code (${_ms} ms)" >&2
    if [ -n "$_resp" ]; then
      _pretty=$(printf '%s' "$_resp" | jq '.' 2>/dev/null || printf '%s' "$_resp")
      echo "Resp  : $_pretty" >&2
    else
      echo "Resp  : (empty body -- backend a probablement crashe)" >&2
    fi
    [ "$OPS_DEBUG" = "1" ] && echo "----------------------" >&2
  fi

  printf '%s' "$_resp"
  [ "$_is_2xx" -eq 1 ] && return 0 || return 1
}

# Authorization header (initialise apres le login)
_auth_header=""

# --- Password ---
if [ -z "${OPS_PASSWORD:-}" ]; then
  printf "Mot de passe pour %s : " "$OPS_EMAIL" >&2
  stty -echo 2>/dev/null || true
  IFS= read -r OPS_PASSWORD
  stty echo 2>/dev/null || true
  echo "" >&2
fi

# --- 1. Login ---
echo "[1] Login en tant que $OPS_EMAIL sur $OPS_URL..." >&2
LOGIN_BODY=$(jq -n --arg e "$OPS_EMAIL" --arg p "$OPS_PASSWORD" '{email:$e, password:$p}')
LOGIN_RES=$(do_request POST /ops/auth/login "$LOGIN_BODY") || {
  echo "[err] Login HTTP a echoue (cf. logs ci-dessus)." >&2
  exit 1
}

ACCESS=$(extract "$LOGIN_RES" "accessToken")
CHALLENGE=$(extract "$LOGIN_RES" "challengeToken")
REQ2FA=$(printf '%s' "$LOGIN_RES" | jq -r '.data.requires2FA // false')

# Decoder le payload JWT du challenge pour savoir si c'est un setup ou un verify.
# Le payload encode `kind: 'setup_required'` pour le premier login, sinon c'est
# un simple challenge de verification.
jwt_kind() {
  # `local` n'est pas POSIX. dash le supporte en pratique mais on s'en passe.
  _token="$1"
  _payload="${_token#*.}"        # strip header.
  _payload="${_payload%%.*}"     # strip .signature
  # pad base64url
  case $((${#_payload} % 4)) in
    2) _payload="${_payload}==" ;;
    3) _payload="${_payload}=" ;;
  esac
  printf '%s' "$_payload" | tr '_-' '/+' | base64 -d 2>/dev/null | jq -r '.kind // empty'
}

# --- 2. Gestion 2FA ---
if [ -z "$ACCESS" ] && [ -n "$CHALLENGE" ]; then
  KIND=$(jwt_kind "$CHALLENGE")
  echo "[2FA] Second facteur requis (kind=${KIND:-unknown})." >&2

  # Endpoint utilise selon kind :
  #  - setup_required -> POST /auth/2fa/confirm {challengeToken, totpCode}
  #    (premier setup, en plus du code on recoit les recovery codes)
  #  - totp_required  -> POST /auth/login {email, password, totpCode}
  #    (2FA deja active, le serveur re-verifie tout en une etape)
  do_totp() {
    if [ "$KIND" = "totp_required" ]; then
      _body=$(jq -n --arg e "$OPS_EMAIL" --arg p "$OPS_PASSWORD" --arg t "$1" \
              '{email:$e, password:$p, totpCode:$t}')
      TFA=$(do_request POST /ops/auth/login "$_body") || true
    else
      _body=$(jq -n --arg c "$CHALLENGE" --arg t "$1" \
              '{challengeToken:$c, totpCode:$t}')
      TFA=$(do_request POST /ops/auth/2fa/confirm "$_body") || true
    fi
    ACCESS=$(extract "$TFA" "accessToken")
  }
  do_confirm() { do_totp "$1"; }

  if [ -n "${OPS_TOTP:-}" ]; then
    do_totp "$OPS_TOTP"

  elif [ -n "${OPS_RECOVERY:-}" ]; then
    _body=$(jq -n --arg c "$CHALLENGE" --arg r "$OPS_RECOVERY" \
            '{challengeToken:$c, recoveryCode:$r}')
    TFA=$(do_request POST /ops/auth/2fa/recovery "$_body") || true
    ACCESS=$(extract "$TFA" "accessToken")

  elif [ "$KIND" = "setup_required" ]; then
    # Premier login -> setup interactif
    echo "" >&2
    echo "[2FA-setup] Le 2FA n'est pas encore configure pour ce compte." >&2
    echo "            Je demande au serveur le secret TOTP..." >&2

    _body=$(jq -n --arg c "$CHALLENGE" '{challengeToken:$c}')
    SETUP=$(do_request POST /ops/auth/2fa/setup "$_body") || {
      echo "[err] /auth/2fa/setup a echoue." >&2
      exit 1
    }

    SECRET=$(extract "$SETUP" "secret")
    OTP_AUTH_URL=$(extract "$SETUP" "otpAuthUrl")
    QR_PNG_DATAURL=$(extract "$SETUP" "qrCodeDataUrl")

    echo "" >&2
    echo "===========================================" >&2
    echo "  AJOUTE CE COMPTE A TON APP AUTHENTICATOR" >&2
    echo "===========================================" >&2
    echo "" >&2
    echo "  Secret (cle Base32) : $SECRET" >&2
    [ -n "$OTP_AUTH_URL" ] && echo "  URL otpauth         : $OTP_AUTH_URL" >&2
    echo "" >&2

    # Affiche un QR ASCII si qrencode est dispo, sinon une URL clickable
    if command -v qrencode >/dev/null 2>&1 && [ -n "$OTP_AUTH_URL" ]; then
      echo "  Scan ce QR (ou utilise le secret au-dessus) :" >&2
      echo "" >&2
      printf '%s' "$OTP_AUTH_URL" | qrencode -t UTF8 -o - >&2
      echo "" >&2
    elif [ -n "$QR_PNG_DATAURL" ]; then
      QR_TMP=$(mktemp -t opqr.XXXXXX.png)
      printf '%s' "$QR_PNG_DATAURL" | sed 's/^data:image\/png;base64,//' | base64 -d > "$QR_TMP" 2>/dev/null || true
      if [ -s "$QR_TMP" ]; then
        echo "  QR code ecrit dans : $QR_TMP" >&2
        echo "  (depuis ton Mac : scp deploy@VPS:$QR_TMP /tmp/ && open /tmp/$(basename "$QR_TMP"))" >&2
      fi
    fi

    # Demande le 1er code TOTP
    while true; do
      printf "[2FA-setup] Entre les 6 chiffres affiches par ton app : " >&2
      IFS= read -r TOTP
      TOTP=$(printf '%s' "$TOTP" | tr -d ' \r\n')
      [ -n "$TOTP" ] && break
    done

    _body=$(jq -n --arg c "$CHALLENGE" --arg t "$TOTP" '{challengeToken:$c, totpCode:$t}')
    TFA=$(do_request POST /ops/auth/2fa/confirm "$_body") || true
    ACCESS=$(extract "$TFA" "accessToken")

    # Codes de recuperation eventuellement renvoyes
    RECOVERY=$(printf '%s' "$TFA" | jq -r '.data.recoveryCodes // empty | if type=="array" then join("\n  ") else empty end')
    if [ -n "$RECOVERY" ]; then
      echo "" >&2
      echo "==== CODES DE RECUPERATION (a sauvegarder hors VPS) ====" >&2
      echo "  $RECOVERY" >&2
      echo "========================================================" >&2
    fi

  else
    # 2FA deja active : juste demander le code TOTP courant et le renvoyer
    # au /auth/login (cf. do_totp ci-dessus, branche totp_required).
    while true; do
      printf "[2FA] Entre les 6 chiffres affiches par ton app : " >&2
      IFS= read -r TOTP
      TOTP=$(printf '%s' "$TOTP" | tr -d ' \r\n')
      [ -n "$TOTP" ] && break
    done
    do_totp "$TOTP"
  fi
fi

if [ -z "$ACCESS" ]; then
  echo "[err] Login final echoue. Reponse :" >&2
  printf '%s' "${TFA:-$LOGIN_RES}" | jq -c '.' >&2
  exit 1
fi
echo "[ok] Token obtenu." >&2

# --- 3. Reconcile ---
_auth_header="$ACCESS"   # do_request envoie maintenant Authorization: Bearer ...

if [ -n "$VPS_ID" ]; then
  echo "[3] Reconciliation Caddy pour VPS $VPS_ID..." >&2
  BODY=$(jq -n --arg v "$VPS_ID" '{vpsId:$v}')
else
  echo "[3] Reconciliation Caddy pour TOUS les VPS..." >&2
  BODY='{}'
fi

# On capture meme en cas d'echec pour pouvoir afficher le diagnostic.
set +e
REC=$(do_request POST /ops/caddy/reconcile "$BODY")
REC_STATUS=$?
set -e

if [ "$REC_STATUS" -ne 0 ]; then
  echo "" >&2
  cat >&2 <<EOF
[err] La reconciliation a echoue. Si la reponse est vide ('Empty reply from server'),
      le backend a probablement crashe pendant la requete. Verifie :

  1. Logs de l'orchestrator :
       docker compose -f docker-compose.control-plane.yml logs --tail=50 orchestrator

  2. Schema BDD a jour (si tu as fait un 'db push' avant d'ajouter isMain) :
       docker compose -f docker-compose.control-plane.yml exec orchestrator \\
         prisma db push --schema=./prisma/schema.prisma --accept-data-loss

  3. Caddy admin joignable depuis le conteneur :
       docker compose -f docker-compose.control-plane.yml exec orchestrator \\
         wget -qO- http://host.docker.internal:2019/config/ | head -c 200

  4. Relance avec OPS_DEBUG=1 pour voir toutes les requetes :
       OPS_DEBUG=1 OPS_PASSWORD='...' OPS_TOTP='...' ./scripts/reconcile-caddy.sh
EOF
  exit 1
fi

echo "" >&2
echo "==== Resultat ====" >&2
printf '%s' "$REC" | jq '.'

TOTAL=$(printf '%s' "$REC" | jq '[.data[].tenantCount] | add // 0')
COUNT=$(printf '%s' "$REC" | jq '.data | length')
echo "" >&2
echo "[ok] $COUNT VPS reconcilie(s), $TOTAL tenant(s) servi(s)." >&2
