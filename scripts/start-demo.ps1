$ErrorActionPreference = "Stop"

$Root = Split-Path -Parent $PSScriptRoot
Set-Location $Root

if (-not $env:DATABASE_URL) {
  $env:DATABASE_URL = "postgres://ty_platform:ty_platform_dev@localhost:5432/ty_platform"
}
if (-not $env:TY_ADMIN_PASSWORD) {
  $env:TY_ADMIN_PASSWORD = "Admin123456!"
}

Write-Host "=== 1/4 Database migrations ==="
node scripts/migrate.mjs

Write-Host "=== 2/4 Bootstrap login account ==="
npx tsx scripts/bootstrap-admin.ts

Write-Host "=== 3/4 Start API ==="
$apiCommand = @"
Set-Location '$Root'
`$env:DATABASE_URL='$env:DATABASE_URL'
npx tsx src/server/main.ts
"@
Start-Process powershell -ArgumentList "-NoExit", "-Command", $apiCommand

Start-Sleep -Seconds 2

Write-Host "=== 4/4 Start Web ==="
$webCommand = @"
Set-Location '$Root'
npm run dev:web
"@
Start-Process powershell -ArgumentList "-NoExit", "-Command", $webCommand

Write-Host ""
Write-Host "Demo is starting."
Write-Host "Web: http://localhost:5173"
Write-Host "API: http://localhost:8787/api/health"
Write-Host "Default login (development only):"
Write-Host "  userId: admin (or the user already occupying the approval seat)"
Write-Host "  password: $env:TY_ADMIN_PASSWORD"
Write-Host ""
Write-Host "Open http://localhost:5173 in your browser."
