# Nebula auf einem Server betreiben

Schritt für Schritt: von der leeren Maschine bis zur laufenden Instanz hinter
TLS — und wie Updates danach ablaufen.

Für Installation zum Ausprobieren und die Entwicklungsvarianten siehe
[README.md](README.md). Hier geht es um den Dauerbetrieb.

---

## Was du brauchst

| | |
| --- | --- |
| Server | Linux mit Docker Engine ≥ 24 und Compose v2 |
| Sonst | `git`, `curl`, eine POSIX-Shell — **kein Node, kein npm** |
| Arbeitsspeicher | 1 GB reichen; beim Bauen kurzzeitig ~2 GB |
| Plattenplatz | ~2 GB für Abbilder, dazu die Datenbank |
| Domain | Eine (Unter-)Domain, die auf den Server zeigt |
| TLS | Pflicht, wenn du Passkeys willst — siehe Schritt 6 |

> **Warum TLS Pflicht ist:** Passkeys verlangen einen sicheren Kontext.
> Über `http://` an einer LAN-IP funktionieren sie nicht. Passwort und
> Zwei-Faktor gehen auch ohne, aber dann läuft dein Passwort im Klartext
> übers Netz — betreibe Nebula nicht ohne TLS.

---

## 1 · Docker installieren

```bash
curl -fsSL https://get.docker.com | sh
sudo usermod -aG docker "$USER"
newgrp docker            # oder ab- und wieder anmelden

docker --version && docker compose version
```

## 2 · Nebula holen

```bash
sudo mkdir -p /opt/nebula && sudo chown "$USER" /opt/nebula
git clone https://git.example.com/dein-name/nebula.git /opt/nebula
cd /opt/nebula
```

## 3 · Konfigurieren

```bash
./scripts/setup.sh        # legt .env an, würfelt ein APP_SECRET, setzt Rechte 600
```

Das Skript ist reines POSIX-Shell und braucht **kein Node** — auf einem
reinen Docker-Host ist keins installiert. Es nimmt `openssl`, falls
vorhanden, sonst `/dev/urandom`.

Ganz von Hand geht auch:

```bash
cp .env.example .env
chmod 600 .env
openssl rand -base64 32        # den Wert als APP_SECRET eintragen
```

Dann die `.env` öffnen und mindestens diese drei Werte anpassen:

```env
# Die Adresse, unter der du Nebula im Browser aufrufst.
# Bestimmt die WebAuthn-rpID — passt sie nicht, scheitern Passkeys.
APP_URL="https://nebula.deine-domain.de"

# Verschlüsselt die Git-Tokens. Lang, zufällig, niemals teilen.
APP_SECRET="…dein-langer-zufallswert…"

# Das Datenbankpasswort. Die Voreinstellung „nebula" ist für Entwicklung.
POSTGRES_PASSWORD="…noch-ein-langer-zufallswert…"
```

Die Ports müssen nicht angefasst werden: `APP_PORT` steht schon auf
`127.0.0.1:3000`, und die Datenbank veröffentlicht gar nichts.

> **`APP_SECRET` später zu ändern** macht gespeicherte Git-Tokens unlesbar.
> Sie müssen dann neu hinterlegt werden. Konten, Passwörter und Passkeys
> bleiben unberührt.
>
> **`APP_URL` später zu ändern** macht bestehende **Passkeys ungültig**, weil
> sie an die rpID gebunden sind. Passwörter funktionieren weiter.

### Welche Ports überhaupt hinausgehen

Nach einer regulären Installation ist es **genau einer**:

| Container | Host-Port | Wann |
| --- | --- | --- |
| `nebula-app` | `APP_PORT`, Vorgabe `127.0.0.1:3000` | `--profile full` |
| `nebula-db` | — | **nie** |
| `nebula-adminer` | `ADMINER_PORT`, Vorgabe `127.0.0.1:8080` | nur `--profile tools` |

**Die Datenbank veröffentlicht nichts.** Im Vollbetrieb spricht die Anwendung
Postgres über das interne Docker-Netz als `db:5432` an — die `DATABASE_URL`
setzt Compose selbst. Auch `scripts/backup.sh` und `restore.sh` gehen über
`docker exec`, nicht über den Host. Ein Host-Port wäre nur eine zusätzliche
Angriffsfläche und würde mit anderen Postgres-Containern auf demselben Host
um den Port streiten.

Wer die Datenbank beim Entwickeln doch vom Host aus braucht — `npm run dev`
läuft ja außerhalb des Containers — nimmt `docker-compose.dev.yml` dazu
(`npm run docker:db`). Auf einem Server hat diese Datei nichts zu suchen.

Auch der Port der Anwendung liegt auf `127.0.0.1`: nach draußen geht es über
den Reverse Proxy aus Schritt 6.

### Variante: gar keinen Port veröffentlichen

Liegen mehrere Stacks auf demselben Docker-Host und regelt ein gemeinsamer
Reverse Proxy den Zugang, braucht Nebula überhaupt keinen Host-Port. Dafür
gibt es **`docker-compose.server.yml`**: es nimmt die letzte verbliebene
Freigabe zurück und hängt die Anwendung in ein geteiltes Netz.

```bash
docker network create proxy      # falls der Proxy-Stack es nicht schon anlegt
```

```env
# .env
COMPOSE_FILE="docker-compose.yml:docker-compose.server.yml"
COMPOSE_PROFILES="full"
PROXY_NETWORK="proxy"            # so heißt das Netz
PROXY_ALIAS="nebula"             # so findet der Proxy die Anwendung
```

Compose liest beides aus der `.env`. Danach genügt überall — auch in
`scripts/update.sh` — ein schlichtes `docker compose up -d`. Im Proxy zeigt
das Ziel dann nicht mehr auf `127.0.0.1:3000`, sondern auf **`nebula:3000`**;
Schritt 6 zeigt beide Schreibweisen.

> Ohne die Datei würde ein Override die Portlisten **zusammenhängen** statt
> sie zu ersetzen — Compose führt `ports` anfügend zusammen. Das `!reset`
> darin ist genau dafür da und braucht Compose 2.24 oder neuer.
>
> Das Trennzeichen in `COMPOSE_FILE` ist unter Linux der Doppelpunkt, unter
> Windows das Semikolon.

## 4 · Starten

```bash
docker compose --profile full up -d --build
```

Der erste Bau dauert ein paar Minuten. Der Container spielt beim Start
selbst die Migrationen ein und wartet dabei auf die Datenbank.

```bash
docker compose --profile full logs -f app     # mitlesen, Strg+C beendet nur das Lesen
curl -s localhost:3000/api/health             # {"status":"ok","database":"up",…}
```

Ohne veröffentlichten Port geht die Frage an den Container statt an den Host
— das Abbild bringt einen `HEALTHCHECK` mit:

```bash
docker inspect --format '{{.State.Health.Status}}' nebula-app   # healthy
```

## 5 · Ersten Zugang anlegen

Ruf `https://nebula.deine-domain.de/setup` auf (nach Schritt 6) oder
vorübergehend über einen SSH-Tunnel:

```bash
ssh -L 3000:127.0.0.1:3000 benutzer@server
# dann lokal http://localhost:3000/setup öffnen
```

Dort legst du das Administratorkonto an und wählst die Betriebsart.
**Danach ist `/setup` dauerhaft gesperrt.**

Anschließend gleich unter *Mein Konto*:

1. **Passkey hinzufügen** — geht erst, wenn TLS steht
2. **Zwei-Faktor einrichten** und die Wiederherstellungscodes wegschreiben

## 6 · Reverse Proxy mit TLS

Nebula bringt keinen eigenen TLS-Abschluss mit. Beispiel mit **Caddy**, das
Zertifikate von selbst besorgt und erneuert:

```caddyfile
# /etc/caddy/Caddyfile
nebula.deine-domain.de {
    reverse_proxy 127.0.0.1:3000
}
```

```bash
sudo systemctl reload caddy
```

Das genügt. Caddy setzt `X-Forwarded-*` von selbst, holt das Zertifikat bei
Let's Encrypt und leitet `http` auf `https` um.

Läuft der Proxy selbst als Container im geteilten Netz (die Variante ohne
veröffentlichte Ports), lautet das Ziel stattdessen `nebula:3000` —
Docker löst den Alias auf:

```caddyfile
nebula.deine-domain.de {
    reverse_proxy nebula:3000
}
```

<details>
<summary>Dasselbe mit nginx</summary>

```nginx
server {
    listen 443 ssl http2;
    server_name nebula.deine-domain.de;

    ssl_certificate     /etc/letsencrypt/live/nebula.deine-domain.de/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/nebula.deine-domain.de/privkey.pem;

    location / {
        proxy_pass http://127.0.0.1:3000;
        proxy_set_header Host              $host;
        proxy_set_header X-Real-IP         $remote_addr;
        proxy_set_header X-Forwarded-For   $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }
}
```

Zertifikat mit `certbot --nginx -d nebula.deine-domain.de`.
</details>

> Steht `APP_URL` auf `https://…`, setzt Nebula das `Secure`-Flag auf die
> Sitzungscookies. Läuft der Proxy auf `https`, die `APP_URL` aber noch auf
> `http`, funktioniert die Anmeldung — nur ohne dieses Flag. Also beides
> gleichziehen.

## 7 · Firewall

```bash
sudo ufw allow 22/tcp
sudo ufw allow 80,443/tcp
sudo ufw enable
```

Port 3000 bleibt **zu**, 5432 wird ohnehin nie veröffentlicht. Die Firewall
ist hier der zweite Riegel, nicht der erste.

> Docker schreibt seine Portfreigaben direkt in `iptables` und geht dabei an
> `ufw` **vorbei**. Eine Freigabe auf `0.0.0.0` steht also im Netz, auch wenn
> `ufw` sie zu melden scheint. Genau deshalb wird hier an `127.0.0.1`
> gebunden, statt sich auf die Firewall zu verlassen.

## 8 · Sicherungen automatisieren

`scripts/backup.sh` legt einen `pg_dump` unter `backups/` ab. Täglich per
Cron:

```bash
crontab -e
```

```cron
# Jede Nacht um 3:15 sichern, 30 Tage aufheben
15 3 * * * cd /opt/nebula && ./scripts/backup.sh >> /var/log/nebula-backup.log 2>&1
30 3 * * * find /opt/nebula/backups -name '*.sql.gz' -mtime +30 -delete
```

Zurückspielen:

```bash
./scripts/restore.sh backups/nebula-2026-07-27-03-15-00.sql.gz
```

> Die Sicherungen liegen auf **demselben Server**. Das hilft gegen einen
> verpatzten Import, nicht gegen einen Plattenausfall. Zieh sie regelmäßig
> woandershin — `rsync`, `restic`, was du ohnehin nutzt.

---

## Updates

Dafür gibt es `scripts/update.sh`. Es macht alles in der richtigen
Reihenfolge und bricht ab, sobald ein Schritt scheitert:

```bash
cd /opt/nebula
./scripts/update.sh
```

Was es tut:

| Schritt | |
| --- | --- |
| **1 Prüfen** | docker, compose, `.env` da? Ist `APP_SECRET` gesetzt und nicht mehr der Entwicklungswert? |
| | *(alles ohne Node — das Skript liest die Version selbst aus der `package.json`)* |
| **2 Holen** | `git pull --ff-only`; zeigt die neuen Commits und fragt nach |
| **3 Sichern** | `pg_dump` **vor** jeder Schemaänderung |
| **4 Bauen** | Erst bauen, dann umschalten — ein gescheiterter Bau lässt die alte Fassung laufen |
| **5 Starten** | Container neu; die Migrationen laufen im Entrypoint |
| **6 Prüfen** | Bis zu zwei Minuten warten, bis der Container sich gesund meldet |

Scheitert die Gesundheitsprüfung, zeigt das Skript die letzten Logzeilen und
nennt den Weg zurück.

```bash
./scripts/update.sh --yes            # ohne Rückfrage, für Cron
./scripts/update.sh --ref v1.4.0     # auf eine bestimmte Fassung
./scripts/update.sh --no-pull        # nur neu bauen, ohne git pull
```

### Wenn doch etwas schiefgeht

```bash
# Zurück auf den vorigen Stand (die Kennung nennt das Skript beim Abbruch)
git checkout <kennung>
./scripts/update.sh --no-pull --yes

# Nur wenn eine Migration die Daten beschädigt hat:
./scripts/restore.sh backups/<die-sicherung-von-vorhin>.sql.gz
```

> **Migrationen werden nicht zurückgerollt.** Eine Migration, die eine Spalte
> entfernt, ist nicht umkehrbar — deshalb sichert das Skript vorher. Steht
> ein Update mit Datenmigration an, lies vorher den Änderungsverlauf
> (Versionsnummer in der Fußzeile).

---

## Betrieb

### Zustand ansehen

```bash
docker compose --profile full ps
docker compose --profile full logs -f app
curl -s localhost:3000/api/health
```

### Neu starten

```bash
docker compose --profile full restart app
```

### Speicher- und Plattenverbrauch

```bash
docker stats --no-stream nebula-app nebula-db
docker system df
docker image prune -f          # alte Abbilder nach mehreren Updates
```

### Automatischer Abgleich

Standardmäßig **aus**. Einzuschalten unter *Admin-Einstellungen →
Automatischer Abgleich*: Abstand, Repositories je Durchlauf, ob fertige
Projekte ausgelassen werden. Der Zeitgeber läuft im Serverprozess selbst —
kein zusätzlicher Container, kein Cron.

Wer lieber von außen taktet, lässt ihn aus und ruft
`POST /api/admin/sync/run` auf.

---

## Härtung, die schon eingebaut ist

Damit du weißt, worum du dich **nicht** kümmern musst:

- Der Container läuft als **unprivilegierter Benutzer** (`nextjs`, UID 1001),
  nicht als root.
- **Content-Security-Policy** mit Nonce, `strict-dynamic` und ohne
  `unsafe-inline` für Skripte.
- **CSRF-Prüfung** über `Sec-Fetch-Site`/`Origin` bei jedem schreibenden
  Zugriff.
- **SSRF-Schutz** bei allen ausgehenden Aufrufen: jede Adresse wird
  aufgelöst und gegen Loopback, Link-Local und Metadaten-Endpunkte geprüft,
  Weiterleitungen eingeschlossen.
- **Ratenbegrenzung** auf Anmeldung, ausgehende Abrufe und schreibende
  Zugriffe; Kontosperre nach acht Fehlversuchen.
- **Git-Tokens** liegen AES-256-GCM-verschlüsselt in der Datenbank und
  verlassen den Server nie — auch nicht im Export.
- Der **Bildoptimierer** von Next ist abgeschaltet: Nebula benutzt ihn nicht,
  und `/_next/image` wäre sonst eine Angriffsfläche ohne Gegenwert.

### Was du beisteuern musst

- **TLS** über den Reverse Proxy
- **`APP_SECRET`** lang und zufällig
- **Datenbankport** nicht nach außen öffnen
- **Sicherungen** wegschaffen
- **Systemupdates**: `unattended-upgrades` für das Betriebssystem,
  `./scripts/update.sh` für Nebula

---

## Mehrbenutzerbetrieb

Nebula kann beides. Im Einzelbetrieb gibt es genau ein Konto und keine
Registrierung. Umschalten unter *Admin-Einstellungen*.

Wichtig zu wissen: **Projekte sind zwischen Konten hart getrennt.** Auch ein
Administrator sieht fremde Projekte nicht — er verwaltet Konten, keine
Inhalte. Wer gemeinsam an einem Projekt arbeiten will, ist mit Nebula falsch
beraten; das ist [bewusst nicht](ROADMAP.md) vorgesehen.

Die Selbstregistrierung ist standardmäßig aus. Lass sie aus, wenn die
Instanz aus dem Internet erreichbar ist und du nicht willst, dass sich
Fremde Konten anlegen.
