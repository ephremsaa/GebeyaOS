<#
.SYNOPSIS
    GebeyaOS – Production Release Packager (Windows)
    Builds the production release zip bundle for offline supermarket shop deployment.

.DESCRIPTION
    Compiles TypeScript across all packages and apps, installs production dependencies,
    collects migrations and installer scripts, generates SHA256 checksum, and produces
    gebeyaos-branch-release-<version>.zip.

.PARAMETER Version
    Version string for the bundle (e.g. 1.0.0). Defaults to package.json version.
#>

param(
    [string]$Version = ""
)

Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'

$RepoRoot = Resolve-Path "$PSScriptRoot\..\.."
Set-Location $RepoRoot

if (-not $Version) {
    $pkgJson = Get-Content "package.json" | ConvertFrom-Json
    if ($pkgJson.version) { $Version = $pkgJson.version } else { $Version = "1.0.0" }
}

$DistDir = "$RepoRoot\dist-release"
$BundleName = "gebeyaos-branch-v$Version"
$BundleDir = "$DistDir\$BundleName"
$ZipFile = "$DistDir\$BundleName.zip"
$ChecksumFile = "$DistDir\$BundleName.sha256"

Write-Host "==========================================================" -ForegroundColor Cyan
Write-Host "  Packaging GebeyaOS Branch Release v$Version" -ForegroundColor Cyan
Write-Host "==========================================================" -ForegroundColor Cyan

# 1. Clean previous build artifact
if (Test-Path $DistDir) { Remove-Item $DistDir -Recurse -Force }
New-Item -ItemType Directory -Force $BundleDir | Out-Null

# 2. Build monorepo
Write-Host "▶ Building TypeScript packages..." -ForegroundColor Yellow
npm run build --workspaces

# 3. Assemble package structure
Write-Host "▶ Assembling release bundle..." -ForegroundColor Yellow

# Copy apps/branch-server
$targetBranch = "$BundleDir\apps\branch-server"
New-Item -ItemType Directory -Force "$targetBranch\dist" | Out-Null
Copy-Item "apps\branch-server\dist" "$targetBranch\dist" -Recurse -Force
Copy-Item "apps\branch-server\package.json" "$targetBranch\package.json"
Copy-Item "apps\branch-server\.env.example" "$targetBranch\.env.example"

# Copy apps/pos-web (build static frontend)
Write-Host "▶ Building POS frontend..." -ForegroundColor Yellow
Set-Location "$RepoRoot\apps\pos-web"
npm run build
Set-Location $RepoRoot

$targetWeb = "$BundleDir\apps\pos-web"
New-Item -ItemType Directory -Force "$targetWeb\dist" | Out-Null
Copy-Item "apps\pos-web\dist" "$targetWeb\dist" -Recurse -Force
Copy-Item "apps\pos-web\package.json" "$targetWeb\package.json"

# Copy packages
$targetPackages = "$BundleDir\packages"
New-Item -ItemType Directory -Force "$targetPackages\shared-types\dist" | Out-Null
Copy-Item "packages\shared-types\dist" "$targetPackages\shared-types\dist" -Recurse -Force
Copy-Item "packages\shared-types\package.json" "$targetPackages\shared-types\package.json"

New-Item -ItemType Directory -Force "$targetPackages\sync-protocol\dist" | Out-Null
Copy-Item "packages\sync-protocol\dist" "$targetPackages\sync-protocol\dist" -Recurse -Force
Copy-Item "packages\sync-protocol\package.json" "$targetPackages\sync-protocol\package.json"

# Copy migrations and reference seeds
New-Item -ItemType Directory -Force "$BundleDir\database\migrations" | Out-Null
Copy-Item "database\migrations\*" "$BundleDir\database\migrations\" -Force

# Copy Windows scripts
New-Item -ItemType Directory -Force "$BundleDir\scripts\windows" | Out-Null
Copy-Item "scripts\windows\*" "$BundleDir\scripts\windows\" -Force

# Copy deployment guides
New-Item -ItemType Directory -Force "$BundleDir\docs\deploy" | Out-Null
if (Test-Path "docs\deploy") {
    Copy-Item "docs\deploy\*" "$BundleDir\docs\deploy\" -Force
}

# 4. Include production dependencies inside the bundle
Write-Host "▶ Bundling production dependencies..." -ForegroundColor Yellow
Copy-Item "$RepoRoot\package.json" "$BundleDir\package.json"
if (Test-Path "$RepoRoot\package-lock.json") { Copy-Item "$RepoRoot\package-lock.json" "$BundleDir\package-lock.json" }
Copy-Item "$RepoRoot\node_modules" "$BundleDir\node_modules" -Recurse -Force

# 5. Compress to ZIP
Write-Host "▶ Compressing bundle to $ZipFile..." -ForegroundColor Yellow
Compress-Archive -Path "$BundleDir\*" -DestinationPath $ZipFile -CompressionLevel Optimal

# 6. Generate SHA256 checksum
$hash = (Get-FileHash -Path $ZipFile -Algorithm SHA256).Hash
Set-Content -Path $ChecksumFile -Value "$hash  $BundleName.zip"

Write-Host ""
Write-Host "✓ Release packaging successful!" -ForegroundColor Green
Write-Host "   Bundle:   $ZipFile"
Write-Host "   Checksum: $hash"
Write-Host "==========================================================" -ForegroundColor Cyan
