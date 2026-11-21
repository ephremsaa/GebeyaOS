<#
.SYNOPSIS
    GebeyaOS – Database Restore Script (Windows)

.DESCRIPTION
    Restores a PostgreSQL backup created by backup.ps1.
    Asks for confirmation before overwriting the live database.
    Optionally restores photos (uploads folder).

.PARAMETER BackupFile
    Path to the .dump file to restore. If omitted, lists available backups.

.EXAMPLE
    .\restore.ps1
    .\restore.ps1 -BackupFile "C:\GebeyaOS\backups\gebeyaos_branch_2026-01-15_02-00.dump"
#>

param(
    [string]$BackupFile = ""
)

Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'

$InstallDir  = "C:\GebeyaOS"
$BackupDir   = "C:\GebeyaOS\backups"
$EnvFile     = "$InstallDir\.env"

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
    if (Test-Path "$p\pg_restore.exe") { $pgBin = $p; break }
}
if (-not $pgBin) { Write-Host "PostgreSQL not found." -ForegroundColor Red; exit 1 }
$env:PATH = "$pgBin;$env:PATH"

# List backups if none specified
if (-not $BackupFile) {
    $backups = Get-ChildItem $BackupDir -Filter "*.dump" | Sort-Object LastWriteTime -Descending
    if ($backups.Count -eq 0) {
        Write-Host "No backups found in $BackupDir" -ForegroundColor Red
        exit 1
    }
    Write-Host ""
    Write-Host "Available backups:" -ForegroundColor Cyan
    $i = 1
    foreach ($b in $backups) {
        $sizeMB = [math]::Round($b.Length / 1MB, 1)
        Write-Host "  $i. $($b.Name)  ($sizeMB MB, $($b.LastWriteTime.ToString('yyyy-MM-dd HH:mm')))"
        $i++
    }
    Write-Host ""
    $choice = Read-Host "Enter backup number to restore (or Q to quit)"
    if ($choice -eq 'Q' -or $choice -eq 'q') { exit 0 }
    $idx = [int]$choice - 1
    $BackupFile = $backups[$idx].FullName
}

if (-not (Test-Path $BackupFile)) {
    Write-Host "Backup file not found: $BackupFile" -ForegroundColor Red
    exit 1
}

Write-Host ""
Write-Host "══════════════════════════════════════════════════════" -ForegroundColor Yellow
Write-Host "  WARNING: This will REPLACE the current database!" -ForegroundColor Yellow
Write-Host "══════════════════════════════════════════════════════" -ForegroundColor Yellow
Write-Host ""
Write-Host "  Backup file: $BackupFile"
Write-Host "  Target database: $DbName on $DbHost"
Write-Host ""
$confirm = Read-Host "Type YES (all caps) to continue"
if ($confirm -ne "YES") {
    Write-Host "Restore cancelled." -ForegroundColor Gray
    exit 0
}

# Stop the API service so no connections interfere
Write-Host "Stopping GebeyaOS-API service..." -ForegroundColor Yellow
Stop-Service GebeyaOS-API -Force -ErrorAction SilentlyContinue
Start-Sleep 2

$env:PGPASSWORD = $DbPassword
$env:PGOPTIONS  = "--client-min-messages=warning"

try {
    Write-Host "Dropping and recreating database '$DbName'..." -ForegroundColor Yellow
    $prevEAP = $ErrorActionPreference
    $ErrorActionPreference = 'SilentlyContinue'
    & psql -h $DbHost -U $DbUser -d postgres -c "SELECT pg_terminate_backend(pid) FROM pg_stat_activity WHERE datname = '$DbName';" 2>&1 | Out-Null
    & psql -h $DbHost -U $DbUser -d postgres -c "DROP DATABASE IF EXISTS $DbName;" 2>&1 | Out-Null
    & psql -h $DbHost -U $DbUser -d postgres -c "CREATE DATABASE $DbName OWNER $DbUser;" 2>&1 | Out-Null
    $ErrorActionPreference = $prevEAP

    Write-Host "Restoring from $BackupFile..." -ForegroundColor Yellow
    $prevEAP = $ErrorActionPreference
    $ErrorActionPreference = 'SilentlyContinue'
    & pg_restore -h $DbHost -U $DbUser -d $DbName -v $BackupFile 2>&1 | Select-Object -Last 10
    $ErrorActionPreference = $prevEAP
    if ($LASTEXITCODE -ne 0) { throw "pg_restore failed with exit code $LASTEXITCODE" }

    Write-Host ""
    Write-Host "  ✓ Database restored successfully!" -ForegroundColor Green
} catch {
    Write-Host "  ✗ Restore FAILED: $_" -ForegroundColor Red
    Write-Host "  The database may be in an inconsistent state." -ForegroundColor Red
    Write-Host "  Try restoring from a different backup." -ForegroundColor Gray
    Remove-Item Env:PGPASSWORD -ErrorAction SilentlyContinue
    Remove-Item Env:PGOPTIONS -ErrorAction SilentlyContinue
    Start-Service GebeyaOS-API -ErrorAction SilentlyContinue
    exit 1
}

Remove-Item Env:PGPASSWORD -ErrorAction SilentlyContinue
Remove-Item Env:PGOPTIONS -ErrorAction SilentlyContinue

# Check for photos backup
$photoZip = $BackupFile -replace '\.dump$', '_photos.zip'
if (Test-Path $photoZip) {
    $restorePhotos = Read-Host "Photo backup found. Restore photos too? (Y/N)"
    if ($restorePhotos -eq 'Y' -or $restorePhotos -eq 'y') {
        $uploadsDir = "$InstallDir\uploads"
        Write-Host "Restoring photos to $uploadsDir..." -ForegroundColor Yellow
        Expand-Archive -Path $photoZip -DestinationPath $uploadsDir -Force
        Write-Host "  ✓ Photos restored" -ForegroundColor Green
    }
}

# Restart API
Write-Host "Starting GebeyaOS-API service..." -ForegroundColor Yellow
Start-Service GebeyaOS-API
Start-Sleep 5

try {
    $h = Invoke-RestMethod "http://localhost:3001/ready" -TimeoutSec 10
    Write-Host "  ✓ API ready: $($h | ConvertTo-Json -Compress)" -ForegroundColor Green
} catch {
    Write-Host "  ✗ API health check failed after restore. Check logs." -ForegroundColor Red
}
