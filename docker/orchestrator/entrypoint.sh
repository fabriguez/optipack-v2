#!/bin/sh
# Orchestrator entrypoint : attend la BDD ops_admin, applique les migrations
# Prisma, puis lance le serveur.
#
# Calque sur docker/api/entrypoint.sh pour rester homogene.
set -e

# WORKDIR de l'image runtime = /app/apps/orchestrator (cf. Dockerfile.prod).
# Le schema Prisma est en ./prisma/schema.prisma, le code en ./dist.
cd /app/apps/orchestrator

# Resolve prisma CLI : la version globale (npm install -g) est privilegiee
# pour eviter les symlinks pnpm cassants entre layers Docker.
if command -v prisma >/dev/null 2>&1; then
  PRISMA="prisma"
elif [ -x ./node_modules/.bin/prisma ]; then
  PRISMA="./node_modules/.bin/prisma"
else
  echo "[orchestrator] prisma CLI introuvable. Aborting." >&2
  exit 1
fi

# Parse OPS_DATABASE_URL pour extraire host/port/user/db -> pg_isready.
# Format attendu : postgresql://user:pwd@host:port/dbname?...
DB_URL="${OPS_DATABASE_URL:-}"
if [ -z "$DB_URL" ]; then
  echo "[orchestrator] OPS_DATABASE_URL non defini. Aborting." >&2
  exit 1
fi

# sed peu portable : on extrait via shell parameter expansion
NO_PROTO="${DB_URL#postgresql://}"
NO_PROTO="${NO_PROTO#postgres://}"
USERPWD_HOSTPORT_DB="${NO_PROTO%%\?*}"   # strip ?args
USERPWD_HOSTPORT="${USERPWD_HOSTPORT_DB%%/*}"
DB_NAME="${USERPWD_HOSTPORT_DB#*/}"
USERPWD="${USERPWD_HOSTPORT%@*}"
HOSTPORT="${USERPWD_HOSTPORT##*@}"
DB_USER="${USERPWD%%:*}"
DB_HOST="${HOSTPORT%%:*}"
DB_PORT="${HOSTPORT##*:}"
[ "$DB_PORT" = "$DB_HOST" ] && DB_PORT=5432

echo "[orchestrator] Attente de ${DB_HOST}:${DB_PORT} (user=${DB_USER}, db=${DB_NAME})..."
ATTEMPTS=0
MAX_ATTEMPTS="${DB_WAIT_MAX_ATTEMPTS:-60}"
until pg_isready -h "$DB_HOST" -p "$DB_PORT" -U "$DB_USER" -d "$DB_NAME" >/dev/null 2>&1; do
  ATTEMPTS=$((ATTEMPTS + 1))
  if [ "$ATTEMPTS" -eq 1 ] || [ $((ATTEMPTS % 5)) -eq 0 ]; then
    echo "[orchestrator] Tentative ${ATTEMPTS}/${MAX_ATTEMPTS} :" >&2
    pg_isready -h "$DB_HOST" -p "$DB_PORT" -U "$DB_USER" -d "$DB_NAME" >&2 || true
  fi
  if [ "$ATTEMPTS" -ge "$MAX_ATTEMPTS" ]; then
    echo "[orchestrator] ${DB_HOST}:${DB_PORT} inaccessible apres ${MAX_ATTEMPTS} tentatives. Aborting." >&2
    exit 1
  fi
  sleep 2
done
echo "[orchestrator] BDD prete."

echo "[orchestrator] Application des migrations Prisma..."
"$PRISMA" migrate deploy --schema=./prisma/schema.prisma

# Le orchestrator n'a pas de dossier prisma/migrations (developpe en `db push`
# pendant le bootstrap). `migrate deploy` ne fait donc rien et le schema en DB
# peut diverger de schema.prisma quand on ajoute une colonne (ex: P2022 sur
# releases.webClientImageTag). On force un `db push` pour synchroniser tant
# qu'on n'a pas de migrations versionnees.
#
# OPS_DB_SYNC=migrate -> seul migrate deploy s'execute (skip push).
if [ "${OPS_DB_SYNC:-push}" = "push" ]; then
  echo "[orchestrator] Sync schema (prisma db push --accept-data-loss=false)..."
  "$PRISMA" db push --schema=./prisma/schema.prisma --accept-data-loss=false --skip-generate
fi

if [ "${OPS_RUN_SEED:-false}" = "true" ]; then
  echo "[orchestrator] Seed initial (OPS_RUN_SEED=true)..."
  # tsx est installe globalement en prod (cf. Dockerfile.prod -> npm i -g tsx).
  if command -v tsx >/dev/null 2>&1; then
    tsx prisma/seed.ts || echo "[orchestrator] seed ignore (echec non bloquant)"
  elif [ -x ./node_modules/.bin/tsx ]; then
    ./node_modules/.bin/tsx prisma/seed.ts || echo "[orchestrator] seed ignore (echec non bloquant)"
  else
    echo "[orchestrator] tsx absent, seed ignore."
  fi
fi

echo "[orchestrator] Demarrage du serveur sur :${OPS_PORT:-4020}..."
exec node dist/index.js
