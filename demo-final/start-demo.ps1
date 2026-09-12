$ErrorActionPreference = "Stop"
$DemoDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$ProjectRoot = Split-Path -Parent $DemoDir
Set-Location $ProjectRoot

Write-Host ""
Write-Host "========================================="
Write-Host " TY Platform Complete Demo V1"
Write-Host "========================================="
Write-Host ""

if (-not $env:DATABASE_URL) {
  $env:DATABASE_URL = "postgres://ty_platform:ty_platform_dev@localhost:5432/ty_platform"
}

# Ensure the two runtime dependencies used by the standalone demo exist in the project.
if (-not (Test-Path "$ProjectRoot\node_modules\pg") -or -not (Test-Path "$ProjectRoot\node_modules\ws")) {
  Write-Host "Installing demo dependencies (pg, ws)..."
  npm install pg ws
}

Write-Host "Checking PostgreSQL..."
try {
  $svc = Get-Service *postgres* -ErrorAction Stop | Select-Object -First 1
  if ($svc.Status -ne "Running") {
    Start-Service $svc.Name
  }
  Write-Host "PostgreSQL: Running"
} catch {
  Write-Host "WARNING: PostgreSQL service was not detected automatically."
  Write-Host "The demo will still try DATABASE_URL=$env:DATABASE_URL"
}

Write-Host ""
Write-Host "Starting demo server..."
Write-Host "Browser: http://127.0.0.1:8790"
Write-Host "Login: director / demo123"
Write-Host ""

Start-Process "http://127.0.0.1:8790"
node "$DemoDir\server.mjs"
