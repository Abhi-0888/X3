#requires -Version 5.1
<#
.SYNOPSIS
    AECI Unified Launcher - Starts API Server + Dashboard + Brain simultaneously
.DESCRIPTION
    Runs all three AECI modules in separate windows with proper environment setup.
    Press Ctrl+C in this window to stop all processes.
.EXAMPLE
    .\launch-all.ps1
#>

param(
    [switch]$NoBrain,      # Skip starting the brain (API + Dashboard only)
    [switch]$NoDashboard,  # Skip starting the dashboard
    [switch]$Debug         # Enable debug logging
)

$ErrorActionPreference = "Stop"
$host.ui.RawUI.WindowTitle = "AECI Launcher - All Modules"

# Resolve paths
$RootDir = $PSScriptRoot
if (-not $RootDir) { $RootDir = $PWD.Path }

Write-Host @"
╔══════════════════════════════════════════════════════════════════╗
║           AECI - Unified Module Launcher                         ║
║                                                                  ║
║  Components: API Server (8080) | Dashboard (23753) | Brain      ║
╚══════════════════════════════════════════════════════════════════╝
"@ -ForegroundColor Cyan

# Environment variables from .env file
$EnvFile = Join-Path $RootDir ".env"
if (Test-Path $EnvFile) {
    Write-Host "[+] Loading environment from $EnvFile" -ForegroundColor Green
    Get-Content $EnvFile | ForEach-Object {
        if ($_ -match '^([^#=]+)=(.*)$') {
            $name = $matches[1].Trim()
            $value = $matches[2].Trim()
            [Environment]::SetEnvironmentVariable($name, $value, "Process")
        }
    }
} else {
    Write-Host "[!] .env file not found, using defaults" -ForegroundColor Yellow
}

# Override/set required vars
$env:NODE_ENV = "development"
$env:PORT = "8080"
$env:BASE_PATH = "/"
$env:PORT_DASHBOARD = "23753"

# Database URL fallback
if (-not $env:DATABASE_URL) {
    $env:DATABASE_URL = "postgres://localhost:5432/aeci"
}

Write-Host "[+] Environment configured" -ForegroundColor Green
Write-Host "    API Server: http://localhost:$($env:PORT)"
Write-Host "    Dashboard:  http://localhost:$($env:PORT_DASHBOARD)"
Write-Host "    Database:   $($env:DATABASE_URL -replace '://.*@', '://***@')"

<#
# Kill any existing processes on our ports
Write-Host "`n[+] Cleaning up existing processes..." -ForegroundColor Green
Get-NetTCPConnection -LocalPort 8080 -ErrorAction SilentlyContinue | ForEach-Object {
    try { Stop-Process -Id $_.OwningProcess -Force -ErrorAction SilentlyContinue } catch {}
}
Get-NetTCPConnection -LocalPort 23753 -ErrorAction SilentlyContinue | ForEach-Object {
    try { Stop-Process -Id $_.OwningProcess -Force -ErrorAction SilentlyContinue } catch {}
}
Get-Process -Name "python" -ErrorAction SilentlyContinue | Where-Object { $_.CommandLine -like "*brain.py*" } | Stop-Process -Force -ErrorAction SilentlyContinue
Start-Sleep -Seconds 2
#>

# Process tracking
$Processes = @()

# 1. Start API Server
Write-Host "`n[1/3] Starting API Server..." -ForegroundColor Cyan
$ApiDir = Join-Path $RootDir "artifacts\api-server"
$ApiCmd = "powershell.exe"
$ApiArgs = @(
    "-NoExit",
    "-Command",
    "Set-Location '$ApiDir'; `$env:NODE_ENV='development'; `$env:PORT='8080'; `$env:BASE_PATH='/'; `$env:DATABASE_URL='$($env:DATABASE_URL)'; pnpm run build; pnpm run start 2>&1 | ForEach-Object { Write-Host (`$_ -replace '.*?\[.*?\]\s*','') }"
)
$ApiProcess = Start-Process -FilePath $ApiCmd -ArgumentList $ApiArgs -PassThru -WindowStyle Normal
$Processes += $ApiProcess
Write-Host "    API Server PID: $($ApiProcess.Id)" -ForegroundColor Gray

# Wait for API to be ready
Write-Host "    Waiting for API to be ready..." -NoNewline -ForegroundColor Gray
$ApiReady = $false
for ($i = 0; $i -lt 30; $i++) {
    Start-Sleep -Milliseconds 500
    try {
        $response = Invoke-RestMethod -Uri "http://localhost:8080/api/healthz" -TimeoutSec 1 -ErrorAction Stop
        if ($response.status -eq "ok") {
            $ApiReady = $true
            Write-Host " READY!" -ForegroundColor Green
            break
        }
    } catch {}
    Write-Host "." -NoNewline -ForegroundColor Gray
}
if (-not $ApiReady) {
    Write-Host " TIMEOUT" -ForegroundColor Red
    Write-Host "[!] API server failed to start. Check the API window for errors." -ForegroundColor Red
} else {
    Write-Host "    API Server running at http://localhost:8080" -ForegroundColor Green
}

# 2. Start Dashboard
if (-not $NoDashboard) {
    Write-Host "`n[2/3] Starting Dashboard..." -ForegroundColor Cyan
    $DashDir = Join-Path $RootDir "artifacts\aeci-dashboard"
    $DashCmd = "powershell.exe"
    $DashArgs = @(
        "-NoExit",
        "-Command",
        "Set-Location '$DashDir'; `$env:PORT='23753'; `$env:BASE_PATH='/'; pnpm run dev 2>&1 | ForEach-Object { Write-Host (`$_ -replace '.*?\[.*?\]\s*','') }"
    )
    $DashProcess = Start-Process -FilePath $DashCmd -ArgumentList $DashArgs -PassThru -WindowStyle Normal
    $Processes += $DashProcess
    Write-Host "    Dashboard PID: $($DashProcess.Id)" -ForegroundColor Gray
    Write-Host "    Dashboard starting at http://localhost:23753..." -ForegroundColor Green
}

# 3. Start Brain
if (-not $NoBrain) {
    Write-Host "`n[3/3] Starting Brain (Twinmotion AI)..." -ForegroundColor Cyan
    $BrainDir = Join-Path $RootDir "brain"
    $BrainCmd = "powershell.exe"
    $BrainArgs = @(
        "-NoExit",
        "-Command",
        "Set-Location '$BrainDir'; Write-Host 'Starting AECI Brain - capturing from Twinmotion...' -ForegroundColor Green; py brain.py 2>&1 | ForEach-Object { Write-Host `$_ }"
    )
    $BrainProcess = Start-Process -FilePath $BrainCmd -ArgumentList $BrainArgs -PassThru -WindowStyle Normal
    $Processes += $BrainProcess
    Write-Host "    Brain PID: $($BrainProcess.Id)" -ForegroundColor Gray
}

# Summary
Write-Host @"

╔══════════════════════════════════════════════════════════════════╗
║                     All Systems Launched!                         ║
╠══════════════════════════════════════════════════════════════════╣
║  API Server:   http://localhost:8080                            ║
║  Dashboard:    http://localhost:23753                           ║
║  Health Check: http://localhost:8080/api/healthz                  ║
║  Live Status:  http://localhost:8080/api/live/status            ║
╚══════════════════════════════════════════════════════════════════╝
"@ -ForegroundColor Green

Write-Host "Press Ctrl+C to stop all processes..." -ForegroundColor Yellow
Write-Host ""

# Keep alive and wait for Ctrl+C
try {
    while ($true) {
        Start-Sleep -Seconds 1

        # Check if processes are still running
        $RunningCount = 0
        foreach ($proc in $Processes) {
            try {
                $p = Get-Process -Id $proc.Id -ErrorAction Stop
                if ($p) { $RunningCount++ }
            } catch {
                # Process exited
            }
        }

        if ($RunningCount -eq 0) {
            Write-Host "`n[!] All processes have exited." -ForegroundColor Red
            break
        }
    }
} finally {
    # Cleanup
    Write-Host "`n[+] Stopping all processes..." -ForegroundColor Yellow
    foreach ($proc in $Processes) {
        try {
            Stop-Process -Id $proc.Id -Force -ErrorAction SilentlyContinue
            Write-Host "    Stopped PID $($proc.Id)" -ForegroundColor Gray
        } catch {}
    }
    Write-Host "[+] All processes stopped." -ForegroundColor Green
}
