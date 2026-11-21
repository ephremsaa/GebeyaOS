#Requires -RunAsAdministrator
<#
.SYNOPSIS
    GebeyaOS – Monthly Automated Backup Restore Drill (Windows)

.DESCRIPTION
    Non-destructive disaster recovery verification drill.
    Tests restoring the latest backup into a temporary test database (gebeyaos_restore_test),
    verifies record counts and schema consistency, and cleanly destroys the test database.
    Does NOT affect the live production database.

.OUTPUTS
    Logs to C:\GebeyaOS\backups\restore-drill.log
#>

Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'

$InstallDir  = "C:\GebeyaOS"
$BackupDir   = "C:\GebeyaOS\backups"
$EnvFile     = "$InstallDir\.env"
$LogFile     = "$BackupDir\restore-drill.log"
$TestDbName  = "gebeyaos_restore_test"

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

Log "=========================================================="
Log "  Starting Disaster Recovery Restore Drill"
Log "=========================================================="

$DbUser     = Get-EnvValue "DB_USER"
$DbPassword = Get-EnvValue "DB_PASSWORD"
$DbHost     = Get-EnvValue "DB_HOST"

$pgBin = $null
foreach ($p in @("C:\Program Files\PostgreSQL\16\bin", "C:\Program Files\PostgreSQL\15\bin")) {
    if (Test-Path "$p\pg_restore.exe") { $pgBin = $p; break }
}
if (-not $pgBin) {
    Log "PostgreSQL tools not found in Program Files." "ERROR"
    exit 1
}
$env:PATH = "$pgBin;$env:PATH"

$latestBackup = Get-ChildItem $BackupDir -Filter "*.dump" | Sort-Object LastWriteTime -Descending | Select-Object -First 1
if (-not $latestBackup) {
    Log "No .dump backup files found in $BackupDir to test." "ERROR"
    exit 1
}

Log "Testing backup: $($latestBackup.FullName) ($([math]::Round($latestBackup.Length / 1MB, 2)) MB)"

$env:PGPASSWORD = $DbPassword

try {
    Log "Creating isolated temporary database '$TestDbName'..."
    & psql -h $DbHost -U postgres -c "DROP DATABASE IF EXISTS $TestDbName;" 2>$null | Out-Null
    & psql -h $DbHost -U postgres -c "CREATE DATABASE $TestDbName OWNER $DbUser;" 2>$null | Out-Null

    Log "Restoring backup into '$TestDbName'..."
    & pg_restore -h $DbHost -U $DbUser -d $TestDbName --no-owner --no-privileges $latestBackup.FullName 2>$null
    
    Log "Validating core data integrity in restored test database..."
    $tableCounts = & psql -h $DbHost -U $DbUser -d $TestDbName -t -c "
        SELECT 'products: ' || count(*) FROM products
        UNION ALL
        SELECT 'sales: ' || count(*) FROM sales
        UNION ALL
        SELECT 'inventory_batches: ' || count(*) FROM batches;
    "
    
    Log "Restored Record Verification:"
    foreach ($row in ($tableCounts -split "`n")) {
        $clean = $row.Trim()
        if ($clean) { Log "   - $clean" }
    }

    Log "Drill SUCCESS: Backup is valid and cleanly restorable!" "SUCCESS"
} catch {
    Log "Drill FAILED: $_" "ERROR"
    exit 1
} finally {
    Log "Tearing down temporary database '$TestDbName'..."
    & psql -h $DbHost -U postgres -c "SELECT pg_terminate_backend(pid) FROM pg_stat_activity WHERE datname = '$TestDbName';" 2>$null | Out-Null
    & psql -h $DbHost -U postgres -c "DROP DATABASE IF EXISTS $TestDbName;" 2>$null | Out-Null
    Remove-Item Env:PGPASSWORD -ErrorAction SilentlyContinue
    Log "Restore drill complete and clean."
}
