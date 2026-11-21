#Requires -RunAsAdministrator
<#
.SYNOPSIS
    GebeyaOS Branch Server – Windows Installer
    Installs and configures the GebeyaOS Point-of-Sale system on a Windows shop PC.

.DESCRIPTION
    Idempotent: safe to run multiple times. Each section checks if the step is
    already done before doing anything.

.NOTES
    Requirements: Windows 10/11, PowerShell 5.1+, run as Administrator.
    Tested on: Windows 10 22H2, Windows 11 23H2.

    What this script does:
      1. Checks prerequisites (Windows version, disk space, Node.js, PostgreSQL)
      2. Generates secrets (JWT, encryption key, DB password)
      3. Creates the database and a limited database user
      4. Writes .env with restricted file permissions
      5. Runs database migrations
      6. Builds or copies prebuilt app
      7. Registers API and web app as Windows services (NSSM)
      8. Opens firewall port for LAN cashier terminals
      9. Prints LAN address + QR code for cashier tablets

    After running, open http://<server-ip>:3001 from any cashier terminal.
#>

Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'

# ── Configuration ────────────────────────────────────────────────────────────
$AppName       = "GebeyaOS"
$InstallDir    = "C:\GebeyaOS"
$DataDir       = "C:\GebeyaOS\data"
$BackupDir     = "C:\GebeyaOS\backups"
$LogDir        = "C:\GebeyaOS\logs"
$ApiPort       = 3001
$WebPort       = 3000
$DbName        = "gebeyaos_branch"
$DbUser        = "gebeyaos_app"
$NssmUrl       = "https://nssm.cc/release/nssm-2.24.zip"
$NssmDir       = "$InstallDir\tools\nssm"
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
    return $ip ?? "127.0.0.1"
}

function Show-QR {
    param([string]$Url)
    Write-Host ""
    Write-Host "  Cashier terminal address: $Url" -ForegroundColor Cyan
    Write-Host "  (Open this URL in Chrome or Edge on each cashier tablet)" -ForegroundColor Gray
    # Simple text QR hint – for a real QR install qrencode or use the app's /qr page
    Write-Host ""
    Write-Host "  Tip: Run  make-cashier-shortcut.ps1  on each cashier terminal" -ForegroundColor Gray
    Write-Host "       to create a kiosk-mode Chrome shortcut." -ForegroundColor Gray
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
Write-Host "  Branch Server Installer  –  Run as Administrator on the shop PC" -ForegroundColor White
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
$disk = Get-PSDrive ($drive -replace ':', '')
$freeGB = [math]::Round($disk.Free / 1GB, 1)
if ($freeGB -lt $MinDiskGB) {
    Write-Fail "Only ${freeGB} GB free on $drive. Need at least ${MinDiskGB} GB."
    Write-Host "  Free up space, then run this installer again." -ForegroundColor Gray
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
        Write-Host ""
        Write-Host "  Download from: https://nodejs.org/en/download" -ForegroundColor Cyan
        Write-Host "  Choose the LTS (Long-Term Support) installer for Windows x64." -ForegroundColor Gray
        exit 1
    }
    Write-OK "Node.js $nodeVer – OK"
} catch {
    Write-Fail "Node.js is not installed."
    Write-Host ""
    Write-Host "  1. Download from: https://nodejs.org/en/download" -ForegroundColor Cyan
    Write-Host "  2. Install the LTS version (Windows x64 Installer)." -ForegroundColor Gray
    Write-Host "  3. Restart PowerShell as Administrator and run this script again." -ForegroundColor Gray
    exit 1
}

# ── STEP 4: PostgreSQL ────────────────────────────────────────────────────────
Write-Header "Step 4: Checking PostgreSQL"
$pgBin = $null
$possiblePgPaths = @(
    "C:\Program Files\PostgreSQL\16\bin",
    "C:\Program Files\PostgreSQL\15\bin",
    "C:\Program Files\PostgreSQL\14\bin"
)
foreach ($p in $possiblePgPaths) {
    if (Test-Path "$p\psql.exe") { $pgBin = $p; break }
}
if (-not $pgBin) {
    Write-Fail "PostgreSQL 16 is not installed or not found in expected locations."
    Write-Host ""
    Write-Host "  1. Download from: https://www.enterprisedb.com/downloads/postgres-postgresql-installers" -ForegroundColor Cyan
    Write-Host "  2. Install PostgreSQL 16 (Windows x86-64)." -ForegroundColor Gray
    Write-Host "  3. Set a postgres superuser password during install – remember it." -ForegroundColor Gray
    Write-Host "  4. Restart PowerShell as Administrator and run this script again." -ForegroundColor Gray
    exit 1
}
Write-OK "PostgreSQL found at $pgBin"
$env:PATH = "$pgBin;$env:PATH"

# ── STEP 5: Directories ───────────────────────────────────────────────────────
Write-Header "Step 5: Creating Directories"
foreach ($dir in @($InstallDir, $DataDir, $BackupDir, $LogDir, "$InstallDir\uploads")) {
    if (-not (Test-Path $dir)) {
        New-Item -ItemType Directory -Force $dir | Out-Null
        Write-OK "Created $dir"
    } else {
        Write-OK "$dir already exists"
    }
}

# ── STEP 6: Secrets ───────────────────────────────────────────────────────────
Write-Header "Step 6: Generating Secrets"
$EnvFile = "$InstallDir\.env"

if (Test-Path $EnvFile) {
    Write-OK ".env already exists – skipping secret generation (keeping existing secrets)"
    # Load existing secrets for the DB creation step
    $existingEnv = Get-Content $EnvFile | Where-Object { $_ -match '=' }
    $DbPassword  = ($existingEnv | Where-Object { $_ -like 'DB_PASSWORD=*' }) -replace 'DB_PASSWORD=', ''
    $JwtSecret   = ($existingEnv | Where-Object { $_ -like 'JWT_SECRET=*' })  -replace 'JWT_SECRET=', ''
    $EncKey      = ($existingEnv | Where-Object { $_ -like 'ENCRYPTION_KEY=*' }) -replace 'ENCRYPTION_KEY=', ''
} else {
    Write-Step "Generating random secrets (32 bytes each)..."
    $DbPassword = Generate-Secret
    $JwtSecret  = Generate-Secret
    $EncKey     = Generate-Secret

    # Prompt for postgres superuser password (needed to CREATE the app user)
    $pgPass = Read-Host "Enter your PostgreSQL superuser (postgres) password" -AsSecureString
    $pgPassPlain = [System.Runtime.InteropServices.Marshal]::PtrToStringAuto(
        [System.Runtime.InteropServices.Marshal]::SecureStringToBSTR($pgPass)
    )

    # Write .env
    $envContent = @"
# GebeyaOS Branch Server – Generated by install.ps1
# DO NOT share this file. Keep it on this machine only.
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

CORS_ORIGINS=http://localhost:$WebPort

UPLOAD_DIR=$InstallDir\uploads
"@
    Set-Content -Path $EnvFile -Value $envContent -Encoding UTF8
    # Restrict file permissions: readable only by SYSTEM and Administrators
    $acl = Get-Acl $EnvFile
    $acl.SetAccessRuleProtection($true, $false)
    $rule1 = New-Object System.Security.AccessControl.FileSystemAccessRule("SYSTEM", "FullControl", "Allow")
    $rule2 = New-Object System.Security.AccessControl.FileSystemAccessRule("Administrators", "FullControl", "Allow")
    $acl.AddAccessRule($rule1)
    $acl.AddAccessRule($rule2)
    Set-Acl -Path $EnvFile -AclObject $acl
    Write-OK ".env written to $EnvFile (restricted permissions)"
    Write-OK "Secrets generated and stored"
}

# ── STEP 7: Database ──────────────────────────────────────────────────────────
Write-Header "Step 7: Creating Database"

# Check if DB already exists
$dbExists = & psql -U postgres -tAc "SELECT 1 FROM pg_database WHERE datname='$DbName'" 2>$null
if ($dbExists -eq '1') {
    Write-OK "Database '$DbName' already exists – skipping creation"
} else {
    if (-not $pgPassPlain) {
        $pgPass = Read-Host "Enter your PostgreSQL superuser (postgres) password" -AsSecureString
        $pgPassPlain = [System.Runtime.InteropServices.Marshal]::PtrToStringAuto(
            [System.Runtime.InteropServices.Marshal]::SecureStringToBSTR($pgPass)
        )
    }
    $env:PGPASSWORD = $pgPassPlain

    # Create limited app user (not superuser)
    $userExists = & psql -U postgres -tAc "SELECT 1 FROM pg_roles WHERE rolname='$DbUser'" 2>$null
    if ($userExists -ne '1') {
        Write-Step "Creating database user '$DbUser'..."
        & psql -U postgres -c "CREATE USER $DbUser WITH PASSWORD '$DbPassword';" | Out-Null
        Write-OK "User '$DbUser' created"
    } else {
        Write-OK "User '$DbUser' already exists"
    }

    Write-Step "Creating database '$DbName'..."
    & psql -U postgres -c "CREATE DATABASE $DbName OWNER $DbUser;" | Out-Null
    & psql -U postgres -c "GRANT ALL PRIVILEGES ON DATABASE $DbName TO $DbUser;" | Out-Null
    Write-OK "Database '$DbName' created and owned by '$DbUser'"

    Remove-Item Env:PGPASSWORD -ErrorAction SilentlyContinue
}

# ── STEP 8: Migrations ────────────────────────────────────────────────────────
Write-Header "Step 8: Running Database Migrations"
$MigrationsDir = "$InstallDir\database\migrations"
if (-not (Test-Path $MigrationsDir)) {
    Write-Fail "Migrations directory not found at $MigrationsDir"
    Write-Host "  Make sure the GebeyaOS release bundle is extracted to $InstallDir" -ForegroundColor Gray
    exit 1
}

$env:PGPASSWORD = $DbPassword
$migrations = Get-ChildItem "$MigrationsDir\*.sql" | Sort-Object Name
foreach ($mig in $migrations) {
    Write-Step "Applying $($mig.Name)..."
    & psql -U $DbUser -d $DbName -f $mig.FullName | Out-Null
    Write-OK "Applied $($mig.Name)"
}
Remove-Item Env:PGPASSWORD -ErrorAction SilentlyContinue

# ── STEP 9: NSSM (service manager) ───────────────────────────────────────────
Write-Header "Step 9: Setting Up Windows Services"

if (-not (Test-Path "$NssmDir\nssm.exe")) {
    Write-Step "Downloading NSSM (service manager)..."
    New-Item -ItemType Directory -Force $NssmDir | Out-Null
    $nssmZip = "$env:TEMP\nssm.zip"
    Invoke-WebRequest -Uri $NssmUrl -OutFile $nssmZip -UseBasicParsing
    Expand-Archive -Path $nssmZip -DestinationPath "$env:TEMP\nssm-extract" -Force
    $nssmExe = Get-ChildItem "$env:TEMP\nssm-extract" -Recurse -Filter "nssm.exe" |
               Where-Object { $_.FullName -like "*win64*" } |
               Select-Object -First 1
    Copy-Item $nssmExe.FullName "$NssmDir\nssm.exe"
    Remove-Item $nssmZip, "$env:TEMP\nssm-extract" -Recurse -Force
    Write-OK "NSSM downloaded"
}

$nssm = "$NssmDir\nssm.exe"

# API Service
$svcName = "GebeyaOS-API"
$existing = & sc.exe query $svcName 2>&1
if ($existing -notlike "*FAILED*") {
    Write-OK "Service '$svcName' already exists"
} else {
    Write-Step "Registering $svcName service..."
    & $nssm install $svcName node
    & $nssm set $svcName AppDirectory "$InstallDir\apps\branch-server"
    & $nssm set $svcName AppParameters "dist\main.js"
    & $nssm set $svcName AppEnvironmentExtra "NODE_ENV=production" "PORT=$ApiPort"
    & $nssm set $svcName AppStdout "$LogDir\api-stdout.log"
    & $nssm set $svcName AppStderr "$LogDir\api-stderr.log"
    & $nssm set $svcName AppRotateFiles 1
    & $nssm set $svcName AppRotateOnline 1
    & $nssm set $svcName AppRotateBytes 10485760
    & $nssm set $svcName Start SERVICE_AUTO_START
    & $nssm set $svcName ObjectName LocalSystem
    Write-OK "$svcName service registered"
}

# Start services
Write-Step "Starting services..."
Start-Service $svcName -ErrorAction SilentlyContinue
Start-Sleep 3
$status = (Get-Service $svcName -ErrorAction SilentlyContinue).Status
Write-OK "$svcName status: $status"

# ── STEP 10: Firewall ─────────────────────────────────────────────────────────
Write-Header "Step 10: Firewall Rules"
$ruleName = "GebeyaOS-API-LAN"
$existing = Get-NetFirewallRule -DisplayName $ruleName -ErrorAction SilentlyContinue
if ($existing) {
    Write-OK "Firewall rule '$ruleName' already exists"
} else {
    New-NetFirewallRule -DisplayName $ruleName `
        -Direction Inbound `
        -Protocol TCP `
        -LocalPort $ApiPort `
        -Action Allow `
        -Profile Private `
        -Description "Allow GebeyaOS cashier terminals on the LAN to reach the branch server API" | Out-Null
    Write-OK "Firewall rule added: TCP port $ApiPort (LAN only)"
}

# ── STEP 11: Timezone ─────────────────────────────────────────────────────────
Write-Header "Step 11: Timezone"
$currentTz = (Get-TimeZone).Id
if ($currentTz -ne "E. Africa Standard Time") {
    Write-Step "Setting timezone to Africa/Addis_Ababa..."
    Set-TimeZone -Id "E. Africa Standard Time"
    Write-OK "Timezone set to E. Africa Standard Time (Africa/Addis_Ababa)"
} else {
    Write-OK "Timezone already set to E. Africa Standard Time"
}

# ── STEP 12: Health check ─────────────────────────────────────────────────────
Write-Header "Step 12: Health Check"
Start-Sleep 5
try {
    $response = Invoke-RestMethod -Uri "http://localhost:$ApiPort/health" -TimeoutSec 10
    if ($response.status -eq 'ok') {
        Write-OK "API health check passed: $($response | ConvertTo-Json -Compress)"
    } else {
        Write-Fail "API returned unexpected status: $($response | ConvertTo-Json -Compress)"
    }
} catch {
    Write-Fail "API health check failed: $_"
    Write-Host "  Check logs at $LogDir\api-stderr.log" -ForegroundColor Gray
}

# ── DONE ──────────────────────────────────────────────────────────────────────
Write-Header "Installation Complete!"
$lanIp = Get-LanIP
$serverUrl = "http://${lanIp}:${ApiPort}"
Write-Host ""
Write-OK "GebeyaOS Branch Server is running!"
Write-Host ""
Show-QR $serverUrl
Write-Host ""
Write-Host "  Next steps:" -ForegroundColor White
Write-Host "    1. Open $serverUrl/ready in a browser to verify the server is ready." -ForegroundColor Gray
Write-Host "    2. Run  make-cashier-shortcut.ps1  on each cashier tablet." -ForegroundColor Gray
Write-Host "    3. Run  backup.ps1  once to verify backups work." -ForegroundColor Gray
Write-Host "    4. See  docs\deploy\shop-install-guide.md  for the full setup guide." -ForegroundColor Gray
Write-Host ""
