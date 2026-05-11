# Dev image used by docker-compose.yml
FROM node:20-alpine

RUN corepack enable && corepack prepare pnpm@9.15.4 --activate

WORKDIR /app

# Workspace install is performed at runtime via the volume mount + entrypoint.
# For dev only - prod build is in Dockerfile.prod.

EXPOSE 3001

CMD ["pnpm", "--filter", "@transitsoftservices/web-client", "dev"]
