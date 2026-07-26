#!/bin/sh
# ─────────────────────────────────────────────────────────────
#  Legt die .env an und wuerfelt ein APP_SECRET.
#
#  Dasselbe wie scripts/setup.mjs, aber ohne Node: auf einem reinen
#  Docker-Host ist keins installiert, und nur zum Erzeugen einer Textdatei
#  eines zu verlangen waere albern. Braucht nichts ausser einer POSIX-Shell.
#
#  Aufruf:  ./scripts/setup.sh
#           ./scripts/setup.sh --force    (vorhandene .env ueberschreiben)
# ─────────────────────────────────────────────────────────────
set -eu

root="$(cd "$(dirname "$0")/.." && pwd)"
env_datei="$root/.env"
vorlage="$root/.env.example"
force=0

[ "${1:-}" = "--force" ] && force=1

if [ -t 1 ]; then
  gruen=$'\033[32m'; gelb=$'\033[33m'; cyan=$'\033[36m'; dim=$'\033[2m'; aus=$'\033[0m'
else
  gruen=""; gelb=""; cyan=""; dim=""; aus=""
fi

[ -f "$vorlage" ] || { echo "${gelb}.env.example nicht gefunden – abgebrochen.${aus}" >&2; exit 1; }

# ── Zufall ───────────────────────────────────────────────────
# openssl ist auf den meisten Systemen da, aber nicht auf allen. /dev/urandom
# gibt es ueberall, wo diese Shell laeuft – und base64 ebenso.
zufall() {
  if command -v openssl >/dev/null 2>&1; then
    openssl rand -base64 32
  else
    head -c 32 /dev/urandom | base64
  fi | tr -d '\n'
}

if [ -f "$env_datei" ] && [ "$force" -eq 0 ]; then
  echo "${gelb}·${aus} .env existiert bereits – sie wird nicht ueberschrieben."
  echo "  ${dim}Mit --force neu anlegen (die alte wird gesichert).${aus}"
else
  if [ -f "$env_datei" ]; then
    sicherung="$env_datei.$(date +%Y%m%d%H%M%S).bak"
    cp "$env_datei" "$sicherung"
    echo "${gelb}·${aus} Alte .env gesichert: $(basename "$sicherung")"
  fi

  secret="$(zufall)"
  # Das Geheimnis kann / und + enthalten; als sed-Ersetzung waeren das
  # Sonderzeichen. Deshalb zeilenweise ersetzen statt mit einem Ausdruck.
  : > "$env_datei"
  while IFS= read -r zeile || [ -n "$zeile" ]; do
    case "$zeile" in
      APP_SECRET=*) printf 'APP_SECRET="%s"\n' "$secret" >> "$env_datei" ;;
      *) printf '%s\n' "$zeile" >> "$env_datei" ;;
    esac
  done < "$vorlage"

  chmod 600 "$env_datei"
  echo "${gruen}✓${aus} .env angelegt, APP_SECRET zufaellig erzeugt, Rechte auf 600."
fi

echo
echo "${cyan}Noch anzupassen${aus}"
echo "${dim}─────────────────────────────────────────────${aus}"
echo "  APP_URL            die Adresse, unter der du Nebula aufrufst"
echo "                     ${dim}bestimmt die WebAuthn-rpID – passt sie nicht, scheitern Passkeys${aus}"
echo "  POSTGRES_PASSWORD  die Voreinstellung ist fuer Entwicklung gedacht"
echo "  APP_PORT           auf einem Server: 127.0.0.1:3000 hinter den Reverse Proxy"
echo
echo "${cyan}Danach${aus}"
echo "${dim}─────────────────────────────────────────────${aus}"
echo "  docker compose --profile full up -d --build"
echo "  ${dim}Der Container spielt die Migrationen beim Start selbst ein.${aus}"
echo
echo "  Ausfuehrlich: DEPLOYMENT.md"
echo
