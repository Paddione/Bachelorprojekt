<#
.SYNOPSIS
  Startet llama-server.exe fuer Qwen 3.8 27B UD-IQ4_XS auf Port 8094.

.DESCRIPTION
  Default ist der Dual-GPU-Split ueber RTX 5070 Ti + RTX 3060 Ti. Das Modell
  (13,27 GB) passt zwar allein auf die 5070 Ti, aber der Split kauft mit der
  zweiten Karte VRAM fuer den KV-Cache und damit Kontext.

  DER SPLIT IST EIN TAUSCH, KEIN GEWINN. Gemessen am 2026-09-09 auf diesem Host
  (b10881, IQ4_XS, q4_0-KV, -fitt 256, je drei warme Laeufe a 300 Token,
  identischer Prompt):

    | Konfiguration           | -fitt    | n_ctx_slot | Decode  | frei 3060 Ti |
    |-------------------------|----------|------------|---------|--------------|
    | beide GPUs              | 256      |    242.688 | ~22 t/s |      168 MiB |
    | beide GPUs              | 1024     |    196.352 | -       |      197 MiB |
    | beide GPUs (DEFAULT)    | 256,1500 |    205.056 | -       |      683 MiB |
    | nur 5070 Ti (-SingleGpu)| 256      |     74.496 | ~50 t/s |    (ungenutzt)|

  Dreifacher Kontext kostet also mehr als die Haelfte des Durchsatzes: bei
  Layer-Split laeuft jeder Token durch beide Karten, und die 3060 Ti ist die
  langsamere. Wer keinen grossen Kontext braucht, faehrt mit -SingleGpu
  deutlich schneller.

  WARUM DER DEFAULT "256,1500" IST UND NICHT DER GROESSTE KONTEXT: mit einem
  einzelnen Margin-Wert blieben der 3060 Ti nur 168 MiB - auf der Karte haengt
  aber der Desktop. Ein Browser-Tab oder ein zweites CUDA-Programm kippt das.
  Die Reserve pro Geraet kostet 37k Kontext (205k statt 242k) und vervierfacht
  die Reserve auf der Anzeige-Karte. Wer die Karte headless faehrt, kann
  -FitMarginMib "256" setzen und die 242k mitnehmen.

  FALLSTRICK max_tokens BEI AKTIVEM REASONING: -rea auto liefert den Denkteil
  getrennt in .choices[0].message.reasoning_content. Ist max_tokens knapp, ist
  das Budget aufgebraucht, bevor .content etwas enthaelt - die Antwort kommt
  dann LEER zurueck, obwohl der Server korrekt gearbeitet hat. Beobachtet mit
  max_tokens=80. Fuer kurze Antworten trotzdem 250+ ansetzen oder den
  Reasoning-Teil mitlesen.

  Nachstellbar:
    .\scripts\llm\start-qwen-server.ps1              # dual  -> 242k / 22 t/s
    .\scripts\llm\start-qwen-server.ps1 -SingleGpu   # solo  -> 74k / 50 t/s
    # Kontext aus dem Log: "load_model: initializing, n_slots = 1, n_ctx_slot = N"
    # Durchsatz: POST /v1/chat/completions, Feld .timings.predicted_per_second

  KV-CACHE ist q4_0 fuer K und V (-ctk/-ctv). Das ist die Voraussetzung dafuer,
  dass die obigen Kontextgroessen ueberhaupt in den VRAM passen; mit f16-KV
  waere derselbe Pool rund viermal so gross.

  KONTEXT WIRD NICHT FEST GESETZT, sondern von llama.cpp -fit gewaehlt (-c
  bleibt ungesetzt). Eine feste Zahl haelt nur, solange der VRAM frei ist -
  laeuft etwas anderes auf der Karte, startet der Server gar nicht oder stirbt
  beim ersten Request. -fitc 16384 ist die Untergrenze: unterschreitet fit sie,
  bricht der Start ab, statt still einen unbrauchbaren Mini-Kontext zu liefern.

  FALLSTRICK GERAETE-REIHENFOLGE: nvidia-smi und CUDA sortieren verschieden.
  nvidia-smi zeigt die 3060 Ti als Index 0, llama.cpp meldet die 5070 Ti als
  CUDA0 (Sortierung nach Leistung). Deshalb wird die Karte per UUID adressiert,
  nie per Index. UUIDs pruefen mit:
    nvidia-smi --query-gpu=index,name,uuid --format=csv

  Nutzung:
    .\scripts\llm\start-qwen-server.ps1
    .\scripts\llm\start-qwen-server.ps1 -SingleGpu
    .\scripts\llm\start-qwen-server.ps1 -Stop

.PARAMETER SingleGpu
  Nur die 5070 Ti verwenden. Schneller (~50 statt ~22 t/s), aber deutlich
  weniger Kontext (~74k statt ~242k).

.PARAMETER TensorSplit
  Optionales Aufteilungsverhaeltnis fuer -ts, z.B. "70,30" (CUDA0,CUDA1 - also
  5070 Ti zuerst). Leer lassen heisst: -fit verteilt selbst. Nur setzen, wenn
  die automatische Verteilung nachweislich schlecht liegt.

.PARAMETER Ctx
  Festes Kontextfenster statt -fit. 0 (Default) heisst: fit entscheidet.
#>

param(
  [string]$LlamaDir = "C:\Users\PatrickKorczewski\llama-b10881-13.3",
  [string]$Model = "F:\models\models--unsloth--Qwen3.8-27B-GGUF\snapshots\4ca720788d1e01f1bff70c033e0d0028fd02e502\Qwen3.8-27B-UD-IQ4_XS.gguf",
  [int]$Ctx = 0,
  [int]$MinCtx = 16384,
  # Reserve je Geraet, Reihenfolge CUDA0,CUDA1 - also 5070 Ti, dann 3060 Ti.
  # Auf der 3060 Ti haengt der Desktop, deshalb dort deutlich mehr Reserve:
  # ein einzelner Wert wird zwar auf alle Karten gebroadcastet, liess der
  # zweiten aber nur 168-197 MiB (gemessen), was fuer eine Karte mit Anzeige
  # zu knapp ist. Siehe Messtabelle in .DESCRIPTION.
  [string]$FitMarginMib = "256,1500",
  [string]$TensorSplit = "",
  [string]$ExtraArgs = "",
  # UUIDs statt Indizes: CUDA und nvidia-smi sortieren verschieden (siehe .DESCRIPTION).
  [string]$GpuUuidPrimary = "GPU-7dc4bd81-3a8d-c414-1751-f74dee8882f4",   # RTX 5070 Ti, 16 GB
  [string]$GpuUuidSecondary = "GPU-6b9ac882-e9e9-a364-4423-92d838536b86", # RTX 3060 Ti, 8 GB
  [switch]$SingleGpu,
  [switch]$Stop,
  [switch]$NoWait
)

$ErrorActionPreference = "Stop"

$conns = Get-NetTCPConnection -LocalPort 8094 -State Listen -ErrorAction SilentlyContinue
foreach ($c in $conns) {
  if ($c.OwningProcess -and $c.OwningProcess -ne 0) {
    Write-Output "Stopping existing process on port 8094 (PID $($c.OwningProcess)) ..."
    Stop-Process -Id $c.OwningProcess -Force -ErrorAction SilentlyContinue
  }
}
if ($Stop) { return }

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

if ($SingleGpu) {
  $env:CUDA_VISIBLE_DEVICES = $GpuUuidPrimary
  $mode = "single (5070 Ti)"
  $freeTotal = Get-FreeVramMiB -Uuid $GpuUuidPrimary
} else {
  # Reihenfolge bestimmt CUDA0/CUDA1 und damit auch die Bedeutung von -ts.
  $env:CUDA_VISIBLE_DEVICES = "$GpuUuidPrimary,$GpuUuidSecondary"
  $mode = "dual split (5070 Ti + 3060 Ti)"
  $freeTotal = (Get-FreeVramMiB -Uuid $GpuUuidPrimary) + (Get-FreeVramMiB -Uuid $GpuUuidSecondary)
}

$modelGiB = [math]::Round((Get-Item $Model).Length / 1GB, 2)

Write-Output "Starting Qwen 3.8 27B UD-IQ4_XS on port 8094 ..."
Write-Output "  Mode:       $mode"
Write-Output "  Model:      $Model ($modelGiB GB)"
Write-Output "  Free VRAM:  $freeTotal MiB total"
Write-Output "  KV cache:   q4_0 (K and V)"
if ($Ctx -gt 0) {
  Write-Output "  Context:    $Ctx (fixed)"
} else {
  Write-Output "  Context:    chosen by -fit (floor $MinCtx, margin $FitMarginMib MiB)"
}

# Das Modell selbst muss in den Gesamt-VRAM passen; darunter kann kein Kontext
# mehr entstehen. Warnen statt abbrechen: llama.cpp kann Layer auf die CPU
# auslagern, das ist langsam, aber nicht falsch.
$needMiB = [int]($modelGiB * 1024)
if ($freeTotal -lt $needMiB) {
  Write-Output "  WARNUNG: nur $freeTotal MiB frei, Modell braucht ~$needMiB MiB."
  Write-Output "           llama.cpp wird Layer auf die CPU auslagern (deutlich langsamer)."
}

$Params = @(
  "-m", $Model,
  "-ngl", "999",
  "-np", "1",
  "-ctk", "q4_0",
  "-ctv", "q4_0",
  "-fa", "on",
  "--jinja",
  "--metrics",
  "-rea", "auto",
  "--spec-type", "ngram-mod",
  "--no-context-shift",
  "-b", "2048",
  "-ub", "512",
  # Host-RAM-Cache fuer pausierte Slots: ohne ihn prefillt jeder Agentenwechsel
  # den vollen Prompt neu (gemessen 2026-08-22: 137 s statt 2,5 s).
  "--cache-ram", "12288",
  "--cache-prompt",
  "--cache-reuse", "256",
  "--host", "0.0.0.0",
  "--port", "8094"
)

if ($Ctx -gt 0) {
  $Params += @("-c", "$Ctx", "-fit", "off")
} else {
  $Params += @("-fit", "on", "-fitt", "$FitMarginMib", "-fitc", "$MinCtx")
}

if ($TensorSplit -and -not $SingleGpu) {
  $Params += @("-ts", $TensorSplit)
}

if ($ExtraArgs) {
  $Params += ($ExtraArgs -split '\s+' | Where-Object { $_ -ne "" })
}

$logOut = Join-Path (Split-Path $Exe -Parent) "qwen38-out.log"
$logErr = Join-Path (Split-Path $Exe -Parent) "qwen38-err.log"
$p = Start-Process -FilePath $Exe -ArgumentList $Params -WindowStyle Hidden `
       -RedirectStandardOutput $logOut -RedirectStandardError $logErr -PassThru
"PID: $($p.Id)" | Out-File -FilePath (Join-Path (Split-Path $Exe -Parent) "qwen38.pid") -Encoding ascii

if (-not $NoWait) {
  $deadline = (Get-Date).AddSeconds(300)
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
    # Der tatsaechlich gewaehlte Kontext steht nur im Log - die gewuenschte Zahl
    # ist nicht die zugeteilte, und genau diese Differenz ist die interessante.
    $slot = Select-String -Path $logErr -Pattern 'n_ctx_slot = (\d+)' | Select-Object -Last 1
    $ctxReal = if ($slot) { $slot.Matches[0].Groups[1].Value } else { "unbekannt" }
    Write-Output "qwen38: PID $($p.Id) healthy on :8094"
    Write-Output "  n_ctx_slot: $ctxReal"
    Write-Output "  VRAM frei danach: $(Get-FreeVramMiB -Uuid $GpuUuidPrimary) MiB (5070 Ti)"
    if (-not $SingleGpu) {
      Write-Output "                    $(Get-FreeVramMiB -Uuid $GpuUuidSecondary) MiB (3060 Ti)"
    }
  } elseif ($p.HasExited) {
    Write-Output "qwen38 FAILED: exited (code $($p.ExitCode)) - see $logErr"
    Get-Content $logErr -Tail 20
  } else {
    Write-Output "qwen38 WARNING: PID $($p.Id) laeuft, aber nach 300s nicht healthy - see $logErr"
  }
}
