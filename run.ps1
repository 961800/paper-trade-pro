# PaperTrade Pro Startup Helper for Windows
# Run this script with: .\run.ps1

Clear-Host
Write-Host "=============================================" -ForegroundColor Green
Write-Host "      PaperTrade Pro - Windows Launcher      " -ForegroundColor Green
Write-Host "=============================================" -ForegroundColor Green
Write-Host ""

# 1. Load .env file if it exists
$envFile = Join-Path $PSScriptRoot ".env"
if (Test-Path $envFile) {
    Write-Host "Loading .env configuration..." -ForegroundColor Gray
    Get-Content $envFile | ForEach-Object {
        if ($_ -match "^(?<key>[^#\s=]+)\s*=\s*`"?(?<val>[^`"\r\n]+)`"?") {
            $key = $Matches['key'].Trim()
            $val = $Matches['val'].Trim()
            [System.Environment]::SetEnvironmentVariable($key, $val, [System.EnvironmentVariableTarget]::Process)
        }
    }
}

# 2. Check if DATABASE_URL is set
if (-not $env:DATABASE_URL) {
    Write-Host "DATABASE_URL is not set." -ForegroundColor Yellow
    Write-Host "Please enter your PostgreSQL connection string." -ForegroundColor White
    Write-Host "Example: postgresql://username:password@localhost:5432/dbname" -ForegroundColor Gray
    $dbUrl = Read-Host "DATABASE_URL"
    
    if (-not $dbUrl) {
        Write-Host "Error: DATABASE_URL is required to run the app." -ForegroundColor Red
        Exit
    }
    
    # Save to .env
    $dbUrl = $dbUrl.Trim()
    "DATABASE_URL=$dbUrl`nPORT=8080" | Out-File -FilePath $envFile -Encoding utf8
    $env:DATABASE_URL = $dbUrl
    $env:PORT = "8080"
    Write-Host "Configuration saved to .env file." -ForegroundColor Green
}

# Ensure PORT is set
if (-not $env:PORT) {
    $env:PORT = "8080"
}

Write-Host "`nInitializing database schema (Drizzle Push)..." -ForegroundColor Cyan
pnpm.cmd --filter @workspace/db run push

if ($LASTEXITCODE -ne 0) {
    Write-Host "`nError: Database schema initialization failed. Please verify your connection string and try again." -ForegroundColor Red
    Exit
}

Write-Host "`nStarting API Server and React Frontend concurrently..." -ForegroundColor Green
pnpm.cmd run dev
