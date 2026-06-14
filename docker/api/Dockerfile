FROM node:20-alpine

RUN corepack enable && corepack prepare pnpm@9.15.4 --activate

WORKDIR /app

# Copy workspace config
COPY package.json pnpm-workspace.yaml pnpm-lock.yaml* ./
COPY apps/api/package.json ./apps/api/
COPY packages/shared/package.json ./packages/shared/
COPY packages/config/package.json ./packages/config/
COPY packages/config/tsconfig/package.json ./packages/config/tsconfig/
COPY packages/config/eslint/package.json ./packages/config/eslint/
COPY packages/config/tailwind/package.json ./packages/config/tailwind/
COPY patches/ ./patches/

# Install dependencies
RUN pnpm install --frozen-lockfile || pnpm install

# Copy source
COPY packages/ ./packages/
COPY apps/api/ ./apps/api/

# Generate Prisma client
RUN cd apps/api && npx prisma generate || true

WORKDIR /app/apps/api

EXPOSE 4000

# Entrypoint is wired up in docker-compose.yml (mounted as a volume)
CMD ["pnpm", "dev"]
