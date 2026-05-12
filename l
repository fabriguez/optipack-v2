git clone git@github.com:fabriguez/optipack-v2.git ~/optipack-v2
cd ~/optipack-v2

# Generer les valeurs aleatoires pour l'env
POSTGRES_PWD=$(openssl rand -hex 16)
JWT_S=$(openssl rand -hex 32)
JWT_R=$(openssl rand -hex 32)
AUTH_S=$(openssl rand -hex 32)
MINIO_S=$(openssl rand -hex 16)
MINIO_RP=$(openssl rand -hex 16)
OPS_PG_PWD=$(openssl rand -hex 24)
OPS_JWT=$(openssl rand -hex 32)
OPS_MK=$(openssl rand -hex 32)

cat > .env <<EOF
# === Tenant principal ===
NODE_ENV=production
DATABASE_URL=postgresql://optipack:${POSTGRES_PWD}@postgres:5432/optipack?schema=public
POSTGRES_DB=optipack
POSTGRES_USER=optipack
POSTGRES_PASSWORD=${POSTGRES_PWD}
REDIS_URL=redis://redis:6379
REDIS_PASSWORD=
MINIO_ENDPOINT=minio
MINIO_PORT=9000
MINIO_ACCESS_KEY=optipack
MINIO_SECRET_KEY=${MINIO_S}
MINIO_BUCKET=optipack
MINIO_ROOT_USER=optipack
MINIO_ROOT_PASSWORD=${MINIO_RP}
JWT_SECRET=${JWT_S}
JWT_REFRESH_SECRET=${JWT_R}
JWT_ACCESS_EXPIRY=45m
JWT_REFRESH_EXPIRY=7d
AUTH_SECRET=${AUTH_S}
API_PORT=4000
API_URL=https://api.transitsoftservices.com
WEB_URL=https://app.transitsoftservices.com
AUTH_URL=https://app.transitsoftservices.com
NEXT_PUBLIC_API_URL=https://api.transitsoftservices.com/api/v1
NEXT_PUBLIC_SOCKET_URL=https://api.transitsoftservices.com
SOCKET_CORS_ORIGIN=https://app.transitsoftservices.com
INTERNAL_API_URL=http://api:4000/api/v1
SMTP_HOST=smtp.gmail.com
SMTP_PORT=587
SMTP_SECURE=false
SMTP_USER=
SMTP_PASS=
SMTP_FROM=

# === Orchestrator ===
OPS_PORT=4020
OPS_POSTGRES_USER=opsadmin
OPS_POSTGRES_PASSWORD=${OPS_PG_PWD}
OPS_POSTGRES_DB=ops_admin
OPS_DATABASE_URL=postgresql://opsadmin:${OPS_PG_PWD}@ops-postgres:5432/ops_admin
OPS_REDIS_URL=redis://ops-redis:6379
OPS_JWT_SECRET=${OPS_JWT}
OPS_MASTER_KEY=${OPS_MK}
OPS_TOTP_ISSUER=OptiPack Ops
OPS_GHCR_NAMESPACE=brightkyefoo
OPS_GHCR_TOKEN=placeholder
OPS_PUBLIC_WEB_URL=https://ops.transitsoftservices.com
OPS_BASE_DOMAIN=transitsoftservices.com
OPS_CADDY_EMAIL=admin@transitsoftservices.com
OPS_SELF_VPS_NAME=self
# L'orchestrator pousse vers Caddy host via l'IP du Docker bridge (172.17.0.1).
# Si tu lances l'orchestrator en network_mode: host, change pour http://localhost:2019
CADDY_ADMIN_URL=http://172.17.0.1:2019
EOF
chmod 600 .env

# Affiche les valeurs critiques a sauvegarder hors VPS
echo "===== A SAUVEGARDER HORS VPS (1Password / Vault) ====="
grep -E '^(POSTGRES_PASSWORD|OPS_POSTGRES_PASSWORD|OPS_MASTER_KEY|JWT_SECRET|JWT_REFRESH_SECRET|AUTH_SECRET|OPS_JWT_SECRET|MINIO_ROOT_PASSWORD)=' .env
echo "===== Specialement : OPS_MASTER_KEY est irrecuperable ====="
