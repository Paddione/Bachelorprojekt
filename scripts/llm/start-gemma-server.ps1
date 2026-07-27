<#
.SYNOPSIS
  Startet llama-server.exe fuer Gemma 4 12B QAT mit MTP-Draft-Head (Port 8091).
.DESCRIPTION
  Chat-Modell fuer die Factory-Phasen plan/implement/verify. Die
  Routing-Entscheidung faellt NICHT hier, sondern in tickets.factory_model_slots
  bzw. tickets.provider_config (siehe
  scripts/migrations/2026-07-27-llm-proxy-gemma-backend.sql). Dieses Skript
  startet nur den Server.

  HERKUNFT (T002277): das Skript lag bis 2026-07-27 unversioniert als
  %UserProfile%\.lmstudio\start-gemma4-12b-mtp.ps1 auf dem Host und war damit
  weder reviewbar noch reproduzierbar. Uebernommen wurden die Parameter
  unveraendert; ergaenzt wurden Existenzpruefungen, der Health-Poll und der
  VRAM-Hinweis, analog zu start-gptoss-server.ps1.

  WARUM KEIN AUTOSTART: install-startup-autostart.ps1 startet bewusst nur
  Embedding und Rerank. Gemma laeuft mit "-fit on" und nimmt sich ALLES freie
  VRAM (siehe unten) - wuerde es beim Anmelden vor dem Embedding-Stack starten,
  bliebe fuer bge-m3 und den Reranker nichts uebrig. Dieses Skript wird deshalb
  von Hand aufgerufen, nachdem :8095 und :8096 stehen.

  WARUM KEIN EXPLIZITES -c: ohne -c bleibt n_ctx "unset", und --fit (Default on)
  laedt n_ctx_train (262144) und verkleinert ihn so weit, bis er mit -fitt MiB
  Reserve ins VRAM passt. Ein gesetztes -c wuerde das Fitting abschalten.
  -fitc 32768 ist die Untergrenze: passt nicht mindestens so viel Kontext,
  scheitert der Start hart, statt still auf 4096 zu fallen. Die Factory fuellt
  31-37k Tokens pro Prompt - unter 32768 waere der Server fuer sie nutzlos.

  WARUM DER FORK-BUILD: --spec-type draft-mtp gibt es nur im
  llama-bonsai-cuda13.3-Build, nicht im Upstream-Release b10090, das Embedding
  und Rerank verwenden. Gemma bringt einen Multi-Token-Prediction-Head mit; ihn
  als Draft-Modell zu nutzen ist billiger als ein separates kleines Draft-Modell,
  weil der Head ohnehin Teil der Gewichte ist. Gemessen 2026-07-27:
  ~157 Tokens/s bei 69 Prozent Draft-Akzeptanz (draft_n_accepted 36 / draft_n 52).

  ACHTUNG REASONING-CONTENT: mit --jinja antwortet Gemma 4 als Reasoning-Modell.
  llama.cpp legt den Denkteil in reasoning_content, waehrend content LEER bleibt,
  bis das Denken abgeschlossen ist. Bei zu knappem max_tokens kommt deshalb eine
  Antwort mit leerem content und finish_reason=length zurueck - kein Fehler, aber
  auch kein Ergebnis. Gemessen: max_tokens 64 liefert leeren content, 512 liefert
  "Berlin". Wer Clients gegen diesen Server baut, muss das Budget entsprechend
  bemessen.
.PARAMETER LlamaDir
  Verzeichnis mit dem Fork-Build. Default: C:\Users\PatrickKorczewski\llama-bonsai-cuda13.3
.PARAMETER Port
  Listen-Port. Default 8091 (so in tickets.llm_proxy_backends registriert).
.EXAMPLE
  .\scripts\llm\start-gemma-server.ps1
#>

param(
  [string]$LlamaDir = "C:\Users\PatrickKorczewski\llama-bonsai-cuda13.3",
  [int]$Port = 8091
)

# Bei diesem Build liegt llama-server.exe in \bin, nicht flach im Root.
$Exe = Join-Path $LlamaDir "bin\llama-server.exe"
if (-not (Test-Path $Exe)) { $Exe = Join-Path $LlamaDir "llama-server.exe" }
if (-not (Test-Path $Exe)) {
  Write-Error "llama-server.exe not found under: $LlamaDir"
  exit 1
}

$ModelDir = "$env:UserProfile\.lmstudio\models\unsloth\gemma-4-12B-it-qat-UD-Q4_K_XL"
$Model   = Join-Path $ModelDir "gemma-4-12B-it-qat-UD-Q4_K_XL.gguf"
$MtpHead = Join-Path $ModelDir "mtp-gemma-4-12b-it-Q8_0.gguf"

if (-not (Test-Path $Model)) {
  Write-Error "Model not found at: $Model"
  Write-Output "  hf download unsloth/gemma-4-12B-it-qat-UD-Q4_K_XL --local-dir $ModelDir"
  exit 1
}
if (-not (Test-Path $MtpHead)) {
  Write-Error "MTP draft head not found at: $MtpHead"
  Write-Output "  Ohne den Head kann --spec-type draft-mtp nicht starten."
  exit 1
}

# Port raeumen - ein noch laufender Server auf diesem Port laesst den neuen
# still am Bind scheitern.
$conns = Get-NetTCPConnection -LocalPort $Port -State Listen -ErrorAction SilentlyContinue
foreach ($c in $conns) {
  if ($c.OwningProcess -and $c.OwningProcess -ne 0) {
    Write-Output "Stopping existing process on port $Port (PID $($c.OwningProcess)) ..."
    & taskkill.exe /F /T /PID $c.OwningProcess 2>&1 | Out-Null
  }
}

$freeMiB = [int](& nvidia-smi --query-gpu=memory.free --format=csv,noheader,nounits).Trim()
Write-Output "Starting Gemma 4 12B QAT + MTP head on port $Port (auto-fit context, Q8_0 KV, 1 slot) ..."
Write-Output "  Model:     $Model"
Write-Output "  MTP head:  $MtpHead"
Write-Output "  Free VRAM: $freeMiB MiB"
if ($freeMiB -lt 9000) {
  Write-Output "  WARNUNG: unter 9000 MiB frei. Die Gewichte allein brauchen ~7.4 GB,"
  Write-Output "           dazu der MTP-Head (~0.5 GB) und mindestens 32768 Tokens KV."
  Write-Output "           Laeuft parallel ein anderes Chat-Modell (gpt-oss :8097)? Dann beenden."
}
if ($freeMiB -gt 15000) {
  Write-Output "  HINWEIS: sehr viel VRAM frei - laufen bge-m3 (:8095) und der Reranker"
  Write-Output "           (:8096) ueberhaupt? '-fit on' nimmt sich sonst deren Speicher mit."
}

$Params = @(
  "-m", $Model
  # Speculative Decoding ueber den mitgelieferten MTP-Head. -n-max 2 heisst:
  # hoechstens 2 Tokens vorausraten, bevor das Hauptmodell verifiziert.
  "--spec-type", "draft-mtp"
  "--spec-draft-model", $MtpHead
  "--spec-draft-n-max", "2"
  "-ngl", "999"
  # Ein einziger Slot - sonst gilt n_parallel=auto=4 und der Kontext wird
  # geviertelt. Der llm-proxy serialisiert ohnehin per Semaphor
  # (tickets.llm_proxy_backends.max_inflight, Default 1).
  "-np", "1"
  # KV q8_0: praktisch verlustfrei, halbiert den Cache gegenueber f16 und
  # verdoppelt damit den Kontext, den "-fit" unterbringt.
  "--cache-type-k", "q8_0"
  "--cache-type-v", "q8_0"
  "-fit", "on"
  "-fitt", "1024"
  "-fitc", "32768"
  # --jinja: strukturierte tool_calls aus der im GGUF hinterlegten Vorlage.
  # Ohne sie liefert der Server keine tool_calls - fuer die Factory unbrauchbar.
  "--jinja"
  "--host", "0.0.0.0"
  "--port", "$Port"
)

$logDir = Split-Path $Exe -Parent
$logOut = Join-Path $logDir "gemma4-12b-mtp-out.log"
$logErr = Join-Path $logDir "gemma4-12b-mtp-err.log"
Remove-Item $logOut -ErrorAction SilentlyContinue
Remove-Item $logErr -ErrorAction SilentlyContinue

# T002276: Start-Process statt Start-Job. Ein Job haengt an der PowerShell-
# SITZUNG - endet sie, stirbt der Server mit.
$p = Start-Process -FilePath $Exe -ArgumentList $Params -WindowStyle Hidden -PassThru `
       -RedirectStandardOutput $logOut -RedirectStandardError $logErr
"PID: $($p.Id)" | Out-File -FilePath (Join-Path $logDir "gemma4-12b-mtp.pid") -Encoding ascii

$deadline = (Get-Date).AddSeconds(240)
$healthy = $false
while ((Get-Date) -lt $deadline) {
  Start-Sleep -Seconds 3
  if ($p.HasExited) { break }
  try {
    $r = Invoke-RestMethod -Uri "http://127.0.0.1:$Port/health" -TimeoutSec 2
    if ($r.status -eq 'ok') { $healthy = $true; break }
  } catch {}
}

if ($healthy) {
  Write-Output "Gemma 4 12B: PID $($p.Id) healthy on :$Port"
  Write-Output "  VRAM danach: $((& nvidia-smi --query-gpu=memory.free --format=csv,noheader,nounits).Trim()) MiB frei"
  Write-Output ""
  Write-Output "Der llm-proxy (:18235) findet den Server ueber die Registry und den Alias"
  Write-Output "'gemma-4-12b'. Laeuft er nicht, aus WSL heraus starten:"
  Write-Output "  task llm:proxy:start        # oder: systemctl --user start llm-proxy"
  Write-Output ""
  Write-Output "Smoke-Test MIT ausreichendem Budget (max_tokens 64 liefert wegen"
  Write-Output "reasoning_content einen LEEREN content, siehe .DESCRIPTION):"
  Write-Output '  $b = @{ model = "gemma-4-12b"; max_tokens = 512;'
  Write-Output '          messages = @(@{ role = "user"; content = "Hauptstadt von Deutschland?" }) } | ConvertTo-Json -Depth 5'
  Write-Output '  Invoke-RestMethod -Uri http://127.0.0.1:18235/v1/chat/completions -Method Post `'
  Write-Output '    -ContentType application/json -Body $b | ForEach-Object { $_.choices[0].message.content }'
} elseif ($p.HasExited) {
  Write-Output "Gemma 4 12B FAILED: exited (code $($p.ExitCode)) - see $logErr"
  Get-Content $logErr -Tail 20
} else {
  Write-Output "Gemma 4 12B WARNING: PID $($p.Id) laeuft, aber nach 240s nicht healthy - see $logErr"
}
