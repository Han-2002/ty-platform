$ErrorActionPreference = "Stop"

$Repo = Split-Path -Parent $PSScriptRoot
$Api = "http://127.0.0.1:8787/api/health"
$UiDir = Join-Path $Repo "standalone-ui"

Write-Host "========================================" -ForegroundColor Cyan
Write-Host " TY Platform Standalone" -ForegroundColor Cyan
Write-Host "========================================" -ForegroundColor Cyan

$apiRunning = $false
try {
  $health = Invoke-RestMethod -Uri $Api -TimeoutSec 2
  if ($health.status -eq "ok") { $apiRunning = $true }
} catch {}

if (-not $apiRunning) {
  Write-Host "Starting business API on 8787..." -ForegroundColor Yellow
  $cmd = @"
cd '$Repo'
`$env:DATABASE_URL='postgres://ty_platform:ty_platform_dev@localhost:5432/ty_platform'
npx tsx src/server/main.ts
"@
  Start-Process powershell -ArgumentList "-NoExit","-Command",$cmd

  $ready = $false
  for ($i=0; $i -lt 30; $i++) {
    Start-Sleep -Milliseconds 500
    try {
      $health = Invoke-RestMethod -Uri $Api -TimeoutSec 1
      if ($health.status -eq "ok") { $ready = $true; break }
    } catch {}
  }
  if (-not $ready) {
    throw "Business API did not become ready on port 8787."
  }
}

Write-Host "Business API: OK" -ForegroundColor Green
Write-Host "Starting standalone UI on 8790..." -ForegroundColor Yellow

Start-Process "http://127.0.0.1:8790"
Set-Location $UiDir
node .\server.mjs
