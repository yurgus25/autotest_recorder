# Локальный HTTP для test-pages (MCP Browser / ручная проверка).
# URL: http://127.0.0.1:9876/mcp-harness.html
$ErrorActionPreference = 'Stop'
$root = Split-Path -Parent (Split-Path -Parent $MyInvocation.MyCommand.Path)
$dir = Join-Path $root 'test-pages'
if (-not (Test-Path $dir)) { Write-Error "Not found: $dir" }
Set-Location $dir
$port = 9876
Write-Host "Serving $dir at http://127.0.0.1:$port/ (Ctrl+C to stop)"
Write-Host "Harness: http://127.0.0.1:$port/mcp-harness.html"
python -m http.server $port
