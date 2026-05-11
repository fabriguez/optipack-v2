#!/bin/sh
# Orchestrator entrypoint : attend la BDD ops_admin, applique les migrations
# Prisma, puis lance le serveur.
#
# Calque sur docker/api/entrypoint.sh pour rester homogene.
set -e

cd /app

# Resolve prisma CLI (prod image apres pnpm prune ou dev image)
if [ -x ./node_modules/.bin/prisma ]; then
  PRISMA="./node_modules/.bin/prisma"
elif command -v prisma >/dev/null 2>&1; then
  PRISMA="prisma"
else
  echo "[orchestrator] prisma CLI introuvable. Aborting." >&2
  exit 1
fi

echo "[orchestrator] Attente de ops-postgres..."
ATTEMPTS=0
MAX_ATTEMPTS="${DB_WAIT_MAX_ATTEMPTS:-60}"
until echo "SELECT 1;" | "$PRISMA" db execute --schema=./prisma/schema.prisma --stdin >/dev/null 2>&1; do
  ATTEMPTS=$((ATTEMPTS + 1))
  if [ "$ATTEMPTS" -eq 1 ] || [ $((ATTEMPTS % 10)) -eq 0 ]; then
    echo "[orchestrator] Tentative ${ATTEMPTS}/${MAX_ATTEMPTS} echouee." >&2
  fi
  if [ "$ATTEMPTS" -ge "$MAX_ATTEMPTS" ]; then
    echo "[orchestrator] ops-postgres inaccessible apres ${MAX_ATTEMPTS} tentatives. Aborting." >&2
    exit 1
  fi
  sleep 2
done

echo "[orchestrator] Application des migrations Prisma..."
"$PRISMA" migrate deploy --schema=./prisma/schema.prisma

if [ "${OPS_RUN_SEED:-false}" = "true" ]; then
  echo "[orchestrator] Seed initial (OPS_RUN_SEED=true)..."
  # tsx peut etre absent en prod (devDep) - on tente, on log si echec mais on ne
  # bloque pas le boot.
  if [ -x ./node_modules/.bin/tsx ]; then
    ./node_modules/.bin/tsx prisma/seed.ts || echo "[orchestrator] seed ignore (echec non bloquant)"
  else
    echo "[orchestrator] tsx absent en prod, seed ignore."
  fi
fi

echo "[orchestrator] Demarrage du serveur sur :${OPS_PORT:-4020}..."
exec node dist/index.js
