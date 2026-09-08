# ── Сборка ──────────────────────────────────────────────────────────────────
FROM node:22-alpine AS builder
RUN apk add --no-cache openssl
RUN corepack enable
WORKDIR /app

# Манифесты для кэширования установки
COPY pnpm-workspace.yaml package.json pnpm-lock.yaml* ./
COPY packages/db/package.json packages/db/
COPY packages/shared/package.json packages/shared/
COPY apps/site/package.json apps/site/

# `--no-frozen-lockfile`, а не `--frozen-lockfile=false`: форму с
# «=false» pnpm 12 больше не разбирает, а эта работает во всех версиях.
RUN pnpm install --no-frozen-lockfile

# Исходники
COPY packages ./packages
COPY apps/site ./apps/site

# Prisma Client + сборка
RUN pnpm --filter @doza/db exec prisma generate
RUN pnpm --filter @doza/site build

# ── Рантайм ─────────────────────────────────────────────────────────────────
FROM node:22-alpine AS runner
RUN apk add --no-cache openssl
RUN corepack enable
WORKDIR /app
ENV NODE_ENV=production
ENV HOST=0.0.0.0
ENV PORT=4321

COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/packages ./packages
COPY --from=builder /app/apps/site/node_modules ./apps/site/node_modules
COPY --from=builder /app/apps/site/dist ./apps/site/dist
COPY --from=builder /app/apps/site/package.json ./apps/site/package.json

EXPOSE 4321
CMD ["node", "apps/site/dist/server/entry.mjs"]
