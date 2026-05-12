#!/bin/sh
# Reconcilie la config Caddy via l'orchestrator (POST /ops/caddy/reconcile).
#
# A lancer sur le VPS principal apres :
#  1. le boot de l'orchestrator
#  2. le seed du super-admin + tenant principal (SEED_MAIN_TENANT=true)
#  3. (optionnel) le setup 2FA du super-admin
#
# Usage :
#   ./scripts/reconcile-caddy.sh [VPS_ID]
#
# Si VPS_ID est fourni, ne reconcilie que ce VPS, sinon tous.
#
# Variables d'env :
#   OPS_URL       URL de l'orchestrator (defaut: http://127.0.0.1:4020)
#   OPS_EMAIL     email du super-admin    (defaut: admin@transitsoftservices.com)
#   OPS_PASSWORD  mot de passe            (defaut: prompt si absent)
#   OPS_TOTP      code TOTP 6 chiffres a 2FA active (sinon prompt)
#   OPS_RECOVERY  code de recuperation 8 chiffres (alternative au TOTP)

set -eu

OPS_URL="${OPS_URL:-http://127.0.0.1:4020}"
OPS_EMAIL="${OPS_EMAIL:-admin@transitsoftservices.com}"
VPS_ID="${1:-}"

# --- Prereq ---
need() { command -v "$1" >/dev/null 2>&1 || { echo "[err] '$1' requis." >&2; exit 1; }; }
need curl
need jq

# --- Password ---
if [ -z "${OPS_PASSWORD:-}" ]; then
  printf "Mot de passe pour %s : " "$OPS_EMAIL" >&2
  stty -echo 2>/dev/null || true
  IFS= read -r OPS_PASSWORD
  stty echo 2>/dev/null || true
  echo "" >&2
fi

# --- 1. Login ---
echo "[1/2] Login en tant que $OPS_EMAIL sur $OPS_URL..." >&2
LOGIN_RES=$(curl -fsSL -X POST "$OPS_URL/ops/auth/login" \
  -H 'Content-Type: application/json' \
  -d "$(jq -n --arg e "$OPS_EMAIL" --arg p "$OPS_PASSWORD" \
        '{email:$e, password:$p}')")

ACCESS=$(printf '%s' "$LOGIN_RES" | jq -r '.accessToken // empty')
CHALLENGE=$(printf '%s' "$LOGIN_RES" | jq -r '.challengeToken // empty')

if [ -z "$ACCESS" ] && [ -n "$CHALLENGE" ]; then
  echo "[2FA] Le serveur exige un second facteur." >&2

  # Soit on a un code TOTP (app authenticator), soit un code de recuperation.
  if [ -n "${OPS_TOTP:-}" ]; then
    TFA_RES=$(curl -fsSL -X POST "$OPS_URL/ops/auth/2fa/confirm" \
      -H 'Content-Type: application/json' \
      -d "$(jq -n --arg c "$CHALLENGE" --arg t "$OPS_TOTP" \
            '{challengeToken:$c, totpCode:$t}')")
    ACCESS=$(printf '%s' "$TFA_RES" | jq -r '.accessToken // empty')
  elif [ -n "${OPS_RECOVERY:-}" ]; then
    TFA_RES=$(curl -fsSL -X POST "$OPS_URL/ops/auth/2fa/recovery" \
      -H 'Content-Type: application/json' \
      -d "$(jq -n --arg c "$CHALLENGE" --arg r "$OPS_RECOVERY" \
            '{challengeToken:$c, recoveryCode:$r}')")
    ACCESS=$(printf '%s' "$TFA_RES" | jq -r '.accessToken // empty')
  else
    cat >&2 <<EOF
[err] 2FA requis. Relance le script avec une des options :
        OPS_TOTP=123456 ./scripts/reconcile-caddy.sh
        OPS_RECOVERY=XXXXXXXX ./scripts/reconcile-caddy.sh

      Si tu n'as jamais configure 2FA :
        curl -X POST $OPS_URL/ops/auth/2fa/setup \\
          -H 'Content-Type: application/json' \\
          -d '{"challengeToken":"$CHALLENGE"}'
        # Scanne le QR code retourne dans une app authenticator (Authy/Google Auth)
        # puis confirme avec /auth/2fa/confirm
EOF
    exit 1
  fi
fi

if [ -z "$ACCESS" ]; then
  echo "[err] Login echoue : $(printf '%s' "$LOGIN_RES" | jq -c '.')" >&2
  exit 1
fi

echo "[ok] Token obtenu." >&2

# --- 2. Reconcile ---
if [ -n "$VPS_ID" ]; then
  echo "[2/2] Reconciliation Caddy pour VPS $VPS_ID..." >&2
  BODY=$(jq -n --arg v "$VPS_ID" '{vpsId:$v}')
else
  echo "[2/2] Reconciliation Caddy pour TOUS les VPS..." >&2
  BODY='{}'
fi

REC_RES=$(curl -fsSL -X POST "$OPS_URL/ops/caddy/reconcile" \
  -H "Authorization: Bearer $ACCESS" \
  -H 'Content-Type: application/json' \
  -d "$BODY")

echo "" >&2
echo "==== Resultat ====" >&2
printf '%s' "$REC_RES" | jq '.'

# Resume lisible
echo "" >&2
TOTAL=$(printf '%s' "$REC_RES" | jq '[.data[].tenantCount] | add // 0')
COUNT=$(printf '%s' "$REC_RES" | jq '.data | length')
echo "[ok] $COUNT VPS reconcilie(s), $TOTAL tenant(s) servi(s)." >&2
