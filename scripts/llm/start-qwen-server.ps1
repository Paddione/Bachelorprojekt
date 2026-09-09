<#
.SYNOPSIS
  Startet llama-server.exe fuer Qwen 3.8 27B (IQ3_XXS) auf Port 8094 via llama.cpp.
.DESCRIPTION
  Startskript fuer das Loadout 'qwen38-220k' (Port 8094).
  Nutzung:
    .\scripts\llm\start-qwen-server.ps1
    .\scripts\llm\start-qwen-server.ps1 -Stop
#>

param(
  [string]$LlamaDir = "C:\Users\PatrickKorczewski\llama-b10881-13.3",
  [string]$Model = "F:\models\models--unsloth--Qwen3.8-27B-GGUF\snapshots\4ca720788d1e01f1bff70c033e0d0028fd02e502\Qwen3.8-27B-UD-IQ4_XS.gguf",
  [int]$Ctx = 85760,
  [string]$ExtraArgs = "",
  [string]$GpuUuid = "GPU-7dc4bd81-3a8d-c414-1751-f74dee8882f4",
  [switch]$Stop,
  [switch]$NoWait
)

$ErrorActionPreference = "Stop"

# Bei Stopp vorhandenen Prozess auf 8094 beenden
$conns = Get-NetTCPConnection -LocalPort 8094 -State Listen -ErrorAction SilentlyContinue
if ($Stop) {
  foreach ($c in $conns) {
    if ($c.OwningProcess -and $c.OwningProcess -ne 0) {
      Write-Output "Stopping existing process on port 8094 (PID $($c.OwningProcess)) ..."
      & taskkill.exe /F /T /PID $c.OwningProcess 2>&1 | Out-Null
    }
  }
  return
}

function Get-FreeVramMiB {
  param([string]$Uuid)
  $lines = @(& nvidia-smi --query-gpu=memory.free --format=csv,noheader,nounits --id=$Uuid 2>&1)
  if ($LASTEXITCODE -ne 0 -or $lines.Count -lt 1) {
    Write-Error "nvidia-smi failed for GPU '$Uuid' (exit $LASTEXITCODE): $($lines -join ' ')"
    exit 1
  }
  return [int]("$($lines[0])".Trim())
}

$Exe = Join-Path $LlamaDir "llama-server.exe"
if (-not (Test-Path $Exe)) { $Exe = Join-Path $LlamaDir "bin\llama-server.exe" }
if (-not (Test-Path $Exe)) {
  Write-Error "llama-server.exe not found under: $LlamaDir"
  exit 1
}

if (-not (Test-Path $Model)) {
  Write-Error "Model not found at: $Model"
  exit 1
}

# Port 8094 freiraeumen
foreach ($c in $conns) {
  if ($c.OwningProcess -and $c.OwningProcess -ne 0) {
    Write-Output "Stopping existing process on port 8094 (PID $($c.OwningProcess)) ..."
    & taskkill.exe /F /T /PID $c.OwningProcess 2>&1 | Out-Null
  }
}

$env:CUDA_VISIBLE_DEVICES = $GpuUuid
$freeMiB = Get-FreeVramMiB -Uuid $GpuUuid

Write-Output "Starting Qwen 3.8 27B (UD-IQ4_XS) on port 8094 ..."
Write-Output "  Model:     $Model"
Write-Output "  Context:   $Ctx (smart prompt-cache + reuse)"
Write-Output "  Free VRAM: $freeMiB MiB"
Write-Output "  GPU:       $GpuUuid"

if ($freeMiB -lt 14000) {
  Write-Output "  WARNUNG: unter 14000 MiB frei. Modell + KV benoetigen ~14-15 GB VRAM."
}

$Params = @(
  "-m", $Model,
  "-c", "$Ctx",
  "-np", "1",
  "-ngl", "999",
  "-fa", "on",
  "-ctk", "q4_0",
  "-ctv", "q4_0",
  "--mmap",
  "--jinja",
  "--metrics",
  "-rea", "auto",
  "--no-context-shift",
  "-b", "2048",
  "-ub", "512",
  "--cache-prompt",
  "--host", "0.0.0.0",
  "--port", "8094"
)

if ($ExtraArgs) {
  $splitArgs = $ExtraArgs -split '\s+' | Where-Object { $_ -ne "" }
  $Params += $splitArgs
}

$logOut = Join-Path (Split-Path $Exe -Parent) "qwen38-out.log"
$logErr = Join-Path (Split-Path $Exe -Parent) "qwen38-err.log"
$p = Start-Process -FilePath $Exe -ArgumentList $Params -WindowStyle Hidden `
       -RedirectStandardOutput $logOut -RedirectStandardError $logErr -PassThru
"PID: $($p.Id)" | Out-File -FilePath (Join-Path (Split-Path $Exe -Parent) "qwen38.pid") -Encoding ascii

if (-not $NoWait) {
  $deadline = (Get-Date).AddSeconds(240)
  $healthy = $false
  while ((Get-Date) -lt $deadline) {
    Start-Sleep -Seconds 3
    if ($p.HasExited) { break }
    try {
      $r = Invoke-RestMethod -Uri 'http://127.0.0.1:8094/health' -TimeoutSec 2
      if ($r.status -eq 'ok') { $healthy = $true; break }
    } catch {}
  }

  if ($healthy) {
    Write-Output "qwen38: PID $($p.Id) healthy on :8094"
    Write-Output "  VRAM danach: $(Get-FreeVramMiB -Uuid $GpuUuid) MiB frei"
  } elseif ($p.HasExited) {
    Write-Output "qwen38 FAILED: exited (code $($p.ExitCode)) - see $logErr"
    Get-Content $logErr -Tail 20
  } else {
    Write-Output "qwen38 WARNING: PID $($p.Id) laeuft, aber nach 240s nicht healthy - see $logErr"
  }
}
