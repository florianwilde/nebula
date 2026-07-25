<#
.SYNOPSIS
    Byteweise Sicherung der Nebula-Datenbank mit pg_dump.

.DESCRIPTION
    Ergaenzt den JSON-Export im Adminbereich um eine vollstaendige
    Datenbanksicherung: Schema, Daten, Sequenzen, Indizes. Genau das, was
    man zum Wiederherstellen einer kaputten Instanz braucht.

    Laeuft die Datenbank im mitgelieferten Container, wird pg_dump dort
    ausgefuehrt - auf dem Rechner selbst muss dann nichts installiert sein.

.PARAMETER OutDir
    Zielverzeichnis. Vorgabe: .\backups

.PARAMETER Container
    Name des Postgres-Containers. Vorgabe: nebula-db

.EXAMPLE
    .\scripts\backup.ps1
    .\scripts\backup.ps1 -OutDir D:\Sicherungen
#>
[CmdletBinding()]
param(
    [string]$OutDir = (Join-Path $PSScriptRoot "..\backups"),
    [string]$Container = "nebula-db"
)

$ErrorActionPreference = "Stop"

# .env einlesen, damit Benutzer und Datenbankname nicht doppelt gepflegt werden.
$envFile = Join-Path $PSScriptRoot "..\.env"
$settings = @{ POSTGRES_USER = "nebula"; POSTGRES_DB = "nebula" }
if (Test-Path $envFile) {
    foreach ($line in Get-Content $envFile) {
        if ($line -match '^\s*([A-Z_]+)\s*=\s*"?([^"#]*)"?\s*$') {
            $settings[$Matches[1]] = $Matches[2].Trim()
        }
    }
}

$user = $settings["POSTGRES_USER"]
$database = $settings["POSTGRES_DB"]

if (-not (Test-Path $OutDir)) { New-Item -ItemType Directory -Path $OutDir | Out-Null }

$stamp = Get-Date -Format "yyyy-MM-dd-HHmmss"
$target = Join-Path $OutDir "nebula-$stamp.sql"

$running = docker ps --filter "name=$Container" --format "{{.Names}}"
if ($running -notcontains $Container) {
    Write-Error "Container '$Container' laeuft nicht. Zuerst 'docker compose up -d db' ausfuehren."
}

Write-Host "Sichere Datenbank '$database' aus Container '$Container'..."

# --clean --if-exists macht die Datei fuer sich allein einspielbar.
docker exec $Container pg_dump -U $user -d $database --clean --if-exists | Out-File -Encoding utf8 $target

if ($LASTEXITCODE -ne 0) { Write-Error "pg_dump ist fehlgeschlagen." }

$size = [math]::Round((Get-Item $target).Length / 1KB, 1)
Write-Host "Fertig: $target ($size KB)" -ForegroundColor Green
Write-Host "Wiederherstellen mit: .\scripts\restore.ps1 -File `"$target`""
