# syntax=docker/dockerfile:1

# ─────────────────────────────────────────────────────────────
#  Nebula – Produktions-Image (Next.js standalone + Prisma)
#  Build:  docker compose --profile full build
#  Start:  docker compose --profile full up -d
# ─────────────────────────────────────────────────────────────

FROM node:22-alpine AS base
# openssl wird von den Prisma-Engines benoetigt, libc6-compat von Next.js.
RUN apk add --no-cache libc6-compat openssl
WORKDIR /app
ENV NEXT_TELEMETRY_DISABLED=1


# ── Abhaengigkeiten ──────────────────────────────────────────
FROM base AS deps
COPY package.json package-lock.json* ./
# prisma/ wird schon hier gebraucht, weil "postinstall" prisma generate ausfuehrt.
COPY prisma ./prisma
RUN if [ -f package-lock.json ]; then npm ci; else npm install; fi


# ── Build ────────────────────────────────────────────────────
FROM base AS builder
COPY --from=deps /app/node_modules ./node_modules
COPY . .
# Zur Build-Zeit wird keine echte Datenbank kontaktiert (alle Seiten sind
# dynamisch), Prisma verlangt die Variable aber beim Generieren.
ENV DATABASE_URL="postgresql://build:build@127.0.0.1:5432/build?schema=public"
RUN npm run build


# ── Laufzeit ─────────────────────────────────────────────────
FROM base AS runner
ENV NODE_ENV=production
ENV PORT=3000
ENV HOSTNAME=0.0.0.0

RUN addgroup -g 1001 -S nodejs && adduser -S nextjs -u 1001

COPY --from=builder /app/public ./public
COPY --from=builder --chown=nextjs:nodejs /app/.next/standalone ./
COPY --from=builder --chown=nextjs:nodejs /app/.next/static ./.next/static

# Prisma-CLI, Engines und Schema fuer "migrate deploy" beim Containerstart.
COPY --from=builder --chown=nextjs:nodejs /app/node_modules/prisma ./node_modules/prisma
COPY --from=builder --chown=nextjs:nodejs /app/node_modules/@prisma ./node_modules/@prisma
COPY --from=builder --chown=nextjs:nodejs /app/node_modules/.prisma ./node_modules/.prisma
COPY --from=builder --chown=nextjs:nodejs /app/prisma ./prisma

COPY docker/entrypoint.sh /usr/local/bin/entrypoint.sh
RUN chmod +x /usr/local/bin/entrypoint.sh

USER nextjs
EXPOSE 3000

HEALTHCHECK --interval=30s --timeout=5s --start-period=40s --retries=3 \
  CMD wget -q --spider http://127.0.0.1:3000/api/health || exit 1

ENTRYPOINT ["/usr/local/bin/entrypoint.sh"]
CMD ["node", "server.js"]
