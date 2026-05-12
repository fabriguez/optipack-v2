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
VPS_ID="${1:-}"

need() { command -v "$1" >/dev/null 2>&1 || { echo "[err] '$1' requis." >&2; exit 1; }; }
need curl
need jq

# Parse la reponse {success, data:{...}} -> renvoie la valeur sous data.<key>
extract() { printf '%s' "$1" | jq -r --arg k "$2" '.data[$k] // empty'; }

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
LOGIN_RES=$(curl -fsSL -X POST "$OPS_URL/ops/auth/login" \
  -H 'Content-Type: application/json' \
  -d "$(jq -n --arg e "$OPS_EMAIL" --arg p "$OPS_PASSWORD" \
        '{email:$e, password:$p}')")

ACCESS=$(extract "$LOGIN_RES" "accessToken")
CHALLENGE=$(extract "$LOGIN_RES" "challengeToken")
REQ2FA=$(printf '%s' "$LOGIN_RES" | jq -r '.data.requires2FA // false')

# Decoder le payload JWT du challenge pour savoir si c'est un setup ou un verify.
# Le payload encode `kind: 'setup_required'` pour le premier login, sinon c'est
# un simple challenge de verification.
jwt_kind() {
  local token="$1"
  local payload="${token#*.}"   # strip header.
  payload="${payload%%.*}"      # strip .signature
  # pad base64url
  case $((${#payload} % 4)) in
    2) payload="${payload}==" ;;
    3) payload="${payload}=" ;;
  esac
  printf '%s' "$payload" | tr '_-' '/+' | base64 -d 2>/dev/null | jq -r '.kind // empty'
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
    # $1 = totp code
    if [ "$KIND" = "totp_required" ]; then
      TFA=$(curl -fsSL -X POST "$OPS_URL/ops/auth/login" \
        -H 'Content-Type: application/json' \
        -d "$(jq -n --arg e "$OPS_EMAIL" --arg p "$OPS_PASSWORD" --arg t "$1" \
              '{email:$e, password:$p, totpCode:$t}')")
    else
      TFA=$(curl -fsSL -X POST "$OPS_URL/ops/auth/2fa/confirm" \
        -H 'Content-Type: application/json' \
        -d "$(jq -n --arg c "$CHALLENGE" --arg t "$1" \
              '{challengeToken:$c, totpCode:$t}')")
    fi
    ACCESS=$(extract "$TFA" "accessToken")
  }
  do_confirm() { do_totp "$1"; }   # alias retro-compatible

  # Code TOTP fourni en env -> on tente direct.
  if [ -n "${OPS_TOTP:-}" ]; then
    do_totp "$OPS_TOTP"

  elif [ -n "${OPS_RECOVERY:-}" ]; then
    TFA=$(curl -fsSL -X POST "$OPS_URL/ops/auth/2fa/recovery" \
      -H 'Content-Type: application/json' \
      -d "$(jq -n --arg c "$CHALLENGE" --arg r "$OPS_RECOVERY" \
            '{challengeToken:$c, recoveryCode:$r}')")
    ACCESS=$(extract "$TFA" "accessToken")

  elif [ "$KIND" = "setup_required" ]; then
    # Premier login -> setup interactif
    echo "" >&2
    echo "[2FA-setup] Le 2FA n'est pas encore configure pour ce compte." >&2
    echo "            Je demande au serveur le secret TOTP..." >&2

    SETUP=$(curl -fsSL -X POST "$OPS_URL/ops/auth/2fa/setup" \
      -H 'Content-Type: application/json' \
      -d "$(jq -n --arg c "$CHALLENGE" '{challengeToken:$c}')")

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

    TFA=$(curl -fsSL -X POST "$OPS_URL/ops/auth/2fa/confirm" \
      -H 'Content-Type: application/json' \
      -d "$(jq -n --arg c "$CHALLENGE" --arg t "$TOTP" \
            '{challengeToken:$c, totpCode:$t}')")
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
if [ -n "$VPS_ID" ]; then
  echo "[3] Reconciliation Caddy pour VPS $VPS_ID..." >&2
  BODY=$(jq -n --arg v "$VPS_ID" '{vpsId:$v}')
else
  echo "[3] Reconciliation Caddy pour TOUS les VPS..." >&2
  BODY='{}'
fi

REC=$(curl -fsSL -X POST "$OPS_URL/ops/caddy/reconcile" \
  -H "Authorization: Bearer $ACCESS" \
  -H 'Content-Type: application/json' \
  -d "$BODY")

echo "" >&2
echo "==== Resultat ====" >&2
printf '%s' "$REC" | jq '.'

TOTAL=$(printf '%s' "$REC" | jq '[.data[].tenantCount] | add // 0')
COUNT=$(printf '%s' "$REC" | jq '.data | length')
echo "" >&2
echo "[ok] $COUNT VPS reconcilie(s), $TOTAL tenant(s) servi(s)." >&2
