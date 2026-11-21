<#
.SYNOPSIS
    GebeyaOS – Cashier Terminal Shortcut Creator
    Creates a Chrome/Edge kiosk-mode shortcut for cashier tablets.

.DESCRIPTION
    Run this on each cashier terminal (Windows tablet/PC) to create a desktop
    shortcut that opens the POS in kiosk mode (full screen, no address bar,
    with kiosk-printing for receipts).

.PARAMETER ServerIP
    The LAN IP address of the shop PC running the branch server.
    Example: 192.168.1.100

.PARAMETER Port
    The web port (default 3000, or 3001 if serving from the API port).

.PARAMETER KioskMode
    If true (default), creates a full kiosk shortcut.
    If false, creates a regular window shortcut for managers.

.EXAMPLE
    .\make-cashier-shortcut.ps1 -ServerIP 192.168.1.100
    .\make-cashier-shortcut.ps1 -ServerIP 192.168.1.100 -KioskMode $false
#>

param(
    [Parameter(Mandatory)]
    [string]$ServerIP,
    [int]$Port = 3001,
    [bool]$KioskMode = $true
)

$Url = "http://${ServerIP}:${Port}"
$Desktop = [Environment]::GetFolderPath("Desktop")

# Find Chrome or Edge
$browsers = @(
    @{ Name="Google Chrome"; Exe="C:\Program Files\Google\Chrome\Application\chrome.exe" },
    @{ Name="Microsoft Edge"; Exe="C:\Program Files (x86)\Microsoft\Edge\Application\msedge.exe" },
    @{ Name="Microsoft Edge (x64)"; Exe="C:\Program Files\Microsoft\Edge\Application\msedge.exe" }
)

$browser = $null
foreach ($b in $browsers) {
    if (Test-Path $b.Exe) { $browser = $b; break }
}

if (-not $browser) {
    Write-Host "Neither Chrome nor Edge found. Install one first." -ForegroundColor Red
    exit 1
}

# Build arguments
if ($KioskMode) {
    $args = "--kiosk --kiosk-printing --no-first-run --disable-translate --disable-extensions --disable-pinch --overscroll-history-navigation=0 $Url"
    $shortcutName = "GebeyaOS – Cashier POS"
} else {
    $args = "--app=$Url --new-window --no-first-run"
    $shortcutName = "GebeyaOS – Manager Window"
}

# Create shortcut
$WshShell = New-Object -ComObject WScript.Shell
$shortcut = $WshShell.CreateShortcut("$Desktop\$shortcutName.lnk")
$shortcut.TargetPath = $browser.Exe
$shortcut.Arguments = $args
$shortcut.WorkingDirectory = Split-Path $browser.Exe
$shortcut.WindowStyle = 1
$shortcut.IconLocation = $browser.Exe
$shortcut.Save()

Write-Host ""
Write-Host "  ✓ Shortcut created on Desktop: '$shortcutName'" -ForegroundColor Green
Write-Host "    Browser: $($browser.Name)" -ForegroundColor Gray
Write-Host "    URL: $Url" -ForegroundColor Gray
if ($KioskMode) {
    Write-Host "    Mode: Kiosk (full screen, no browser UI, kiosk printing)" -ForegroundColor Gray
    Write-Host ""
    Write-Host "    To EXIT kiosk mode: Alt+F4 or Ctrl+Alt+Delete" -ForegroundColor Yellow
} else {
    Write-Host "    Mode: App window (for managers)" -ForegroundColor Gray
}
Write-Host ""
