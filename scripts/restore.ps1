<#
.SYNOPSIS
    Spielt eine mit backup.ps1 erzeugte Sicherung zurueck.

.DESCRIPTION
    ACHTUNG: Der aktuelle Inhalt der Datenbank wird dabei ersetzt. Das Skript
    fragt vorher nach, es sei denn, -Force ist gesetzt.

.PARAMETER Database
    Zieldatenbank. Vorgabe: der Wert aus der .env.

    Tipp: Eine Sicherung laesst sich pruefen, ohne die echte Datenbank
    anzufassen - in eine leere Testdatenbank einspielen und nachsehen:

        docker exec nebula-db psql -U nebula -d postgres -c "CREATE DATABASE nebula_test"
        .\scripts\restore.ps1 -File .\backups\... -Database nebula_test -Force

.EXAMPLE
    .\scripts\restore.ps1 -File .\backups\nebula-2026-07-26-101500.sql
#>
[CmdletBinding()]
param(
    [Parameter(Mandatory = $true)][string]$File,
    [string]$Database,
    [string]$Container = "nebula-db",
    [switch]$Force
)

$ErrorActionPreference = "Stop"

if (-not (Test-Path $File)) { Write-Error "Datei nicht gefunden: $File" }

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
$database = if ($Database) { $Database } else { $settings["POSTGRES_DB"] }

if (-not $Force) {
    Write-Host "Der gesamte Inhalt der Datenbank '$database' wird ersetzt." -ForegroundColor Yellow
    $answer = Read-Host "Wirklich fortfahren? (ja/nein)"
    if ($answer -ne "ja") { Write-Host "Abgebrochen."; exit 0 }
}

$running = docker ps --filter "name=$Container" --format "{{.Names}}"
if ($running -notcontains $Container) {
    Write-Error "Container '$Container' laeuft nicht."
}

Write-Host "Spiele '$File' ein..."
Get-Content $File -Raw | docker exec -i $Container psql -U $user -d $database -v ON_ERROR_STOP=1

if ($LASTEXITCODE -ne 0) { Write-Error "Das Einspielen ist fehlgeschlagen." }

Write-Host "Fertig. Anwendung neu starten, damit sie eine frische Verbindung aufbaut." -ForegroundColor Green
