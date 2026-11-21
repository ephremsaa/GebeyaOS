<#
.SYNOPSIS
    GebeyaOS – Upgrade Script (Windows)
    Stop → Backup → Migrate → Swap release → Health check → Auto-rollback on failure.

.PARAMETER ReleasePath
    Path to the new release folder (extracted zip). If omitted, looks for
    the latest release in C:\GebeyaOS\releases\.

.EXAMPLE
    .\upgrade.ps1 -ReleasePath "C:\GebeyaOS\releases\gebeyaos-1.1.0"
#>

param(
    [string]$ReleasePath = ""
)

Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'

$InstallDir  = "C:\GebeyaOS"
$BackupDir   = "C:\GebeyaOS\backups"
$ReleasesDir = "$InstallDir\releases"
$EnvFile     = "$InstallDir\.env"
$LogFile     = "$InstallDir\logs\upgrade.log"
$ApiPort     = 3001

function Log {
    param([string]$Msg, [string]$Level = "INFO")
    $ts = Get-Date -Format "yyyy-MM-dd HH:mm:ss"
    $line = "[$ts] [$Level] $Msg"
    Write-Host $line
    Add-Content -Path $LogFile -Value $line -Encoding UTF8
}

function Get-EnvValue {
    param([string]$Key)
    $line = Get-Content $EnvFile | Where-Object { $_ -match "^$Key=" } | Select-Object -First 1
    if (-not $line) { throw "Missing $Key in $EnvFile" }
    return ($line -split '=', 2)[1]
}

$DbUser     = Get-EnvValue "DB_USER"
$DbPassword = Get-EnvValue "DB_PASSWORD"
$DbName     = Get-EnvValue "DB_NAME"
$DbHost     = Get-EnvValue "DB_HOST"

$pgBin = $null
foreach ($p in @("C:\Program Files\PostgreSQL\16\bin", "C:\Program Files\PostgreSQL\15\bin")) {
    if (Test-Path "$p\pg_dump.exe") { $pgBin = $p; break }
}
$env:PATH = "$pgBin;$env:PATH"

# Find release if not specified
if (-not $ReleasePath) {
    $releases = Get-ChildItem $ReleasesDir -Directory | Sort-Object Name -Descending
    if ($releases.Count -eq 0) {
        Log "No releases found in $ReleasesDir" "ERROR"
        exit 1
    }
    $ReleasePath = $releases[0].FullName
    Log "Auto-selected release: $ReleasePath"
}

if (-not (Test-Path $ReleasePath)) {
    Log "Release path not found: $ReleasePath" "ERROR"
    exit 1
}

Log "Starting upgrade from: $ReleasePath"

# ── 1. Pre-upgrade backup ────────────────────────────────────────────────────
Log "Taking pre-upgrade backup..."
& "$PSScriptRoot\backup.ps1"
if ($LASTEXITCODE -ne 0) {
    Log "Pre-upgrade backup FAILED. Aborting upgrade." "ERROR"
    exit 1
}
Log "Pre-upgrade backup complete"

# ── 2. Stop service ──────────────────────────────────────────────────────────
Log "Stopping GebeyaOS-API service..."
Stop-Service GebeyaOS-API -Force -ErrorAction SilentlyContinue
Start-Sleep 3
Log "Service stopped"

# Save current code as rollback point
$rollbackDir = "$InstallDir\rollback"
if (Test-Path "$InstallDir\apps") {
    if (Test-Path $rollbackDir) { Remove-Item $rollbackDir -Recurse -Force }
    Copy-Item "$InstallDir\apps" $rollbackDir -Recurse
    Log "Saved current code to $rollbackDir for rollback"
}

# ── 3. Apply new release ─────────────────────────────────────────────────────
Log "Applying new release..."
try {
    if (Test-Path "$ReleasePath\apps") {
        Copy-Item "$ReleasePath\apps" "$InstallDir\apps" -Recurse -Force
    }
    if (Test-Path "$ReleasePath\packages") {
        Copy-Item "$ReleasePath\packages" "$InstallDir\packages" -Recurse -Force
    }
    Log "Release files copied"
} catch {
    Log "Failed to copy release files: $_" "ERROR"
    Log "Rolling back..." "WARN"
    Copy-Item $rollbackDir "$InstallDir\apps" -Recurse -Force
    Start-Service GebeyaOS-API
    exit 1
}

# ── 4. Run migrations in a transaction ──────────────────────────────────────
Log "Running database migrations..."
$env:PGPASSWORD = $DbPassword
$migrationsDir = "$InstallDir\database\migrations"
if (Test-Path "$ReleasePath\database\migrations") {
    $migrationsDir = "$ReleasePath\database\migrations"
}

try {
    # Wrap all migration files in a single transaction
    $migrationSql = ""
    $migrations = Get-ChildItem "$migrationsDir\*.sql" | Sort-Object Name
    foreach ($m in $migrations) {
        $migrationSql += (Get-Content $m.FullName -Raw) + "`n"
    }
    $tmpSql = "$env:TEMP\gebeyaos_migrations_$((Get-Date).Ticks).sql"
    "BEGIN;`n$migrationSql`nCOMMIT;" | Set-Content $tmpSql -Encoding UTF8
    & psql -h $DbHost -U $DbUser -d $DbName -f $tmpSql
    if ($LASTEXITCODE -ne 0) { throw "Migration failed with exit code $LASTEXITCODE" }
    Remove-Item $tmpSql -Force
    Log "Migrations applied successfully"
} catch {
    Log "Migration FAILED: $_" "ERROR"
    Log "Rolling back code..." "WARN"
    Remove-Item Env:PGPASSWORD -ErrorAction SilentlyContinue
    Copy-Item $rollbackDir "$InstallDir\apps" -Recurse -Force
    Start-Service GebeyaOS-API
    exit 1
}

Remove-Item Env:PGPASSWORD -ErrorAction SilentlyContinue

# ── 5. Start service ─────────────────────────────────────────────────────────
Log "Starting GebeyaOS-API service..."
Start-Service GebeyaOS-API
Start-Sleep 10

# ── 6. Health check ──────────────────────────────────────────────────────────
Log "Running health check..."
$healthy = $false
for ($i = 0; $i -lt 5; $i++) {
    try {
        $r = Invoke-RestMethod "http://localhost:$ApiPort/ready" -TimeoutSec 5
        if ($r.status -eq 'ok') { $healthy = $true; break }
    } catch {}
    Start-Sleep 5
}

if ($healthy) {
    Log "Upgrade SUCCEEDED. Server is healthy."
    Write-Host ""
    Write-Host "  ✓ Upgrade complete! GebeyaOS is running on the new version." -ForegroundColor Green
    # Clean up rollback dir
    Remove-Item $rollbackDir -Recurse -Force -ErrorAction SilentlyContinue
} else {
    Log "Health check FAILED after upgrade. Initiating automatic rollback." "ERROR"
    Stop-Service GebeyaOS-API -Force -ErrorAction SilentlyContinue
    Copy-Item $rollbackDir "$InstallDir\apps" -Recurse -Force
    Start-Service GebeyaOS-API
    Start-Sleep 5
    Log "Rollback complete. Previous version restored."
    Write-Host ""
    Write-Host "  ✗ Upgrade failed – automatically rolled back to previous version." -ForegroundColor Red
    Write-Host "    Check logs at $LogFile for details." -ForegroundColor Gray
    exit 1
}
