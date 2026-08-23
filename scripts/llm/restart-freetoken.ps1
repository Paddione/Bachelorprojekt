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
# Usage (aus WSL):
#   powershell.exe -NoProfile -File restart-freetoken.ps1 -Tag hit-d2d -ExtraArgs "--moe-prefill-hit-d2d"
#   powershell.exe -NoProfile -File restart-freetoken.ps1 -Tag solo -ExtraArgs "--moe-prefill-hit-d2d --max-running-requests 1 --graph 1"
#   powershell.exe -NoProfile -File restart-freetoken.ps1 -Tag ssm-bf16 -ExtraArgs "--moe-prefill-hit-d2d" -EnvVars "FREETOKEN_MAMBA_SSM_DTYPE=bfloat16"
#   powershell.exe -NoProfile -File restart-freetoken.ps1 -Stop

param(
    [string]$Tag = "run",
    [string]$ExtraArgs = "",
    [string]$EnvVars = "",
    [string]$Model = "$env:USERPROFILE\models\Qwen3.6-35B-A3B-NVFP4",
    [int]$NumTokens = 32768,
    [int]$ReadyTimeoutSec = 900,
    [switch]$Stop
)

$ErrorActionPreference = "Stop"
$FtExe   = "$env:LOCALAPPDATA\FreeToken\venv\Scripts\ft.exe"
$LogDir  = "$env:LOCALAPPDATA\FreeToken\logs"
$BaseUrl = "http://127.0.0.1:1919"

function Stop-FreeToken {
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

foreach ($kv in ($EnvVars -split '\s+' | Where-Object { $_ })) {
    $name, $value = $kv -split '=', 2
    Write-Host "env $name=$value"
    [Environment]::SetEnvironmentVariable($name, $value, "Process")
}

$argList = @("serve", "--model", $Model, "--host", "0.0.0.0", "--num-tokens", "$NumTokens")
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
            exit 0
        }
        Write-Host "  ... status=$($h.status) maintenance=$($h.maintenance)"
    } catch { Write-Host "  ... noch kein /health" }
}
throw "Server wurde in $ReadyTimeoutSec s nicht bereit. Siehe $outLog / $errLog"
