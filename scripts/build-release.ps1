# Builds a loadable Chrome extension zip for GitHub Releases (MV3, unpacked-style contents).
# Run from repo root: .\scripts\build-release.ps1
$ErrorActionPreference = 'Stop'
$root = Split-Path -Parent (Split-Path -Parent $MyInvocation.MyCommand.Path)
Set-Location $root

$manifestPath = Join-Path $root 'manifest.json'
if (-not (Test-Path $manifestPath)) {
  Write-Error "manifest.json not found at $manifestPath"
}
$ver = (Get-Content $manifestPath -Raw | ConvertFrom-Json).version
$dist = Join-Path $root 'dist'
if (-not (Test-Path $dist)) { New-Item -ItemType Directory -Path $dist | Out-Null }

$stamp = "autotest-recorder-build-$ver-$([Guid]::NewGuid().ToString('N').Substring(0, 8))"
$staging = Join-Path $env:TEMP $stamp
if (Test-Path $staging) { Remove-Item $staging -Recurse -Force }
New-Item -ItemType Directory -Path $staging | Out-Null

# Exclude dev / junk; mirror extension root into staging (Chrome Web Store–friendly: no CI, no build helpers)
$excludeDirs = @(
  '.git', '.github', '.cursor', 'node_modules', 'dist', 'temp_kr', 'temp_kr2', 'temp_kr_studio',
  'test-pages', 'scripts', 'CWS', 'browser-mcp', 'docs', 'tasks', 'release-notes'
)
$excludeRootFiles = @(
  '.gitignore', 'build-sw.sh', 'changes.md', 'versions.txt', 'CHANGELOG.md', 'CHANGELOG_EN.md', 'debug.log'
)
Get-ChildItem -Path $root -Force | ForEach-Object {
  $name = $_.Name
  if ($_.PSIsContainer -and ($excludeDirs -contains $name)) { return }
  if (-not $_.PSIsContainer -and ($excludeRootFiles -contains $name)) { return }
  Copy-Item -LiteralPath $_.FullName -Destination (Join-Path $staging $name) -Recurse -Force
}

$zipName = "autotest-recorder-$ver.zip"
$zipPath = Join-Path $dist $zipName
if (Test-Path $zipPath) { Remove-Item $zipPath -Force }

Compress-Archive -Path (Join-Path $staging '*') -DestinationPath $zipPath -Force
Remove-Item $staging -Recurse -Force

Write-Host "OK: $zipPath ($([math]::Round((Get-Item $zipPath).Length / 1MB, 2)) MB)"
