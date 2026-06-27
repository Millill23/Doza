# ── Сборка ──────────────────────────────────────────────────────────────────
FROM node:22-alpine AS builder
RUN apk add --no-cache openssl
RUN corepack enable
WORKDIR /app

COPY pnpm-workspace.yaml package.json pnpm-lock.yaml* ./
COPY packages/db/package.json packages/db/
COPY packages/shared/package.json packages/shared/
COPY apps/crm/package.json apps/crm/

RUN pnpm install --frozen-lockfile=false

COPY packages ./packages
COPY apps/crm ./apps/crm

ENV DOCKER_BUILD=1
RUN pnpm --filter @doza/db exec prisma generate
RUN pnpm --filter @doza/crm build

# ── Рантайм (standalone) ────────────────────────────────────────────────────
FROM node:22-alpine AS runner
RUN apk add --no-cache openssl
WORKDIR /app
ENV NODE_ENV=production
ENV HOSTNAME=0.0.0.0
ENV PORT=3000

# standalone-вывод Next.js включает только нужные node_modules
COPY --from=builder /app/apps/crm/.next/standalone ./
COPY --from=builder /app/apps/crm/.next/static ./apps/crm/.next/static
# Prisma engine (нужен в рантайме)
COPY --from=builder /app/node_modules/.pnpm/@prisma+client* ./node_modules/.pnpm/

# Next standalone не кладёт движок Prisma туда, где его ищет рантайм.
# Копируем libquery_engine в путь поиска Prisma (.next/server).
RUN ENGINE=$(find /app -name 'libquery_engine-*.so.node' 2>/dev/null | head -1) && \
    cp "$ENGINE" /app/apps/crm/.next/server/ && \
    echo "Prisma engine: $ENGINE -> .next/server/"

EXPOSE 3000
CMD ["node", "apps/crm/server.js"]
