<#
.SYNOPSIS
    GebeyaOS – Daily Backup Script (Windows)
    Backs up the PostgreSQL database and uploaded photos.
#>

Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'

$InstallDir  = "C:\GebeyaOS"
$BackupDir   = "$InstallDir\backups"
$EnvFile     = "$InstallDir\.env"
$LogFile     = "$BackupDir\backup.log"
$KeepDays    = 30

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

function Log {
    param([string]$Msg, [string]$Level = "INFO")
    $ts = Get-Date -Format "yyyy-MM-dd HH:mm:ss"
    $line = "[$ts] [$Level] $Msg"
    Write-Host $line
    Add-Content -Path $LogFile -Value $line -Encoding UTF8
}

# Find pg_dump dynamically across any installed PostgreSQL version
$pgBin = $null
if (Test-Path "C:\Program Files\PostgreSQL") {
    $pgDirs = Get-ChildItem "C:\Program Files\PostgreSQL" -Directory -ErrorAction SilentlyContinue | Sort-Object Name -Descending
    foreach ($d in $pgDirs) {
        if (Test-Path "$($d.FullName)\bin\pg_dump.exe") {
            $pgBin = "$($d.FullName)\bin"
            break
        }
    }
}
if (-not $pgBin) {
    Log "pg_dump not found. Is PostgreSQL installed?" "ERROR"
    exit 1
}
$env:PATH = "$pgBin;$env:PATH"
$env:PGPASSWORD = $DbPassword

New-Item -ItemType Directory -Force $BackupDir | Out-Null

$timestamp  = Get-Date -Format "yyyy-MM-dd_HH-mm"
$backupName = "gebeyaos_${DbName}_${timestamp}"
$backupFile = "$BackupDir\${backupName}.dump"
$photoDir   = "$InstallDir\uploads"
$photoZip   = "$BackupDir\${backupName}_photos.zip"

Log "Starting backup: $backupName"

try {
    Log "Dumping database '$DbName'..."
    & pg_dump -h $DbHost -U $DbUser --enable-row-security -F c -f $backupFile $DbName
    if ($LASTEXITCODE -ne 0) { throw "pg_dump exited with code $LASTEXITCODE" }
    $sizeMB = [math]::Round((Get-Item $backupFile).Length / 1MB, 2)
    Log "Database dump complete: ${sizeMB} MB"
} catch {
    Log "Database dump FAILED: $_" "ERROR"
    Remove-Item Env:PGPASSWORD -ErrorAction SilentlyContinue
    exit 1
}

try {
    Log "Verifying dump integrity..."
    $verifyOut = & pg_restore --list $backupFile 2>&1
    if ($LASTEXITCODE -ne 0) { throw "pg_restore --list failed: $verifyOut" }
    Log "Dump integrity verified OK"
} catch {
    Log "Dump verification FAILED: $_" "ERROR"
    Remove-Item $backupFile -Force
    Remove-Item Env:PGPASSWORD -ErrorAction SilentlyContinue
    exit 1
}

if ((Test-Path $photoDir) -and @(Get-ChildItem $photoDir -Recurse -File -ErrorAction SilentlyContinue).Count -gt 0) {
    try {
        Log "Zipping uploads folder..."
        Compress-Archive -Path $photoDir -DestinationPath $photoZip -Force
        $photoMB = [math]::Round((Get-Item $photoZip).Length / 1MB, 2)
        Log "Photos backup complete: ${photoMB} MB"
    } catch {
        Log "Photos backup warning (non-fatal): $_" "WARN"
    }
}

Remove-Item Env:PGPASSWORD -ErrorAction SilentlyContinue

Log "Pruning backups older than $KeepDays days..."
$cutoff = (Get-Date).AddDays(-$KeepDays)
$pruned = 0
Get-ChildItem $BackupDir -File | Where-Object { $_.LastWriteTime -lt $cutoff } | ForEach-Object {
    Remove-Item $_.FullName -Force
    $pruned++
}
Log "Pruned $pruned old backup file(s)"

$totalBackups = (Get-ChildItem $BackupDir -Filter "*.dump").Count
Log "Backup SUCCEEDED. Total backups kept: $totalBackups. File: $backupFile"
Write-Host ""
Write-Host "  ✓ Backup complete: $backupFile" -ForegroundColor Green
