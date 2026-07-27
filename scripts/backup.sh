#!/bin/sh
# ─────────────────────────────────────────────────────────────
#  Byteweise Sicherung der Nebula-Datenbank mit pg_dump.
#
#  Ergaenzt den JSON-Export im Adminbereich um eine vollstaendige
#  Datenbanksicherung: Schema, Daten, Sequenzen, Indizes.
#
#  Aufruf:  ./scripts/backup.sh [Zielverzeichnis]
# ─────────────────────────────────────────────────────────────
set -eu

root="$(cd "$(dirname "$0")/.." && pwd)"
out_dir="${1:-$root/backups}"
container="${NEBULA_DB_CONTAINER:-nebula-db}"

user="nebula"
database="nebula"
if [ -f "$root/.env" ]; then
  # Nur die beiden benoetigten Werte lesen, ohne die Datei auszufuehren.
  value_of() {
    sed -n "s/^[[:space:]]*$1[[:space:]]*=[[:space:]]*\"\{0,1\}\([^\"#]*\)\"\{0,1\}[[:space:]]*$/\1/p" \
      "$root/.env" | tail -n 1
  }
  [ -n "$(value_of POSTGRES_USER)" ] && user="$(value_of POSTGRES_USER)"
  [ -n "$(value_of POSTGRES_DB)" ] && database="$(value_of POSTGRES_DB)"
fi

if ! docker ps --filter "name=$container" --format '{{.Names}}' | grep -qx "$container"; then
  echo "Container '$container' laeuft nicht. Zuerst 'docker compose up -d db' ausfuehren." >&2
  exit 1
fi

mkdir -p "$out_dir"
stamp="$(date +%Y-%m-%d-%H%M%S)"
target="$out_dir/nebula-$stamp.sql"

echo "Sichere Datenbank '$database' aus Container '$container'..."
# --clean --if-exists macht die Datei fuer sich allein einspielbar.
docker exec "$container" pg_dump -U "$user" -d "$database" --clean --if-exists > "$target"

size="$(du -h "$target" | cut -f1)"
echo "Fertig: $target ($size)"
echo "Wiederherstellen mit: ./scripts/restore.sh \"$target\""
