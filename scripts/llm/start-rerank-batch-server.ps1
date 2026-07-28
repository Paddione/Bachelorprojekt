<#
.SYNOPSIS
  Startet llama-server.exe im Rerank-Modus fuer bge-reranker-v2-m3 als BATCH-Instanz (Port 8086).
.DESCRIPTION
  T002426 - Paar A ("batch"). Zweite, dauerhaft CPU-gebundene Reranker-Instanz neben
  dem interaktiven Paar B auf :8096. Sie belegt bewusst KEIN VRAM.

  ZWEI PROZESSE SIND ZWINGEND: llama.cpp kann Embedding-Pooling (CLS) und
  Rerank-Pooling (RANK) nicht in einem Server bedienen. Deshalb steht dieses
  Skript neben start-embed-batch-server.ps1 und nicht darin.

  WARUM -ngl 0 HIER NICHT KONFIGURIERBAR IST:
  Der einzige Zweck dieses Paars ist, kein VRAM zu belegen, damit die Chat-Modelle
  Vorrang behalten. Ein per Umgebungsvariable versehentlich auf GPU gestarteter
  Batch-Server verletzt genau die Prioritaet, die dieser Vorgang herstellt.
  start-rerank-server.ps1 hat mit LLM_RERANK_NGL bewusst einen GPU-Rueckweg -
  dieses Skript hat keinen.

  T002260 - WARUM -b/-ub 8192 gesetzt sein MUSS:
  bge-reranker-v2-m3 ist ein Cross-Encoder auf XLM-RoBERTa, also nicht-kausal.
  Jedes Query+Dokument-Paar muss komplett in einen n_ubatch passen; ohne -b/-ub
  gilt der Default 512 und realistische Dokumente schlagen mit HTTP 500 fehl.
.PARAMETER LlamaDir
  Verzeichnis mit llama-server.exe. Default: C:\Users\PatrickKorczewski\llama-b10090-13.3
.EXAMPLE
  .\scripts\llm\start-rerank-batch-server.ps1
#>

param(
  [string]$LlamaDir = "C:\Users\PatrickKorczewski\llama-b10090-13.3",
  [int]$Port = 8086,
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

Write-Host "Starting bge-reranker-v2-m3 BATCH rerank server on port $Port (CPU only)..."
Write-Host "  Model: $Model"
Write-Host "  NGL:   0 (fest - dieses Paar belegt kein VRAM)"

$Params = @(
  "-m", $Model
  "--reranking"
  "-c", "8192"
  "-b", "8192"
  "-ub", "8192"
  # Fest. Siehe .DESCRIPTION - kein Override, kein Default mit Rueckweg.
  "-ngl", "0"
  # Batch-Last: mehrere Query+Dokument-Paare gleichzeitig.
  "--parallel", "4"
  "--host", "0.0.0.0"
  "--port", "$Port"
)

# Kein -fa: Flash Attention ist eine GPU-Optimierung, auf dem CPU-Pfad bringt sie
# nichts und macht den Aufruf nur schwerer mit dem GPU-Profil vergleichbar.

# Port raeumen - ein noch laufender Server auf diesem Port laesst den neuen
# still am Bind scheitern.
$conns = Get-NetTCPConnection -LocalPort $Port -State Listen -ErrorAction SilentlyContinue
foreach ($c in $conns) {
  if ($c.OwningProcess -and $c.OwningProcess -ne 0) {
    Write-Output "Stopping existing process on port $Port (PID $($c.OwningProcess)) ..."
    & taskkill.exe /F /T /PID $c.OwningProcess 2>&1 | Out-Null
  }
}

# Start-Process, nicht Start-Job (T002276): ein Job haengt an der PowerShell-Sitzung
# und stirbt mit ihr - Autostart waere damit strukturell unmoeglich.
$logDir = Split-Path $Exe -Parent
$proc = Start-Process -FilePath $Exe -ArgumentList $Params -WindowStyle Hidden -PassThru `
          -RedirectStandardOutput (Join-Path $logDir "rerank-batch-out.log") `
          -RedirectStandardError  (Join-Path $logDir "rerank-batch-err.log")
"PID: $($proc.Id)" | Out-File -FilePath (Join-Path $logDir "rerank-batch.pid") -Encoding ascii

if (-not $NoWait) {
  Write-Host "Batch rerank server started (PID: $($proc.Id))"
  Write-Host "Endpoint: http://127.0.0.1:$Port/v1/rerank"
  Write-Host ""
  Write-Host "Test (T002260 - mit LANGEM Dokument pruefen; Kurzdokumente bleiben"
  Write-Host "auch bei kaputtem -ub gruen):"
  Write-Host '  $long = "flux reconciles the oci artifact every ten minutes " * 100  # ~1200 Tokens'
  Write-Host '  $body = @{ query = "how often does flux reconcile"; documents = @($long, "apple pie recipe") } | ConvertTo-Json'
  Write-Host '  Invoke-RestMethod -Uri http://127.0.0.1:8086/v1/rerank -Method Post `'
  Write-Host '    -ContentType application/json -Body $body | ForEach-Object { $_.results }'
  Write-Host "  -> erwartet: index 0 vor index 1. HTTP 500 'too large to process' = -b/-ub fehlen."
}
