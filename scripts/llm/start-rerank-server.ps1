<#
.SYNOPSIS
  Startet llama-server.exe im Rerank-Modus fuer bge-reranker-v2-m3 (Port 8096).
.DESCRIPTION
  Startet eine persistente llama.cpp-Instanz fuer Text-Reranking (bge-reranker-v2-m3 Q8_0)
  auf Port 8096. Getrennter Prozess vom Embedding-Server, da llama.cpp Embedding-Pooling
  (CLS) und Rerank-Pooling (RANK) nicht in einem Server bedienen kann.
  Laeuft seit T002337 im CPU-RAM (Default LLM_RERANK_NGL=0). GPU-Rueckweg fuer
  Massen-Reranking: LLM_RERANK_NGL=99.

  T002260 - WARUM -b/-ub 8192 gesetzt sein MUSS:
  bge-reranker-v2-m3 ist ein Cross-Encoder auf XLM-RoBERTa, also nicht-kausal.
  llama.cpp kann eine solche Sequenz NICHT ueber mehrere physische Batches
  aufteilen - jedes Query+Dokument-Paar muss komplett in einen n_ubatch passen.
  Ohne -b/-ub gilt der Default n_ubatch=512 und der Server antwortet:
    "input (1253 tokens) is too large to process.
     increase the physical batch size (current batch size: 512)"
  Gemessen 2026-07-27: ein Dokument von 4000 Zeichen (1253 Tokens) schlug fehl,
  1500 Zeichen gingen noch durch. Realistische Dokumente liegen also mitten in
  der Ausfallzone. Verschaerfend: website/src/lib/rerank.ts verschluckt Fehler und
  liefert dann still score: 0 - der Ausfall ist von aussen unsichtbar.
  Beim Aendern dieser Werte immer mit einem LANGEN Dokument nachpruefen.

  HEALTH-POLL-FENSTER: bis zu 240 Sekunden. Mit -NoWait kehrt das Skript sofort
  nach Start-Process zurueck und ueberspringt den Hinweistext.
.PARAMETER LlamaDir
  Verzeichnis mit llama-server.exe. Default: C:\Users\PatrickKorczewski\llama-b10090-13.3
.EXAMPLE
  .\scripts\llm\start-rerank-server.ps1
#>

param(
  [string]$LlamaDir = "C:\Users\PatrickKorczewski\llama-b10090-13.3",
  [int]$Port = 8096,
  [switch]$NoWait
)

$Exe = Join-Path $LlamaDir "llama-server.exe"
if (-not (Test-Path $Exe)) {
  Write-Error "llama-server.exe not found at: $Exe"
  exit 1
}

$Model = "C:\Users\PatrickKorczewski\.lmstudio\models\gpustack\bge-reranker-v2-m3-GGUF\bge-reranker-v2-m3-Q8_0.gguf"
if (-not (Test-Path $Model)) {
  Write-Error "Model not found at: $Model"
  exit 1
}

# T002275: stand hier als Ternary (cond ? a : b). Den gibt es erst ab
# PowerShell 7 - unter 5.1 (dem einzigen auf diesem Host installierten
# PowerShell) ist das ein Parse-Fehler: 'Unerwartetes Token "?"'. Das Skript
# war damit nie ausfuehrbar. if/else ist versionsunabhaengig.
# T002337: Default ist jetzt 0 - das Modell liegt im CPU-RAM statt im VRAM,
# genau wie bge-m3 seit T002319. Der Reranker blieb dabei versehentlich auf 99
# stehen; da der Autostart (bis T002551 install-startup-autostart.ps1) dieses
# Skript ARGUMENTLOS aufrief, holte sich jeder Autostart die GPU-Variante
# zurueck. Das kollidiert mit dem
# Gemma-Profil aus T002297 (-Ctx 262144), das mit rund 15,1 von 16,3 GiB fast
# das gesamte VRAM belegt und nur ~850 MiB Reserve laesst - zu wenig fuer
# bge-reranker-v2-m3 Q8_0 (~0,6 GB) daneben. Fuer Massen-Reranking, wo der
# Durchsatz zaehlt und Gemma nicht laeuft, ist LLM_RERANK_NGL=99 der Rueckweg.
$Ngl = "0"
if ($env:LLM_RERANK_NGL) { $Ngl = $env:LLM_RERANK_NGL }

Write-Host "Starting bge-reranker-v2-m3 rerank server on port 8096..."
Write-Host "  Model: $Model"
Write-Host "  NGL:   $Ngl"

$Params = @(
  "-m", $Model
  "--reranking"
  "-c", "8192"
  # T002260: logischer UND physischer Batch auf die volle Kontextlaenge.
  # Ohne -ub scheitert jedes Query+Dokument-Paar > 512 Tokens, s. .DESCRIPTION.
  "-b", "8192"
  "-ub", "8192"
  "-ngl", $Ngl
  "--host", "0.0.0.0"
  "--port", "$Port"
)

# T002337: Flash Attention nur mit GPU-Offload, analog start-embed-server.ps1.
# -fa ist eine GPU-Optimierung; auf dem CPU-Pfad bringt sie nichts und macht
# den Aufruf nur schwerer mit dem GPU-Profil vergleichbar. Anders als beim
# Embedder geht es hier NICHT um bitgenaue Reproduzierbarkeit - Rerank-Scores
# werden pro Anfrage berechnet und nirgends persistiert.
if ($Ngl -ne "0") { $Params += @("-fa", "on") }

# Port raeumen - ein noch laufender Server auf diesem Port laesst den neuen
# still am Bind scheitern.
$conns = Get-NetTCPConnection -LocalPort $Port -State Listen -ErrorAction SilentlyContinue
foreach ($c in $conns) {
  if ($c.OwningProcess -and $c.OwningProcess -ne 0) {
    Write-Output "Stopping existing process on port $Port (PID $($c.OwningProcess)) ..."
    & taskkill.exe /F /T /PID $c.OwningProcess 2>&1 | Out-Null
  }
}

# T002276: hier stand ein Job-basierter Start. Ein Job haengt an der
# PowerShell-SITZUNG - endet sie, stirbt der Server mit. Empirisch geprueft:
# nach Aufruf aus einer transienten Sitzung lief kein llama-server mehr und
# :8096 antwortete nicht. Damit war Autostart strukturell unmoeglich, denn eine
# Scheduled Task oder ein Startup-Eintrag beendet die Sitzung nach dem
# Skriptlauf. Start-Process erzeugt einen eigenstaendigen Prozess, der das
# Sitzungsende ueberlebt.
$logDir = Split-Path $Exe -Parent
$proc = Start-Process -FilePath $Exe -ArgumentList $Params -WindowStyle Hidden -PassThru `
          -RedirectStandardOutput (Join-Path $logDir "rerank-out.log") `
          -RedirectStandardError  (Join-Path $logDir "rerank-err.log")
"PID: $($proc.Id)" | Out-File -FilePath (Join-Path $logDir "rerank.pid") -Encoding ascii

if (-not $NoWait) {
  Write-Host "Rerank server started (PID: $($proc.Id))"
  Write-Host "Endpoint: http://127.0.0.1:8096/v1/rerank"
  Write-Host ""
  Write-Host ""
  Write-Host "Test (T002260 - mit LANGEM Dokument pruefen; Kurzdokumente wie"
  Write-Host "'paris'/'berlin' bleiben auch bei kaputtem -ub gruen):"
  Write-Host '  $long = "flux reconciles the oci artifact every ten minutes " * 100  # ~1200 Tokens'
  Write-Host '  $body = @{ query = "how often does flux reconcile"; documents = @($long, "apple pie recipe") } | ConvertTo-Json'
  Write-Host '  Invoke-RestMethod -Uri http://127.0.0.1:8096/v1/rerank -Method Post `'
  Write-Host '    -ContentType application/json -Body $body | ForEach-Object { $_.results }'
  Write-Host "  -> erwartet: index 0 vor index 1. HTTP 500 'too large to process' = -b/-ub fehlen."
}
