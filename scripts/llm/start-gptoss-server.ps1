<#
.SYNOPSIS
  Startet llama-server.exe fuer openai/gpt-oss-20b (MXFP4) auf Port 8097.
.DESCRIPTION
  Zweiter Modellkandidat fuer die Factory-Phasen implement/review, gedacht fuer
  den A/B-Vergleich gegen Ternary-Bonsai (:8093) via scripts/factory/eval-replay.mjs.
  Laeuft parallel zu Bonsai bzw. anstelle davon - die Routing-Entscheidung faellt
  NICHT hier, sondern in tickets.provider_config (siehe
  scripts/factory/provider-register-gptoss.sh).
  VRAM-Notausstieg via Umgebungsvariable LLM_GPTOSS_NGL (Default 999).

  WARUM DIESES MODELL (T002268, Recherche 2026-07-27 ueber die offiziellen
  HF-Benchmark-Leaderboards, Budget 14.5 GB VRAM):
  - LiquidAI/ifstruct-v1.0 (strukturiertes Instruction-Following, also die
    tool_calls-Disziplin): gpt-oss-20b 91.95, Rang 2 von allen gelisteten
    Modellen. Geschlagen nur von InternScience/Agents-A1 (35B, passt nicht).
    Zum Vergleich ibm-granite/granite-4.1-8b: 68.45.
  - Qwen/Qwen3.6-27B waere auf terminal-bench-2.0 besser (59.3), passt aber nur
    als IQ3_XXS ins VRAM - Q4_K_S braucht 16.12 GB.
  - gpt-oss ist NATIV MXFP4 quantisiert. Die Quant-Groessen liegen deshalb dicht
    beieinander (Q3_K_M 11.51 / Q4_K_M 11.62 / Q8_0 12.11 / F16 13.79 GB) - man
    bekommt praktisch verlustfreie Qualitaet fuer 12 GB. Verwendet wird daher die
    Konvertierung des llama.cpp-Teams selbst: ggml-org/gpt-oss-20b-GGUF.
  - MoE mit 4 von 32 Experten => ~3.6B aktive Parameter pro Token: Durchsatz wie
    ein kleines Modell. max_position_embeddings ist 131072.

  WARUM HIER KEIN -b/-ub GESETZT WIRD (Abgrenzung zu T002260):
  Der Zwang, -ub auf die volle Kontextlaenge zu setzen, betrifft ausschliesslich
  NICHT-kausale Modelle (bge-m3, bge-reranker: dort muss jede Sequenz komplett in
  einen physischen Batch passen, sonst HTTP 500). gpt-oss ist ein kausales
  Chat-Modell - llama.cpp splittet dessen Sequenzen problemlos ueber mehrere
  Ubatches. Bitte nicht als Cargo-Cult uebernehmen.
  Optionale Tuning-Stellschraube: ein groesseres -b/-ub beschleunigt das Prefill
  langer Prompts (die Factory fuellt 31-37k Tokens), kostet aber VRAM. Erst
  messen, dann setzen.

  KV-BUDGET: -ctk/-ctv q8_0 ergibt bei 24 Layern x 8 KV-Heads x 64 head_dim
  genau 24 KB/Token. Bei -c 40960 sind das 0.98 GB (mit f16 waere es doppelt).
  Rechnung: 12.11 GB Gewichte + 0.98 GB KV + 1.3 GB (bge-m3 + Reranker, die
  dauerhaft mitlaufen) = ~14.4 GB von 16.3 GB. Wer den Kontext hochdreht, muss
  gegenrechnen.

  HEALTH-POLL-FENSTER: bis zu 240 Sekunden. Mit -NoWait kehrt das Skript sofort
  nach Start-Process zurueck und ueberspringt Health-Poll und Hinweistext.

  ZWEI-GPU-HOST (2026-09-04): der Host traegt seit dem Einbau der zweiten Karte
  eine RTX 3060 Ti (8192 MiB, PCIe 3.0 x4, treibt den Desktop) und eine
  RTX 5070 Ti (16303 MiB, PCIe 4.0 x16). Alle Messwerte in loadouts.json und
  docs/runbooks/freetoken-native.md beziehen sich auf die 5070 Ti; sie ist der
  Default von -GpuUuid. Ausgewaehlt wird per UUID und NICHT per Index, weil CUDA
  per Default nach "fastest first" sortiert und nvidia-smi nach PCI-Bus - die
  Indizes duerfen auseinanderlaufen. Bis zu diesem Fix warf der VRAM-Check
  "Cannot convert the System.Object[] value ... to type System.Int32", weil
  nvidia-smi ohne --id zwei Zeilen liefert.
.PARAMETER LlamaDir
  Verzeichnis mit llama-server.exe. Default: C:\Users\PatrickKorczewski\llama-b10090-13.3
.PARAMETER GpuUuid
  UUID der Zielkarte. Default: GPU-7dc4bd81-3a8d-c414-1751-f74dee8882f4
  (RTX 5070 Ti). Setzt CUDA_VISIBLE_DEVICES fuer den Serverprozess UND
  restringiert die nvidia-smi-Messung - beide Werte stammen aus derselben
  Variablen, damit der VRAM-Check die Karte misst, auf der der Server laeuft.
  Karten auflisten: nvidia-smi --query-gpu=index,name,uuid --format=csv
.EXAMPLE
  .\scripts\llm\start-gptoss-server.ps1
.EXAMPLE
  .\scripts\llm\start-gptoss-server.ps1 -GpuUuid GPU-6b9ac882-e9e9-a364-4423-92d838536b86
  # Auf die 3060 Ti ausweichen. Nur 8192 MiB - der Warnschwellenwert 13500 MiB
  # schlaegt dann berechtigt an; -Ctx entsprechend reduzieren.
#>

param(
  [string]$LlamaDir = "C:\Users\PatrickKorczewski\llama-b10090-13.3",
  [int]$Ctx = 40960,
  # Zielkarte per UUID, nicht per Index: CUDA sortiert per Default nach
  # "fastest first", nvidia-smi nach PCI-Bus - die Indizes duerfen
  # auseinanderlaufen. Default ist die RTX 5070 Ti (16303 MiB, PCIe 4.0 x16,
  # display_active=Disabled); die zweite Karte im Host ist eine RTX 3060 Ti
  # (8192 MiB, x4-Link) und treibt den Desktop. Ueberschreibbar mit -GpuUuid.
  [string]$GpuUuid = "GPU-7dc4bd81-3a8d-c414-1751-f74dee8882f4",
  [switch]$NoWait
)

# Freier VRAM GENAU der Zielkarte. Ohne --id liefert nvidia-smi bei zwei Karten
# zwei Zeilen; PowerShell bindet das als System.Object[], .Trim() existiert
# darauf nicht und der [int]-Cast wirft "Cannot convert the System.Object[]
# value of type System.Object[] to type System.Int32" (verifiziert 2026-09-04).
# Eine unbekannte UUID liefert Exit 6 und "No devices were found" - das wird
# fail-loud behandelt, nicht still zu 0 MiB degradiert.
function Get-FreeVramMiB {
  param([string]$Uuid)
  $lines = @(& nvidia-smi --query-gpu=memory.free --format=csv,noheader,nounits --id=$Uuid 2>&1)
  if ($LASTEXITCODE -ne 0 -or $lines.Count -lt 1) {
    Write-Error "nvidia-smi failed for GPU '$Uuid' (exit $LASTEXITCODE): $($lines -join ' ')"
    Write-Output "  Vorhandene Karten auflisten:"
    Write-Output "    nvidia-smi --query-gpu=index,name,uuid --format=csv"
    exit 1
  }
  return [int]("$($lines[0])".Trim())
}

# Bei diesem Build liegt llama-server.exe flach im Root, nicht in \bin.
$Exe = Join-Path $LlamaDir "llama-server.exe"
if (-not (Test-Path $Exe)) { $Exe = Join-Path $LlamaDir "bin\llama-server.exe" }
if (-not (Test-Path $Exe)) {
  Write-Error "llama-server.exe not found under: $LlamaDir"
  exit 1
}

$Model = "$env:UserProfile\.lmstudio\models\ggml-org\gpt-oss-20b-GGUF\gpt-oss-20b-MXFP4.gguf"
if (-not (Test-Path $Model)) {
  Write-Error "Model not found at: $Model"
  Write-Output "  hf download ggml-org/gpt-oss-20b-GGUF gpt-oss-20b-MXFP4.gguf --local-dir <dir>"
  exit 1
}

$Ngl = if ($env:LLM_GPTOSS_NGL) { $env:LLM_GPTOSS_NGL } else { "999" }

# Port raeumen - die anderen Startskripte tun das nicht, und ein noch laufender
# Server auf 8097 laesst den neuen still am Bind scheitern.
$conns = Get-NetTCPConnection -LocalPort 8097 -State Listen -ErrorAction SilentlyContinue
foreach ($c in $conns) {
  if ($c.OwningProcess -and $c.OwningProcess -ne 0) {
    Write-Output "Stopping existing process on port 8097 (PID $($c.OwningProcess)) ..."
    & taskkill.exe /F /T /PID $c.OwningProcess 2>&1 | Out-Null
  }
}

# Der Serverprozess sieht ausschliesslich die Zielkarte; sie traegt dort Index 0,
# weshalb -ngl 999 und die Default---main-gpu unveraendert korrekt bleiben.
# Start-Process laeuft ohne -UseNewEnvironment und erbt diese Zuweisung.
$env:CUDA_VISIBLE_DEVICES = $GpuUuid
$freeMiB = Get-FreeVramMiB -Uuid $GpuUuid
Write-Output "Starting gpt-oss-20b (MXFP4) on port 8097 ..."
Write-Output "  Model:     $Model"
Write-Output "  NGL:       $Ngl"
Write-Output "  Context:   $Ctx  (KV q8_0 => ~$([math]::Round($Ctx * 24 / 1024 / 1024, 2)) GB)"
Write-Output "  Free VRAM: $freeMiB MiB"
Write-Output "  GPU:       $GpuUuid"
if ($freeMiB -lt 13500) {
  Write-Output "  WARNUNG: unter 13500 MiB frei. Gewichte allein brauchen 12.11 GB."
  Write-Output "           Laeuft parallel ein Chat-Modell (Bonsai :8093 / Gemma :8091)? Dann"
  Write-Output "           eines davon beenden oder -Ctx reduzieren."
}

$Params = @(
  "-m", $Model
  "-c", "$Ctx"
  "-np", "1"
  "-ngl", $Ngl
  "-fa", "on"
  # KV-Quantisierung: q8_0 gilt als nahezu verlustfrei und halbiert den Cache
  # gegenueber f16. Beim Bonsai-Server wurde q8_0 gegen q4_0 gemessen und war in
  # BEIDEN Dimensionen besser (schneller UND hoehere Qualitaet) - siehe
  # start-bonsai-parallel.ps1.
  "-ctk", "q8_0"
  "-ctv", "q8_0"
  # --jinja: strukturierte tool_calls. gpt-oss nutzt das harmony-Format; die
  # Vorlage steckt im GGUF. Ohne --jinja liefert der Server keine tool_calls,
  # und genau darum geht es bei diesem Kandidaten.
  "--jinja"
  # --metrics: Prometheus-Endpoint auf /metrics. Ohne ihn ist der Durchsatz
  # nicht messbar - genau das hat die TQ2_0-CPU-Regression beim Bonsai-Server
  # (2026-07-23) unsichtbar gemacht.
  "--metrics"
  "--host", "0.0.0.0"
  "--port", "8097"
)

$logOut = Join-Path (Split-Path $Exe -Parent) "gptoss-out.log"
$logErr = Join-Path (Split-Path $Exe -Parent) "gptoss-err.log"
$p = Start-Process -FilePath $Exe -ArgumentList $Params -WindowStyle Hidden `
       -RedirectStandardOutput $logOut -RedirectStandardError $logErr -PassThru
"PID: $($p.Id)" | Out-File -FilePath (Join-Path (Split-Path $Exe -Parent) "gptoss.pid") -Encoding ascii

if (-not $NoWait) {
  $deadline = (Get-Date).AddSeconds(240)
  $healthy = $false
  while ((Get-Date) -lt $deadline) {
    Start-Sleep -Seconds 3
    if ($p.HasExited) { break }
    try {
      $r = Invoke-RestMethod -Uri 'http://127.0.0.1:8097/health' -TimeoutSec 2
      if ($r.status -eq 'ok') { $healthy = $true; break }
    } catch {}
  }

  if ($healthy) {
    Write-Output "gpt-oss-20b: PID $($p.Id) healthy on :8097"
    Write-Output "  VRAM danach: $(Get-FreeVramMiB -Uuid $GpuUuid) MiB frei"
    Write-Output ""
    Write-Output "Naechster Schritt - als Kandidat registrieren (priority 1, aendert das"
    Write-Output "Routing NICHT, Bonsai bleibt auf priority 0 scharf):"
    Write-Output "  bash scripts/factory/provider-register-gptoss.sh"
    Write-Output ""
    Write-Output "Dann A/B gegen echte Factory-Tickets:"
    Write-Output "  node scripts/factory/eval-replay.mjs --help"
  } elseif ($p.HasExited) {
    Write-Output "gpt-oss-20b FAILED: exited (code $($p.ExitCode)) - see $logErr"
    Get-Content $logErr -Tail 20
  } else {
    Write-Output "gpt-oss-20b WARNING: PID $($p.Id) laeuft, aber nach 240s nicht healthy - see $logErr"
  }
}
