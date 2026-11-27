<#
.SYNOPSIS
    GebeyaOS Zero-Config Launcher
    Automatically verifies PostgreSQL & Branch Server, runs first-time DB init if needed,
    waits for http://localhost:3001/ready, and opens GebeyaOS in a clean desktop app window.
#>

$ErrorActionPreference = 'SilentlyContinue'
$InstallDir = Split-Path -Parent (Split-Path -Parent $PSScriptRoot)
if (-not (Test-Path "$InstallDir\apps\branch-server\dist\main.js")) {
    $InstallDir = "C:\GebeyaOS"
}

$ApiPort = 3001
$AppUrl = "http://localhost:$ApiPort"

# 1. If not yet initialized (.env missing), run silent zero-config installer
if (-not (Test-Path "$InstallDir\.env")) {
    $InstallerScript = "$InstallDir\scripts\windows\install.ps1"
    if (Test-Path $InstallerScript) {
        Start-Process powershell.exe -ArgumentList "-ExecutionPolicy Bypass -File `"$InstallerScript`" -TargetDir `"$InstallDir`"" -Wait -Verb RunAs
    }
}

# 2. Check if Branch Server is already listening on port 3001; if not, start it hidden
$listening = Get-NetTCPConnection -LocalPort $ApiPort -State Listen -ErrorAction SilentlyContinue
if (-not $listening) {
    $launcherCmd = "$InstallDir\start-api.cmd"
    if (Test-Path $launcherCmd) {
        Start-Process "cmd.exe" -ArgumentList "/c `"$launcherCmd`"" -WindowStyle Hidden
    } else {
        Start-Process "node.exe" -ArgumentList "`"$InstallDir\apps\branch-server\dist\main.js`"" -WorkingDirectory "$InstallDir\apps\branch-server" -WindowStyle Hidden
    }
}

# 3. Wait up to 20s for /ready
for ($i = 0; $i -lt 20; $i++) {
    try {
        $res = Invoke-RestMethod -Uri "$AppUrl/ready" -TimeoutSec 2
        if ($res.status -eq 'ok') { break }
    } catch {}
    Start-Sleep 1
}

# 4. Open GebeyaOS in Chrome/Edge --app mode (clean desktop window, zero address bar clutter)
$chrome = "${env:ProgramFiles}\Google\Chrome\Application\chrome.exe"
$edge = "${env:ProgramFiles(x86)}\Microsoft\Edge\Application\msedge.exe"

if (Test-Path $chrome) {
    Start-Process $chrome "--app=$AppUrl --start-maximized"
} elseif (Test-Path $edge) {
    Start-Process $edge "--app=$AppUrl --start-maximized"
} else {
    Start-Process $AppUrl
}
