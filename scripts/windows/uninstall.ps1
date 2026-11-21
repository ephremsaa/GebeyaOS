#Requires -RunAsAdministrator
<#
.SYNOPSIS
    GebeyaOS – Uninstall Script (Windows)
    Removes the GebeyaOS Windows services and optionally deletes data.

.DESCRIPTION
    By default, keeps the database and all data.
    Asks before deleting anything permanent.
#>

Set-StrictMode -Version Latest
$ErrorActionPreference = 'SilentlyContinue'

$InstallDir = "C:\GebeyaOS"
$NssmDir    = "$InstallDir\tools\nssm"
$nssm       = "$NssmDir\nssm.exe"

Write-Host ""
Write-Host "══════════════════════════════════════════════════════" -ForegroundColor Yellow
Write-Host "  GebeyaOS Uninstall" -ForegroundColor Yellow
Write-Host "══════════════════════════════════════════════════════" -ForegroundColor Yellow
Write-Host ""
Write-Host "  This will stop and remove the GebeyaOS Windows services." -ForegroundColor White
Write-Host "  Your database and backups will be KEPT by default." -ForegroundColor White
Write-Host ""

$confirm = Read-Host "Type YES to continue"
if ($confirm -ne "YES") { Write-Host "Cancelled."; exit 0 }

# Stop and remove services
foreach ($svc in @("GebeyaOS-API")) {
    Write-Host "  Stopping $svc..."
    Stop-Service $svc -Force -ErrorAction SilentlyContinue
    if (Test-Path $nssm) {
        & $nssm remove $svc confirm
    } else {
        & sc.exe delete $svc
    }
    Write-Host "  ✓ $svc removed"
}

# Remove firewall rule
Remove-NetFirewallRule -DisplayName "GebeyaOS-API-LAN" -ErrorAction SilentlyContinue
Write-Host "  ✓ Firewall rule removed"

# Ask about data
Write-Host ""
$deleteData = Read-Host "Delete all GebeyaOS data (database + files)? Type DELETE-ALL-DATA to confirm (or press Enter to keep data)"
if ($deleteData -eq "DELETE-ALL-DATA") {
    Write-Host "  Deleting $InstallDir..." -ForegroundColor Red
    Remove-Item $InstallDir -Recurse -Force -ErrorAction SilentlyContinue
    # Drop database
    & psql -U postgres -c "DROP DATABASE IF EXISTS gebeyaos_branch;" 2>$null
    & psql -U postgres -c "DROP USER IF EXISTS gebeyaos_app;" 2>$null
    Write-Host "  ✓ All data deleted" -ForegroundColor Red
} else {
    Write-Host "  ✓ Data kept at $InstallDir" -ForegroundColor Green
    Write-Host "    Your backups are at $InstallDir\backups" -ForegroundColor Gray
}

Write-Host ""
Write-Host "  ✓ GebeyaOS uninstalled." -ForegroundColor Green
