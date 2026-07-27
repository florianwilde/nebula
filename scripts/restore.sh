#!/bin/sh
# ─────────────────────────────────────────────────────────────
#  Spielt eine mit backup.sh erzeugte Sicherung zurueck.
#
#  ACHTUNG: Der aktuelle Inhalt der Datenbank wird ersetzt.
#
#  Aufruf:  ./scripts/restore.sh <datei.sql> [--force]
#
#  Zieldatenbank ueberschreiben mit NEBULA_DB_NAME. Damit laesst sich eine
#  Sicherung pruefen, ohne die echte Datenbank anzufassen:
#
#    docker exec nebula-db psql -U nebula -d postgres -c "CREATE DATABASE nebula_test"
#    NEBULA_DB_NAME=nebula_test ./scripts/restore.sh backups/... --force
# ─────────────────────────────────────────────────────────────
set -eu

root="$(cd "$(dirname "$0")/.." && pwd)"
file="${1:-}"
force="${2:-}"
container="${NEBULA_DB_CONTAINER:-nebula-db}"

if [ -z "$file" ]; then
  echo "Aufruf: ./scripts/restore.sh <datei.sql> [--force]" >&2
  exit 1
fi
if [ ! -f "$file" ]; then
  echo "Datei nicht gefunden: $file" >&2
  exit 1
fi

user="nebula"
database="nebula"
if [ -f "$root/.env" ]; then
  value_of() {
    sed -n "s/^[[:space:]]*$1[[:space:]]*=[[:space:]]*\"\{0,1\}\([^\"#]*\)\"\{0,1\}[[:space:]]*$/\1/p" \
      "$root/.env" | tail -n 1
  }
  [ -n "$(value_of POSTGRES_USER)" ] && user="$(value_of POSTGRES_USER)"
  [ -n "$(value_of POSTGRES_DB)" ] && database="$(value_of POSTGRES_DB)"
fi
database="${NEBULA_DB_NAME:-$database}"

if [ "$force" != "--force" ]; then
  printf "Der gesamte Inhalt der Datenbank '%s' wird ersetzt.\nWirklich fortfahren? (ja/nein) " "$database"
  read -r answer
  [ "$answer" = "ja" ] || { echo "Abgebrochen."; exit 0; }
fi

if ! docker ps --filter "name=$container" --format '{{.Names}}' | grep -qx "$container"; then
  echo "Container '$container' laeuft nicht." >&2
  exit 1
fi

echo "Spiele '$file' ein..."
docker exec -i "$container" psql -U "$user" -d "$database" -v ON_ERROR_STOP=1 < "$file"

echo "Fertig. Anwendung neu starten, damit sie eine frische Verbindung aufbaut."
