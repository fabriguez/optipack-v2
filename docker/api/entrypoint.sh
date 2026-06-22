#!/bin/sh
set -e

cd /app/apps/api

# Resolve the prisma CLI: local (dev image, pnpm-installed) or global (prod image).
if [ -x ./node_modules/.bin/prisma ]; then
  PRISMA="./node_modules/.bin/prisma"
elif command -v prisma >/dev/null 2>&1; then
  PRISMA="prisma"
else
  echo "[entrypoint] prisma CLI not found. Aborting." >&2
  exit 1
fi

echo "[entrypoint] Waiting for database..."
ATTEMPTS=0
MAX_ATTEMPTS="${DB_WAIT_MAX_ATTEMPTS:-60}"
until echo "SELECT 1;" | "$PRISMA" db execute --schema=./prisma/schema.prisma --stdin >/dev/null 2>&1; do
  ATTEMPTS=$((ATTEMPTS + 1))
  if [ "$ATTEMPTS" -eq 1 ] || [ $((ATTEMPTS % 10)) -eq 0 ]; then
    echo "[entrypoint] Attempt ${ATTEMPTS}/${MAX_ATTEMPTS} failed. Last error:" >&2
    echo "SELECT 1;" | "$PRISMA" db execute --schema=./prisma/schema.prisma --stdin >&2 || true
  fi
  if [ "$ATTEMPTS" -ge "$MAX_ATTEMPTS" ]; then
    echo "[entrypoint] Database not reachable after ${MAX_ATTEMPTS} attempts. Aborting." >&2
    exit 1
  fi
  sleep 2
done
echo "[entrypoint] Database is reachable."

if [ "${RUN_DB_PUSH:-true}" = "true" ]; then
  echo "[entrypoint] Syncing schema (prisma db push)..."
  NODE_OPTIONS="--max-old-space-size=256" "$PRISMA" db push --schema=./prisma/schema.prisma --skip-generate --accept-data-loss
else
  echo "[entrypoint] Schema sync skipped (RUN_DB_PUSH=${RUN_DB_PUSH})."
fi

if [ "${RUN_SEED:-true}" = "true" ]; then
  echo "[entrypoint] Running seed (idempotent, version-guarded)..."
  NODE_OPTIONS="--max-old-space-size=256" "$PRISMA" db seed
else
  echo "[entrypoint] Seed skipped (RUN_SEED=${RUN_SEED})."
fi

echo "[entrypoint] Starting application: $*"
exec "$@"
