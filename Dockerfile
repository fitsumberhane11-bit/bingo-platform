# Production image for the Next.js web app. Multi-stage build so the final
# runtime image ships only the standalone server bundle, not the full
# pnpm store / devDependencies / other packages' source.
#
# Build:  docker build -t bingo-web .
# Run:    docker run -p 3000:3000 --env-file .env.production bingo-web
#
# Requires DATABASE_URL/REDIS_URL pointing at real services (this image does
# NOT bundle Postgres or Redis — see docker-compose.yml for local dev, or
# point at managed services in production) and, per lib/env.ts's real-money
# gate, GAME_MONEY_MODE=REAL + ENABLE_MOCK_PAYMENTS=false + real provider
# credentials before this can legitimately handle real money.

FROM node:20-slim AS base
RUN corepack enable

# ---- deps: install once, cached across builds unless lockfile changes ----
FROM base AS deps
WORKDIR /repo
COPY pnpm-workspace.yaml pnpm-lock.yaml package.json ./
COPY apps/web/package.json apps/web/package.json
COPY packages/db/package.json packages/db/package.json
COPY packages/game-core/package.json packages/game-core/package.json
COPY packages/payments/package.json packages/payments/package.json
COPY packages/shared-types/package.json packages/shared-types/package.json
RUN pnpm install --frozen-lockfile

# ---- build: generate Prisma client, typecheck, produce the standalone bundle ----
FROM base AS build
WORKDIR /repo
COPY --from=deps /repo/node_modules ./node_modules
COPY --from=deps /repo/apps/web/node_modules ./apps/web/node_modules
COPY . .
RUN pnpm --filter @bingo/db generate
# Build-time env only needs to satisfy lib/env.ts's schema — real secrets
# are supplied at container *run* time via --env-file / orchestrator
# secrets, never baked into the image.
ENV NODE_ENV=production
ENV DATABASE_URL="postgresql://placeholder:placeholder@localhost:5432/placeholder"
ENV AUTH_JWT_ACCESS_SECRET="build-time-placeholder-not-used-at-runtime-000000"
ENV AUTH_JWT_REFRESH_SECRET="build-time-placeholder-not-used-at-runtime-00000"
ENV APP_ENCRYPTION_KEY="build-time-placeholder-not-used-at-runtime-0000000"
ENV ENABLE_MOCK_PAYMENTS=false
ENV GAME_MONEY_MODE=REAL
RUN pnpm --filter web build

# ---- runtime: minimal, non-root, only the standalone bundle ----
FROM base AS runtime
WORKDIR /app
ENV NODE_ENV=production
RUN groupadd --system --gid 1001 nodejs && useradd --system --uid 1001 --gid nodejs nextjs

COPY --from=build /repo/apps/web/.next/standalone ./
COPY --from=build /repo/apps/web/.next/static ./apps/web/.next/static
# public/ is optional — only copy it if it exists at build time.
COPY --from=build /repo/apps/web/public ./apps/web/public

USER nextjs
EXPOSE 3000
ENV PORT=3000
ENV HOSTNAME="0.0.0.0"

CMD ["node", "apps/web/server.js"]
