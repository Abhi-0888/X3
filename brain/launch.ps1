#!/usr/bin/env pwsh
<#
.SYNOPSIS
    AECI Brain Launcher — Starts OBS Virtual Camera + AI Brain Pipeline

.DESCRIPTION
    This script:
    1. Checks if Twinmotion is running
    2. Launches OBS Studio with the AECI scene collection (Twinmotion window capture)
    3. Starts OBS Virtual Camera automatically
    4. Launches the AI Brain (brain.py)

.USAGE
    cd brain/
    .\launch.ps1
    # or: .\launch.ps1 -NoOBS   (skip OBS, use direct window capture)
#>

param(
    [switch]$NoOBS,
    [switch]$ScreenCapture
)

$ErrorActionPreference = "Continue"
$brainDir = Split-Path -Parent $MyInvocation.MyCommand.Path

Write-Host ""
Write-Host "================================================================" -ForegroundColor Cyan
Write-Host "  ASTRA-EYE CONSTRUCTION INTELLIGENCE — Brain Launcher" -ForegroundColor Cyan
Write-Host "================================================================" -ForegroundColor Cyan
Write-Host ""

# ── Step 1: Check Twinmotion ─────────────────────────────────────────────
Write-Host "[1/4] Checking Twinmotion..." -ForegroundColor Yellow

$twinmotion = Get-Process | Where-Object { $_.ProcessName -match "Twinmotion" -or $_.MainWindowTitle -match "Twinmotion" } | Select-Object -First 1

if ($twinmotion) {
    Write-Host "  OK: Twinmotion is running (PID: $($twinmotion.Id))" -ForegroundColor Green
} else {
    Write-Host "  WARNING: Twinmotion not detected. Please start Twinmotion first." -ForegroundColor Red
    Write-Host "  The brain will still start, but may not capture anything useful." -ForegroundColor DarkYellow
}

# ── Step 2: Launch OBS Studio ────────────────────────────────────────────
if (-not $NoOBS -and -not $ScreenCapture) {
    Write-Host ""
    Write-Host "[2/4] Launching OBS Studio..." -ForegroundColor Yellow

    $obsExe = "C:\Program Files\obs-studio\bin\64bit\obs64.exe"

    if (Test-Path $obsExe) {
        $obsRunning = Get-Process -Name "obs64" -ErrorAction SilentlyContinue

        if ($obsRunning) {
            Write-Host "  OK: OBS is already running" -ForegroundColor Green
        } else {
            Write-Host "  Starting OBS with AECI Twinmotion scene..." -ForegroundColor DarkYellow

            # Launch OBS minimized with our scene collection
            # --startvirtualcam starts the virtual camera automatically
            Start-Process -FilePath $obsExe -ArgumentList `
                "--scene", '"Twinmotion Capture"', `
                "--collection", '"AECI_Twinmotion"', `
                "--profile", '"AECI"', `
                "--startvirtualcam", `
                "--minimize-to-tray" `
                -WindowStyle Minimized

            Write-Host "  OBS launched with Virtual Camera enabled" -ForegroundColor Green
            Write-Host "  Waiting 5s for OBS to initialize..." -ForegroundColor DarkYellow
            Start-Sleep -Seconds 5
        }

        Write-Host ""
        Write-Host "  IMPORTANT: In OBS, verify:" -ForegroundColor Cyan
        Write-Host "    - 'Twinmotion Window' source is capturing correctly" -ForegroundColor White
        Write-Host "    - Virtual Camera is started (Tools > Virtual Camera > Start)" -ForegroundColor White
    } else {
        Write-Host "  OBS not found at: $obsExe" -ForegroundColor Red
        Write-Host "  Falling back to direct window capture" -ForegroundColor DarkYellow
        $NoOBS = $true
    }
} else {
    Write-Host ""
    Write-Host "[2/4] Skipping OBS (using direct capture)" -ForegroundColor DarkYellow
}

# ── Step 3: Set video source ─────────────────────────────────────────────
Write-Host ""
Write-Host "[3/4] Configuring video source..." -ForegroundColor Yellow

$envFile = Join-Path (Split-Path $brainDir -Parent) ".env"

if ($ScreenCapture) {
    Write-Host "  Mode: Screen capture" -ForegroundColor Cyan
    $videoSource = "screen"
} elseif ($NoOBS) {
    Write-Host "  Mode: Direct Twinmotion window capture" -ForegroundColor Cyan
    $videoSource = "twinmotion"
} else {
    Write-Host "  Mode: OBS Virtual Camera" -ForegroundColor Cyan
    $videoSource = "obs"
}

# Update .env file
if (Test-Path $envFile) {
    $envContent = Get-Content $envFile -Raw
    $envContent = $envContent -replace "VIDEO_SOURCE=.*", "VIDEO_SOURCE=$videoSource"
    Set-Content $envFile $envContent -NoNewline
    Write-Host "  VIDEO_SOURCE=$videoSource set in .env" -ForegroundColor Green
}

# ── Step 4: Launch Brain ─────────────────────────────────────────────────
Write-Host ""
Write-Host "[4/4] Starting AECI AI Brain..." -ForegroundColor Yellow
Write-Host ""
Write-Host "================================================================" -ForegroundColor Cyan
Write-Host "  Brain starting — press Q in the preview window to quit" -ForegroundColor Cyan
Write-Host "  Keyboard: A/B/C = toggle modules, D = drone view, 1-5 = cameras" -ForegroundColor Cyan
Write-Host "================================================================" -ForegroundColor Cyan
Write-Host ""

Set-Location $brainDir
py brain.py
