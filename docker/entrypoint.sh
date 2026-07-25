#!/bin/sh
# ─────────────────────────────────────────────────────────────
#  Startet Nebula im Container: erst Migrationen, dann der Server.
# ─────────────────────────────────────────────────────────────
set -e

PRISMA_CLI="/opt/prisma-cli/node_modules/prisma/build/index.js"
SCHEMA="/app/prisma/schema.prisma"

if [ -z "$DATABASE_URL" ]; then
  echo "[nebula] FEHLER: DATABASE_URL ist nicht gesetzt." >&2
  exit 1
fi

if [ ! -f "$PRISMA_CLI" ]; then
  echo "[nebula] FEHLER: Prisma-CLI nicht unter $PRISMA_CLI gefunden." >&2
  exit 1
fi

echo "[nebula] Migrationen werden eingespielt…"

attempt=0
max_attempts=15
until node "$PRISMA_CLI" migrate deploy --schema "$SCHEMA"; do
  attempt=$((attempt + 1))
  if [ "$attempt" -ge "$max_attempts" ]; then
    echo "[nebula] FEHLER: Migration nach $max_attempts Versuchen fehlgeschlagen." >&2
    exit 1
  fi
  echo "[nebula] Datenbank noch nicht bereit – neuer Versuch in 3s ($attempt/$max_attempts)"
  sleep 3
done

echo "[nebula] Migrationen ok. Server startet auf Port ${PORT:-3000}."
exec "$@"
