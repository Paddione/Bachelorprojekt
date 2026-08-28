# scripts/llm/restart-freetoken.ps1 -- FreeToken-Server (ft serve) mit definierten
# Zusatzflags neu starten, damit Prefill-Varianten reproduzierbar A/B-getestet werden koennen.
#
# WARUM ES DAS GIBT: Prefill von Qwen3.6-35B-A3B-NVFP4 lief mit Default-Flags bei
# ~149 Tok/s (6,69 ms/Tok) gegen 45 Tok/s Decode -- Faktor 3,3 statt der ueblichen
# 50-200. Die Kandidatenflags (--moe-prefill-hit-d2d, --max-prefill-length,
# --max-running-requests/--graph, --moe-backend) lassen sich nur durch Neustart
# vergleichen. Ohne Skript ist jeder Lauf eine Handmessung mit anderem Kommando.
#
# Der Basisaufruf ist der, der am 2026-08-23 lief:
#   ft serve --model C:\Users\<user>\models\Qwen3.6-35B-A3B-NVFP4 --host 0.0.0.0 --num-tokens 32768
#
# Usage (Windows, powershell im Repo-Root):
#   powershell -NoProfile -ExecutionPolicy Bypass -File scripts/llm/restart-freetoken.ps1
#   powershell -NoProfile -ExecutionPolicy Bypass -File scripts/llm/restart-freetoken.ps1 -Profile gptoss-65k
#   powershell -NoProfile -ExecutionPolicy Bypass -File scripts/llm/restart-freetoken.ps1 -Profile gemma-vision-32k
#   powershell -NoProfile -ExecutionPolicy Bypass -File scripts/llm/restart-freetoken.ps1 -Profile custom -Tag hit-d2d -ExtraArgs "--moe-prefill-hit-d2d"
#   powershell -NoProfile -ExecutionPolicy Bypass -File scripts/llm/restart-freetoken.ps1 -Tag solo -ExtraArgs "--moe-prefill-hit-d2d --max-running-requests 1 --graph 1"
#   powershell -NoProfile -ExecutionPolicy Bypass -File scripts/llm/restart-freetoken.ps1 -Tag ssm-bf16 -ExtraArgs "--moe-prefill-hit-d2d" -EnvVars "FREETOKEN_MAMBA_SSM_DTYPE=bfloat16"
#   powershell -NoProfile -ExecutionPolicy Bypass -File scripts/llm/restart-freetoken.ps1 -Stop
#
# KV-Ladder (seit 2026-08-24, WSL-Exit 2026-08-28): Nach Bereitschaft startet das
# Skript automatisch den wachsenden KV-Pool (scripts/llm/freetoken-kv-ladder.ps1)
# als detached Windows-Hintergrundprozess; beim Stoppen wird ein alter Poller
# mitgekillt, damit kein Zombie auf den toten Server zeigt. -NoLadder
# unterdrueckt das. Der Poller loggt nach %LOCALAPPDATA%\FreeToken\logs\
# (kv-ladder.out.log / kv-ladder.err.log -- getrennt, PS 5.1 Start-Process).
# Vertrag: limit.context des Modells in .opencode/agent-models.jsonc muss der
# Ladder-Decke entsprechen (200000).

param(
    [ValidateSet("qwen-200k", "gptoss-65k", "gemma-vision-32k", "custom")]
    [string]$Profile = "qwen-200k",
    [string]$Tag = "run",
    [string]$ExtraArgs = "",
    [string]$EnvVars = "",
    [string]$Model = "",
    [int]$NumTokens = 0,
    [int]$ReadyTimeoutSec = 900,
    [switch]$Stop,
    [switch]$NoLadder
)

$ErrorActionPreference = "Stop"
$FtExe   = "$env:LOCALAPPDATA\FreeToken\venv\Scripts\ft.exe"
$LogDir  = "$env:LOCALAPPDATA\FreeToken\logs"
$BaseUrl = "http://127.0.0.1:1919"
# Pfad zum Windows-nativen KV-Ladder-Skript (Repo-Lage ist fix).
$LadderScript = Join-Path $PSScriptRoot "freetoken-kv-ladder.ps1"

# Calibrated on pk-desktop (RTX 5070 Ti 16 GB, 2026-08-28). These profiles
# intentionally use plain offload and one request; additional agents queue.
$profileArgs = @()
$profileEnv = @()
switch ($Profile) {
    "qwen-200k" {
        if (-not $Model) { $Model = "$env:USERPROFILE\models\Qwen3.6-35B-A3B-NVFP4" }
        if ($NumTokens -eq 0) { $NumTokens = 200000 }
        $profileArgs = @("--moe-prefill-hit-d2d")
    }
    "gptoss-65k" {
        if (-not $Model) { $Model = "$env:USERPROFILE\models\gpt-oss-20b" }
        if ($NumTokens -eq 0) { $NumTokens = 65536 }
    }
    "gemma-vision-32k" {
        if (-not $Model) { $Model = "$env:USERPROFILE\models\Gemma-4-26B-A4B-NVFP4-Vision-Enabled-FTW" }
        if ($NumTokens -eq 0) { $NumTokens = 32768 }
        $profileEnv = @("FREETOKEN_LOAD_VISION=1")
    }
    "custom" {
        if (-not $Model) { $Model = "$env:USERPROFILE\models\Qwen3.6-35B-A3B-NVFP4" }
        if ($NumTokens -eq 0) { $NumTokens = 32768 }
    }
}

$commonProfileArgs = @(
    "--max-running-requests", "1",
    "--graph", "1",
    "--moe-backend", "offload",
    "--moe-cpu-layers", "0",
    "--moe-cache-auto",
    "--kv-reserve-tokens", "$NumTokens",
    "--max-prefill-length", "8192",
    "--cache-type", "radix",
    "--memory-ratio", "0.90",
    "--sampling-defaults", "model",
    "--enable-cache-report"
)

function Stop-FreeToken {
    # Alten KV-Ladder-Poller zuerst stoppen -- sonst pollt ein Zombie den
    # bald toten Port weiter und ein Neustart wrde einen zweiten erzeugen.
    Get-CimInstance Win32_Process -Filter "Name='powershell.exe'" -ErrorAction SilentlyContinue |
        Where-Object { $_.CommandLine -like "*freetoken-kv-ladder.ps1*" } |
        ForEach-Object {
            Write-Host "stoppe KV-Ladder-Poller PID $($_.ProcessId)"
            taskkill.exe /PID $_.ProcessId /T /F 2>&1 | Out-Null
        }
    $procs = Get-CimInstance Win32_Process -Filter "Name='ft.exe'" |
             Where-Object { $_.CommandLine -like "*serve*" }
    foreach ($p in $procs) {
        Write-Host "stoppe ft.exe PID $($p.ProcessId) (Prozessbaum)"
        & taskkill.exe /PID $p.ProcessId /T /F 2>&1 | Out-Null
    }
    # Warten, bis der Port wirklich frei ist -- sonst scheitert der Neustart am Bind.
    for ($i = 0; $i -lt 60; $i++) {
        $listening = Get-NetTCPConnection -LocalPort 1919 -State Listen -ErrorAction SilentlyContinue
        if (-not $listening) { return }
        Start-Sleep -Seconds 1
    }
    Write-Warning "Port 1919 ist nach 60 s noch belegt."
}

if ($Stop) { Stop-FreeToken; Write-Host "gestoppt."; exit 0 }

if (-not (Test-Path $FtExe))  { throw "ft.exe nicht gefunden: $FtExe" }
if (-not (Test-Path $Model))  { throw "Modellverzeichnis nicht gefunden: $Model" }
New-Item -ItemType Directory -Force -Path $LogDir | Out-Null

Stop-FreeToken

foreach ($kv in ($profileEnv + ($EnvVars -split '\s+' | Where-Object { $_ }))) {
    $name, $value = $kv -split '=', 2
    Write-Host "env $name=$value"
    [Environment]::SetEnvironmentVariable($name, $value, "Process")
}

$argList = @("serve", "--model", $Model, "--host", "0.0.0.0", "--num-tokens", "$NumTokens")
$argList += $commonProfileArgs
$argList += $profileArgs
$argList += ($ExtraArgs -split '\s+' | Where-Object { $_ })

$stamp  = Get-Date -Format "yyyyMMdd-HHmmss"
$outLog = Join-Path $LogDir "$Tag-$stamp.out.log"
$errLog = Join-Path $LogDir "$Tag-$stamp.err.log"

Write-Host "starte: ft $($argList -join ' ')"
Write-Host "log:    $outLog"
Start-Process -FilePath $FtExe -ArgumentList $argList `
    -RedirectStandardOutput $outLog -RedirectStandardError $errLog `
    -WindowStyle Hidden | Out-Null

# Bereitschaft aktiv pruefen. Abwesenheit eines Fehlers ist kein Bereitschaftsnachweis --
# es wird auf ein positives Signal gewartet (status=ok UND maintenance=serving).
$deadline = (Get-Date).AddSeconds($ReadyTimeoutSec)
while ((Get-Date) -lt $deadline) {
    Start-Sleep -Seconds 5
    $alive = Get-CimInstance Win32_Process -Filter "Name='ft.exe'" |
             Where-Object { $_.CommandLine -like "*serve*" }
    if (-not $alive) { throw "ft.exe ist beendet. Siehe $errLog" }
    try {
        $h = Invoke-RestMethod -Uri "$BaseUrl/health" -TimeoutSec 5
        if ($h.status -eq "ok" -and $h.maintenance -eq "serving") {
            Write-Host "bereit nach $([int]((Get-Date) - (Get-Item $outLog).CreationTime).TotalSeconds) s -- model=$($h.model) version=$($h.version)"
            if ($NoLadder -or $Profile -ne "custom") {
                Write-Host "KV-Ladder uebersprungen (Profil hat festen KV-Pool)."
            } else {
                # Wachsenden KV-Pool als detached Windows-Prozess starten.
                # Der Poller ueberlebt die aufrufende Shell (eigener powershell.exe-
                # Prozess); Logs nach %LOCALAPPDATA%\FreeToken\logs\
                # (kv-ladder.out.log / kv-ladder.err.log -- PS 5.1 Start-Process
                # verlangt getrennte Dateien fuer stdout/stderr).
                $ladderOut = Join-Path $LogDir "kv-ladder.out.log"
                $ladderErr = Join-Path $LogDir "kv-ladder.err.log"
                Start-Process -FilePath "powershell.exe" `
                    -ArgumentList @("-NoProfile", "-ExecutionPolicy", "Bypass", "-File", $LadderScript) `
                    -RedirectStandardOutput $ladderOut `
                    -RedirectStandardError $ladderErr `
                    -WindowStyle Hidden | Out-Null
                Write-Host "KV-Ladder gestartet (out: $ladderOut / err: $ladderErr)"
            }
            exit 0
        }
        Write-Host "  ... status=$($h.status) maintenance=$($h.maintenance)"
    } catch { Write-Host "  ... noch kein /health" }
}
throw "Server wurde in $ReadyTimeoutSec s nicht bereit. Siehe $outLog / $errLog"
