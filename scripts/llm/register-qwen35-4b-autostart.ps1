# scripts/llm/register-qwen35-4b-autostart.ps1
# Registers Qwen3.5-4B-MTP worker pool to start on Windows logon.
#
# Hardware target: NVIDIA RTX 3060 Ti (8 GB VRAM)
# Configuration: 3 parallel slots, 98304 shared KV pool (q4_0 KV, FlashAttention)
# Endpoint: http://127.0.0.1:8080
#
# Usage (WSL or PowerShell):
#   powershell.exe -NoProfile -ExecutionPolicy Bypass -File scripts/llm/register-qwen35-4b-autostart.ps1 -Register
#   powershell.exe -NoProfile -ExecutionPolicy Bypass -File scripts/llm/register-qwen35-4b-autostart.ps1 -Status
#   powershell.exe -NoProfile -ExecutionPolicy Bypass -File scripts/llm/register-qwen35-4b-autostart.ps1 -Unregister

param(
    [switch]$Register,
    [switch]$Unregister,
    [switch]$Status
)

$ErrorActionPreference = "Stop"

$StartupFolder = [Environment]::GetFolderPath('Startup')
$StartupCmd    = Join-Path $StartupFolder "Qwen35-4B-Worker.cmd"
$TargetPs1     = "F:\tools\llama.cpp\start-qwen35-4b-service.ps1"
$PidFile       = "F:\tools\llama.cpp\qwen35-4b.pid"

function Say([string]$msg) {
    Write-Host ("[qwen35-autostart] " + $msg)
}

if ($Status) {
    Say "Checking Qwen3.5-4B-MTP worker autostart status..."
    if (Test-Path $StartupCmd) {
        Say "Autostart shortcut: PRESENT ($StartupCmd)"
    } else {
        Say "Autostart shortcut: NOT PRESENT"
    }

    if (Test-Path $PidFile) {
        $savedPid = Get-Content $PidFile -ErrorAction SilentlyContinue
        if ($savedPid -and (Get-Process -Id $savedPid -ErrorAction SilentlyContinue)) {
            Say "Process: RUNNING (PID $savedPid)"
        } else {
            Say "Process: NOT RUNNING (stale PID file: $savedPid)"
        }
    } else {
        Say "Process: PID file not found"
    }

    try {
        $r = Invoke-RestMethod -Uri "http://127.0.0.1:8080/health" -TimeoutSec 3
        Say "Endpoint :8080 health: $($r.status)"
    } catch {
        Say "Endpoint :8080 health: OFFLINE or UNREACHABLE"
    }
    exit 0
}

if ($Unregister) {
    if (Test-Path $StartupCmd) {
        Remove-Item $StartupCmd -Force
        Say "Removed autostart shortcut: $StartupCmd"
    } else {
        Say "Shortcut not found: $StartupCmd"
    }
    exit 0
}

if ($Register) {
    if (-not (Test-Path $TargetPs1)) {
        throw "Target script does not exist: $TargetPs1"
    }

    $cmdBody = "@echo off`r`nstart `"`" /min powershell.exe -NoProfile -ExecutionPolicy Bypass -WindowStyle Hidden -File `"$TargetPs1`"`r`n"
    Set-Content -Path $StartupCmd -Value $cmdBody -Encoding ASCII -NoNewline
    Say "Registered autostart shortcut: $StartupCmd"
    Say "Points to: $TargetPs1"
    exit 0
}

Say "No switch specified. Use -Register, -Unregister, or -Status."
exit 1
