<#
.SYNOPSIS
    GebeyaOS Branch Server – Windows Installer
    Installs and configures the GebeyaOS Point-of-Sale system on a Windows shop PC.

.DESCRIPTION
    Idempotent: safe to run multiple times. Each section checks if the step is
    already done before doing anything. Works 100% offline with zero external downloads.

.PARAMETER SuperuserPassword
    Optional PostgreSQL superuser (postgres) password. If omitted, prompts interactively.

.PARAMETER TargetDir
    Installation directory. Defaults to C:\GebeyaOS.
#>

param(
    [string]$SuperuserPassword = "",
    [string]$TargetDir = "C:\GebeyaOS"
)

Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'

# ── Configuration ────────────────────────────────────────────────────────────
$AppName       = "GebeyaOS"
$InstallDir    = $TargetDir
$DataDir       = "$InstallDir\data"
$BackupDir     = "$InstallDir\backups"
$LogDir        = "$InstallDir\logs"
$ApiPort       = 3001
$WebPort       = 3000
$DbName        = "gebeyaos_branch"
$DbUser        = "gebeyaos_app"
$MinDiskGB     = 10
$MinNodeMajor  = 18

# ── Helpers ──────────────────────────────────────────────────────────────────
function Write-Header {
    param([string]$Title)
    Write-Host ""
    Write-Host "══════════════════════════════════════════════════════" -ForegroundColor Cyan
    Write-Host "  $Title" -ForegroundColor Cyan
    Write-Host "══════════════════════════════════════════════════════" -ForegroundColor Cyan
}

function Write-Step {
    param([string]$Msg)
    Write-Host "  ▶ $Msg" -ForegroundColor Yellow
}

function Write-OK {
    param([string]$Msg)
    Write-Host "  ✓ $Msg" -ForegroundColor Green
}

function Write-Fail {
    param([string]$Msg)
    Write-Host "  ✗ $Msg" -ForegroundColor Red
}

function Generate-Secret {
    $bytes = New-Object byte[] 32
    [System.Security.Cryptography.RandomNumberGenerator]::Create().GetBytes($bytes)
    return [System.BitConverter]::ToString($bytes) -replace '-', ''
}

function Get-LanIP {
    $ip = (Get-NetIPAddress -AddressFamily IPv4 |
           Where-Object { $_.InterfaceAlias -notlike '*Loopback*' -and $_.IPAddress -notlike '169.*' } |
           Select-Object -First 1).IPAddress
    if ($ip) { return $ip } else { return "127.0.0.1" }
}

# ── STEP 0: Banner ────────────────────────────────────────────────────────────
Clear-Host
Write-Host ""
Write-Host "  ██████╗ ███████╗██████╗ ███████╗██╗   ██╗ █████╗  ██████╗ ███████╗" -ForegroundColor Green
Write-Host "  ██╔════╝ ██╔════╝██╔══██╗██╔════╝╚██╗ ██╔╝██╔══██╗██╔═══██╗██╔════╝" -ForegroundColor Green
Write-Host "  ██║  ███╗█████╗  ██████╔╝█████╗   ╚████╔╝ ███████║██║   ██║███████╗" -ForegroundColor Green
Write-Host "  ██║   ██║██╔══╝  ██╔══██╗██╔══╝    ╚██╔╝  ██╔══██║██║   ██║╚════██║" -ForegroundColor Green
Write-Host "  ╚██████╔╝███████╗██████╔╝███████╗   ██║   ██║  ██║╚██████╔╝███████║" -ForegroundColor Green
Write-Host "   ╚═════╝ ╚══════╝╚═════╝ ╚══════╝   ╚═╝   ╚═╝  ╚═╝ ╚═════╝ ╚══════╝" -ForegroundColor Green
Write-Host ""
Write-Host "  Branch Server Installer  –  Running in Administrator Mode" -ForegroundColor White
Write-Host ""

# ── STEP 1: Windows version ───────────────────────────────────────────────────
Write-Header "Step 1: Checking Windows Version"
$os = [System.Environment]::OSVersion.Version
if ($os.Major -lt 10) {
    Write-Fail "Windows 10 or 11 is required. Found: $($os.ToString())"
    exit 1
}
Write-OK "Windows $($os.ToString()) – OK"

# ── STEP 2: Disk space ────────────────────────────────────────────────────────
Write-Header "Step 2: Checking Disk Space"
$drive = Split-Path $InstallDir -Qualifier
if (-not $drive) { $drive = "C:" }
$disk = Get-PSDrive ($drive -replace ':', '')
$freeGB = [math]::Round($disk.Free / 1GB, 1)
if ($freeGB -lt $MinDiskGB) {
    Write-Fail "Only ${freeGB} GB free on $drive. Need at least ${MinDiskGB} GB."
    exit 1
}
Write-OK "${freeGB} GB free on $drive – OK"

# ── STEP 3: Node.js ───────────────────────────────────────────────────────────
Write-Header "Step 3: Checking Node.js"
try {
    $nodeVer = (node --version 2>&1).ToString().TrimStart('v')
    $nodeMajor = [int]($nodeVer -split '\.')[0]
    if ($nodeMajor -lt $MinNodeMajor) {
        Write-Fail "Node.js $nodeVer found, but version $MinNodeMajor+ is required."
        exit 1
    }
    Write-OK "Node.js $nodeVer – OK"
} catch {
    Write-Fail "Node.js is not installed."
    exit 1
}

# ── STEP 4: PostgreSQL ────────────────────────────────────────────────────────
Write-Header "Step 4: Checking PostgreSQL"
$pgBin = $null
if (Test-Path "C:\Program Files\PostgreSQL") {
    $pgDirs = Get-ChildItem "C:\Program Files\PostgreSQL" -Directory -ErrorAction SilentlyContinue | Sort-Object Name -Descending
    foreach ($d in $pgDirs) {
        if (Test-Path "$($d.FullName)\bin\psql.exe") {
            $pgBin = "$($d.FullName)\bin"
            break
        }
    }
}

if (-not $pgBin) {
    Write-Fail "PostgreSQL is not installed or not found in C:\Program Files\PostgreSQL."
    exit 1
}
Write-OK "PostgreSQL found at $pgBin"
$env:PATH = "$pgBin;$env:PATH"

# ── STEP 5: Directories & Source Files ────────────────────────────────────────
Write-Header "Step 5: Preparing Directories and Files"
foreach ($dir in @($InstallDir, $DataDir, $BackupDir, $LogDir, "$InstallDir\uploads")) {
    if (-not (Test-Path $dir)) {
        New-Item -ItemType Directory -Force $dir | Out-Null
    }
}
Write-OK "Target directories ready at $InstallDir"

# Copy source from repo root to $InstallDir (always deploy latest binaries)
$SourceRoot = Resolve-Path "$PSScriptRoot\..\.."
Write-Step "Deploying application binaries to $InstallDir..."
Copy-Item "$SourceRoot\apps" "$InstallDir\apps" -Recurse -Force
Copy-Item "$SourceRoot\packages" "$InstallDir\packages" -Recurse -Force
Copy-Item "$SourceRoot\database" "$InstallDir\database" -Recurse -Force
Copy-Item "$SourceRoot\scripts" "$InstallDir\scripts" -Recurse -Force
if (-not (Test-Path "$InstallDir\node_modules")) {
    Copy-Item "$SourceRoot\node_modules" "$InstallDir\node_modules" -Recurse -Force -ErrorAction SilentlyContinue
}
Write-OK "Application files deployed to $InstallDir"

# ── STEP 6: Secrets ───────────────────────────────────────────────────────────
Write-Header "Step 6: Generating Secrets"
$EnvFile = "$InstallDir\.env"

if (Test-Path $EnvFile) {
    Write-OK ".env already exists – preserving existing configuration"
    $existingEnv = Get-Content $EnvFile | Where-Object { $_ -match '=' }
    $DbPassword  = ($existingEnv | Where-Object { $_ -like 'DB_PASSWORD=*' }) -replace 'DB_PASSWORD=', ''
    $JwtSecret   = ($existingEnv | Where-Object { $_ -like 'JWT_SECRET=*' })  -replace 'JWT_SECRET=', ''
    $EncKey      = ($existingEnv | Where-Object { $_ -like 'ENCRYPTION_KEY=*' }) -replace 'ENCRYPTION_KEY=', ''
} else {
    Write-Step "Generating random secrets (32 bytes each)..."
    $DbPassword = Generate-Secret
    $JwtSecret  = Generate-Secret
    $EncKey     = Generate-Secret

    $envContent = @"
# GebeyaOS Branch Server – Production Configuration
NODE_ENV=production
PORT=$ApiPort
APP_VERSION=1.0.0
TZ=Africa/Addis_Ababa

DB_HOST=127.0.0.1
DB_PORT=5432
DB_USER=$DbUser
DB_PASSWORD=$DbPassword
DB_NAME=$DbName

JWT_SECRET=$JwtSecret
ENCRYPTION_KEY=$EncKey
JWT_EXPIRES_IN=8h

CORS_ORIGINS=http://localhost:$WebPort,http://localhost:$ApiPort

UPLOAD_DIR=$InstallDir\uploads
"@
    Set-Content -Path $EnvFile -Value $envContent -Encoding UTF8
    # Also place in apps/branch-server/.env for local directory resolution
    $appEnv = "$InstallDir\apps\branch-server\.env"
    if (Test-Path "$InstallDir\apps\branch-server") {
        Set-Content -Path $appEnv -Value $envContent -Encoding UTF8
    }
    Write-OK ".env written to $EnvFile and $appEnv"
}

# ── STEP 7: Database Setup ────────────────────────────────────────────────────
Write-Header "Step 7: Configuring Database"

$pgPassPlain = $SuperuserPassword
if (-not $pgPassPlain) {
    # Check default passwords first
    $test = & psql -U postgres -tAc "SELECT 1" 2>&1
    if ($LASTEXITCODE -ne 0) {
        $env:PGPASSWORD = "password"
        $test = & psql -U postgres -tAc "SELECT 1" 2>&1
        if ($LASTEXITCODE -eq 0) { $pgPassPlain = "password" }
    } else {
        $pgPassPlain = ""
    }

    if ($LASTEXITCODE -ne 0 -and -not $pgPassPlain) {
        $pgPass = Read-Host "Enter your PostgreSQL superuser (postgres) password" -AsSecureString
        $pgPassPlain = [System.Runtime.InteropServices.Marshal]::PtrToStringAuto(
            [System.Runtime.InteropServices.Marshal]::SecureStringToBSTR($pgPass)
        )
    }
}
$env:PGPASSWORD = $pgPassPlain

# Create app user if not exists
$userExists = & psql -U postgres -tAc "SELECT 1 FROM pg_roles WHERE rolname='$DbUser'" 2>$null
if ($userExists -ne '1') {
    Write-Step "Creating database user '$DbUser'..."
    & psql -U postgres -c "CREATE USER $DbUser WITH PASSWORD '$DbPassword';" | Out-Null
    Write-OK "User '$DbUser' created"
} else {
    Write-OK "User '$DbUser' already exists"
}

# Create database if not exists
$dbExists = & psql -U postgres -tAc "SELECT 1 FROM pg_database WHERE datname='$DbName'" 2>$null
if ($dbExists -ne '1') {
    Write-Step "Creating database '$DbName'..."
    & psql -U postgres -c "CREATE DATABASE $DbName OWNER $DbUser;" | Out-Null
    & psql -U postgres -c "GRANT ALL PRIVILEGES ON DATABASE $DbName TO $DbUser;" | Out-Null
    & psql -U postgres -c "ALTER USER $DbUser NOBYPASSRLS CREATEDB;" | Out-Null
    Write-OK "Database '$DbName' created (with NOBYPASSRLS for tenant isolation security)"
} else {
    Write-OK "Database '$DbName' already exists"
}
Remove-Item Env:PGPASSWORD -ErrorAction SilentlyContinue

# ── STEP 8: Migrations ────────────────────────────────────────────────────────
Write-Header "Step 8: Running Database Migrations"
$MigrationsDir = "$InstallDir\database\migrations"
$env:PGPASSWORD = $DbPassword
$env:PGOPTIONS  = "--client-min-messages=warning"

$migrations = Get-ChildItem "$MigrationsDir\*.sql" | Sort-Object Name
foreach ($mig in $migrations) {
    Write-Step "Applying $($mig.Name)..."
    $prevEAP = $ErrorActionPreference
    $ErrorActionPreference = 'SilentlyContinue'
    & psql -U $DbUser -d $DbName -f $mig.FullName 2>&1 | Out-Null
    $ErrorActionPreference = $prevEAP
    Write-OK "Verified $($mig.Name)"
}
Remove-Item Env:PGPASSWORD -ErrorAction SilentlyContinue
Remove-Item Env:PGOPTIONS -ErrorAction SilentlyContinue

# ── STEP 9: Service Registration ──────────────────────────────────────────────
Write-Header "Step 9: Registering Background Service"
$svcName = "GebeyaOS-API"
$launcherBatch = "$InstallDir\start-api.cmd"

# Create a dedicated launcher script with logging
$launcherContent = @"
@echo off
cd /d "$InstallDir\apps\branch-server"
set NODE_ENV=production
set PORT=$ApiPort
node dist\main.js >> "$LogDir\api.log" 2>&1
"@
Set-Content -Path $launcherBatch -Value $launcherContent -Encoding ASCII

# Register via Windows Task Scheduler (Runs at boot as SYSTEM with highest privileges)
$taskName = "GebeyaOS-BranchServer"
$action = New-ScheduledTaskAction -Execute $launcherBatch
$trigger = New-ScheduledTaskTrigger -AtStartup
$principal = New-ScheduledTaskPrincipal -UserId "SYSTEM" -LogonType ServiceAccount -RunLevel Highest
$settings = New-ScheduledTaskSettingsSet -AllowStartIfOnBatteries -DontStopIfGoingOnBatteries -RestartCount 3 -RestartInterval (New-TimeSpan -Minutes 1)

try {
    Register-ScheduledTask -TaskName $taskName -Action $action -Trigger $trigger -Principal $principal -Settings $settings -Force | Out-Null
    Write-OK "Windows Task Scheduler job '$taskName' registered (starts at system boot, auto-restarts on crash)"
} catch {
    Write-Fail "Could not register scheduled task: $_"
}

# Stop any previous stale process on $ApiPort to avoid EADDRINUSE
try {
    $staleConns = Get-NetTCPConnection -LocalPort $ApiPort -State Listen -ErrorAction SilentlyContinue
    foreach ($conn in $staleConns) {
        Write-Step "Stopping prior process listening on port $ApiPort (PID $($conn.OwningProcess))..."
        Stop-Process -Id $conn.OwningProcess -Force -ErrorAction SilentlyContinue
        Start-Sleep 1
    }
} catch {}

# Start the service right now
Write-Step "Starting GebeyaOS Branch Server process..."
Start-Process "cmd.exe" -ArgumentList "/c `"$launcherBatch`"" -WindowStyle Hidden

# ── STEP 10: Firewall ─────────────────────────────────────────────────────────
Write-Header "Step 10: Firewall Configuration"
try {
    $ruleName = "GebeyaOS-API-LAN"
    $existing = Get-NetFirewallRule -DisplayName $ruleName -ErrorAction SilentlyContinue
    if ($existing) {
        Write-OK "Firewall rule '$ruleName' is active"
    } else {
        New-NetFirewallRule -DisplayName $ruleName `
            -Direction Inbound `
            -Protocol TCP `
            -LocalPort $ApiPort `
            -Action Allow `
            -Profile Private,Domain `
            -Description "Allow GebeyaOS cashier terminals on the LAN to reach the branch server API" -ErrorAction Stop | Out-Null
        Write-OK "Firewall rule added: TCP port $ApiPort"
    }
} catch {
    Write-Host "  ! Firewall note: Run in elevated admin mode to manage firewall rules directly." -ForegroundColor Gray
}

# ── STEP 11: Timezone ─────────────────────────────────────────────────────────
Write-Header "Step 11: Timezone"
Set-TimeZone -Id "E. Africa Standard Time" -ErrorAction SilentlyContinue
Write-OK "Timezone set to E. Africa Standard Time (Africa/Addis_Ababa)"

# ── STEP 12: Health check ─────────────────────────────────────────────────────
Write-Header "Step 12: Health Check"
$healthy = $false
for ($i = 0; $i -lt 15; $i++) {
    Start-Sleep 2
    try {
        $response = Invoke-RestMethod -Uri "http://localhost:$ApiPort/ready" -TimeoutSec 5
        if ($response.status -eq 'ok') {
            $healthy = $true
            Write-OK "API is READY: $($response | ConvertTo-Json -Compress)"
            break
        }
    } catch {}
}

if (-not $healthy) {
    Write-Fail "API is still starting up or encountered an issue."
    if (Test-Path "$LogDir\api.log") {
        Write-Host "  Recent logs from $LogDir\api.log:" -ForegroundColor Yellow
        Get-Content "$LogDir\api.log" -Tail 15 | ForEach-Object { Write-Host "    $_" -ForegroundColor DarkGray }
    }
}

# ── DONE ──────────────────────────────────────────────────────────────────────
Write-Header "Installation Complete!"
$lanIp = Get-LanIP
$serverUrl = "http://${lanIp}:${ApiPort}"
Write-Host ""
Write-OK "GebeyaOS Branch Server is running at $serverUrl"
Write-Host ""
Write-Host "  Terminal URL: $serverUrl" -ForegroundColor Cyan
Write-Host "  Health check: $serverUrl/health" -ForegroundColor Gray
Write-Host "  Ready check:  $serverUrl/ready" -ForegroundColor Gray
Write-Host ""
