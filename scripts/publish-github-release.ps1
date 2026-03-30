# Загрузка dist/autotest-recorder-<version>.zip в существующий или новый GitHub Release.
# Требуется: $env:GITHUB_TOKEN с правами repo (classic) или contents: write (fine-grained).
# Пример: $env:GITHUB_TOKEN = 'ghp_...'; .\scripts\publish-github-release.ps1
param(
  [string] $Owner = 'yurgus25',
  [string] $Repo = 'autotest_recorder'
)
$ErrorActionPreference = 'Stop'
if (-not $env:GITHUB_TOKEN) {
  Write-Error "Задайте `$env:GITHUB_TOKEN (PAT с правом загрузки релизов)."
}
$root = Split-Path -Parent (Split-Path -Parent $MyInvocation.MyCommand.Path)
Set-Location $root
$ver = (Get-Content (Join-Path $root 'manifest.json') -Raw | ConvertFrom-Json).version
$tag = "v$ver"
$zipName = "autotest-recorder-$ver.zip"
$zipPath = Join-Path $root "dist\$zipName"
if (-not (Test-Path $zipPath)) {
  Write-Host "Сборка zip..."
  & (Join-Path $root 'scripts\build-release.ps1')
}
$headers = @{
  Authorization = "Bearer $($env:GITHUB_TOKEN)"
  Accept        = 'application/vnd.github+json'
  'User-Agent'  = 'autotest-recorder-publish'
}
$base = "https://api.github.com/repos/$Owner/$Repo"
# Создать релиз, если нет (422 = уже есть)
$body = @{ tag_name = $tag; name = "v$ver"; generate_release_notes = $true } | ConvertTo-Json
try {
  Invoke-RestMethod -Uri "$base/releases" -Method Post -Headers $headers -Body $body -ContentType 'application/json' | Out-Null
} catch {
  if ($_.Exception.Response.StatusCode -ne 422) { throw }
}
$releases = Invoke-RestMethod -Uri "$base/releases" -Headers $headers
$rel = $releases | Where-Object { $_.tag_name -eq $tag } | Select-Object -First 1
if (-not $rel) { Write-Error "Релиз с тегом $tag не найден." }
$uploadUrl = $rel.upload_url -replace '\{\?name,label\}', "?name=$zipName"
Invoke-RestMethod -Uri $uploadUrl -Method Post -Headers $headers -InFile $zipPath -ContentType 'application/zip' | Out-Null
Write-Host "OK: загружено $zipName в релиз $tag"
