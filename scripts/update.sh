#!/usr/bin/env bash
# ─────────────────────────────────────────────────────────────
#  Nebula auf einem Server aktualisieren.
#
#  Holt den neuen Stand, sichert die Datenbank, baut das Abbild, spielt die
#  Migrationen ein und startet neu. Bricht ab, sobald ein Schritt scheitert –
#  und sagt dann, wie zurueckzukommen ist.
#
#  Aufruf:   ./scripts/update.sh
#            ./scripts/update.sh --no-pull      (nur neu bauen und starten)
#            ./scripts/update.sh --ref v1.4.0   (auf einen Stand festlegen)
#            ./scripts/update.sh --yes          (ohne Rueckfrage)
#
#  Rueckgabe 0 heisst: die neue Fassung laeuft und antwortet gesund.
# ─────────────────────────────────────────────────────────────
set -euo pipefail

root="$(cd "$(dirname "$0")/.." && pwd)"
cd "$root"

pull=1
ref=""
zusage=0

while [ $# -gt 0 ]; do
  case "$1" in
    --no-pull) pull=0 ;;
    --ref) ref="${2:-}"; shift ;;
    --yes|-y) zusage=1 ;;
    -h|--help) sed -n '3,15p' "$0" | sed 's/^# \{0,1\}//'; exit 0 ;;
    *) echo "Unbekannte Option: $1" >&2; exit 2 ;;
  esac
  shift
done

# ── Farben, aber nur wenn ein Terminal zusieht ───────────────
if [ -t 1 ]; then
  rot=$'\033[31m'; gruen=$'\033[32m'; gelb=$'\033[33m'; fett=$'\033[1m'; aus=$'\033[0m'
else
  rot=""; gruen=""; gelb=""; fett=""; aus=""
fi

# Die Version aus der package.json lesen – ohne Node. Auf einem reinen
# Docker-Host ist keins installiert, und dieses Skript soll dort laufen.
paket_version() {
  sed -n 's/.*"version"[[:space:]]*:[[:space:]]*"\([^"]*\)".*/\1/p' "$root/package.json" \
    | head -n 1
}

schritt() { printf '\n%s▸ %s%s\n' "$fett" "$1" "$aus"; }
ok()      { printf '  %s✓%s %s\n' "$gruen" "$aus" "$1"; }
warnung() { printf '  %s!%s %s\n' "$gelb" "$aus" "$1"; }
abbruch() { printf '\n%s✗ %s%s\n' "$rot" "$1" "$aus" >&2; exit 1; }

# ── Voraussetzungen ──────────────────────────────────────────
schritt "Voraussetzungen"

command -v docker >/dev/null || abbruch "docker nicht gefunden."
docker compose version >/dev/null 2>&1 || abbruch "docker compose (v2) nicht gefunden."
[ -f "$root/.env" ] || abbruch "Keine .env in $root. Zuerst './scripts/setup.sh' ausfuehren."
[ -f "$root/docker-compose.yml" ] || abbruch "Kein docker-compose.yml in $root."
ok "docker, compose und .env vorhanden"

# APP_SECRET muss gesetzt sein – sonst liegen die Git-Tokens faktisch offen.
if grep -qE '^\s*APP_SECRET\s*=\s*("?)(nebula-dev-secret[^"]*|)\1\s*$' "$root/.env"; then
  abbruch "APP_SECRET ist leer oder noch der Entwicklungswert. Bitte in der .env setzen."
fi
ok "APP_SECRET gesetzt"

vorher="$(git rev-parse --short HEAD 2>/dev/null || echo "unbekannt")"
version_vorher="$(paket_version)"
printf '  Aktuell: v%s (%s)\n' "$version_vorher" "$vorher"

# ── Neuen Stand holen ────────────────────────────────────────
if [ "$pull" -eq 1 ]; then
  schritt "Neuen Stand holen"

  if [ -n "$(git status --porcelain)" ]; then
    abbruch "Das Arbeitsverzeichnis ist nicht sauber. Bitte erst committen oder verwerfen."
  fi

  git fetch --all --tags --quiet
  if [ -n "$ref" ]; then
    git checkout --quiet "$ref"
    ok "Auf $ref gewechselt"
  else
    zweig="$(git rev-parse --abbrev-ref HEAD)"
    git pull --ff-only --quiet origin "$zweig"
    ok "$zweig aktualisiert"
  fi

  nachher="$(git rev-parse --short HEAD)"
  version_nachher="$(paket_version)"

  if [ "$vorher" = "$nachher" ]; then
    warnung "Kein neuer Stand – es wird trotzdem neu gebaut."
  else
    printf '  Neu:     v%s (%s)\n' "$version_nachher" "$nachher"
    printf '\n  Was dazukam:\n'
    git --no-pager log --oneline --no-decorate "$vorher..$nachher" 2>/dev/null | sed 's/^/    /' || true
  fi
else
  warnung "Ohne --pull: der vorhandene Stand wird neu gebaut."
fi

# ── Rueckfrage ───────────────────────────────────────────────
if [ "$zusage" -eq 0 ] && [ -t 0 ]; then
  printf '\n%sWeiter? Die Datenbank wird vorher gesichert. [j/N] %s' "$fett" "$aus"
  read -r antwort
  case "$antwort" in [jJyY]*) ;; *) abbruch "Abgebrochen." ;; esac
fi

# ── Datenbank sichern ────────────────────────────────────────
schritt "Datenbank sichern"

# Die Datenbank muss laufen, sonst gibt es nichts zu sichern.
docker compose up -d db >/dev/null
sicherung=""
if [ -x "$root/scripts/backup.sh" ]; then
  ausgabe="$("$root/scripts/backup.sh" 2>&1)" || abbruch "Sicherung fehlgeschlagen:\n$ausgabe"
  # backup.sh setzt den Pfad in Anfuehrungszeichen – die gehoeren nicht in
  # den Namen, sonst laesst sich der Vorschlag am Ende nicht kopieren.
  sicherung="$(printf '%s' "$ausgabe" | grep -oE '[^ "]*backups/[^ "]*\.sql[^ "]*' | tail -n 1 || true)"
  ok "Gesichert${sicherung:+: $sicherung}"
else
  warnung "scripts/backup.sh fehlt – es wird ohne Sicherung fortgefahren."
fi

# ── Bauen ────────────────────────────────────────────────────
schritt "Abbild bauen"
# Erst bauen, dann umschalten: ein Fehlschlag laesst die alte Fassung laufen.
docker compose --profile full build app || abbruch "Der Bau ist gescheitert. Die laufende Fassung ist unveraendert."
ok "Abbild gebaut"

# ── Starten ──────────────────────────────────────────────────
schritt "Starten"
# Die Migrationen laufen im entrypoint.sh, bevor der Server hochkommt.
docker compose --profile full up -d || abbruch "Der Start ist gescheitert."
ok "Container gestartet"

# ── Gesundheitspruefung ──────────────────────────────────────
schritt "Gesundheitspruefung"

# Gefragt wird der Container selbst, nicht der Host. Das Abbild bringt einen
# HEALTHCHECK mit, und so ist es einerlei, ob APP_PORT nur eine Nummer ist
# oder wie auf einem Server "127.0.0.1:3000" – und curl braucht es auch nicht.
gesund=0
for _ in $(seq 1 40); do
  zustand="$(docker inspect --format '{{.State.Health.Status}}' nebula-app 2>/dev/null || echo "weg")"
  case "$zustand" in
    healthy) gesund=1; break ;;
    unhealthy) break ;;
  esac
  sleep 3
done

if [ "$gesund" -ne 1 ]; then
  printf '\n%sLetzte Zeilen aus dem Log:%s\n' "$fett" "$aus"
  docker compose --profile full logs --tail 40 app || true
  printf '\n%sZurueck zur vorigen Fassung:%s\n' "$fett" "$aus"
  printf '  git checkout %s && ./scripts/update.sh --no-pull --yes\n' "$vorher"
  [ -n "$sicherung" ] && printf '  Datenbank notfalls: ./scripts/restore.sh %s\n' "$sicherung"
  abbruch "Der Container meldet sich nach zwei Minuten nicht gesund (Zustand: ${zustand})."
fi
ok "Container meldet sich gesund"

# Die Anzeige der Adresse: aus APP_PORT kann "3000" oder "127.0.0.1:3000"
# kommen – fuer die Ausgabe zaehlt nur, was hinter dem letzten Doppelpunkt steht.
port_roh="$(sed -n 's/^[[:space:]]*APP_PORT[[:space:]]*=[[:space:]]*"\{0,1\}\([^"#]*\)"\{0,1\}[[:space:]]*$/\1/p' "$root/.env" | tail -n 1)"
port_roh="${port_roh:-3000}"
port="${port_roh##*:}"

if command -v curl >/dev/null 2>&1; then
  antwort_json="$(curl -fsS "http://127.0.0.1:${port}/api/health" 2>/dev/null || true)"
  [ -n "$antwort_json" ] && ok "Antwort: $antwort_json"
fi

# ── Fertig ───────────────────────────────────────────────────
version_jetzt="$(paket_version)"
printf '\n%s%s✓ Nebula v%s laeuft auf %s%s\n' "$gruen" "$fett" "$version_jetzt" "$port_roh" "$aus"
[ -n "$sicherung" ] && printf '  Sicherung vor dem Update: %s\n' "$sicherung"
printf '  Log mitlesen: docker compose --profile full logs -f app\n\n'
