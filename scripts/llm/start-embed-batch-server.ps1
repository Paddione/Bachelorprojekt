<#
.SYNOPSIS
  Startet llama-server.exe im Embedding-Modus fuer bge-m3 als BATCH-Instanz (Port 8085).
.DESCRIPTION
  T002426 - Paar A ("batch"). Zweite, dauerhaft CPU-gebundene bge-m3-Instanz neben
  dem interaktiven Paar B auf :8095. Ihre Last ist das Nach-Embedden von Aenderungen
  in der Shared-DB und weiterer Produktions-Ressourcen; sie belegt bewusst KEIN VRAM.

  WARUM -ngl 0 HIER NICHT KONFIGURIERBAR IST:
  Der einzige Zweck dieses Paars ist, kein VRAM zu belegen, damit die Chat-Modelle
  (Gemma, gpt-oss, Devstral) Vorrang behalten. Ein per Umgebungsvariable versehentlich
  auf GPU gestarteter Batch-Server verletzt genau die Prioritaet, die dieser Vorgang
  herstellt. Das Bestandsskript start-embed-server.ps1 hat mit LLM_EMBED_NGL bewusst
  einen Rueckweg auf die GPU - dieses hier hat keinen.

  KEIN VRAM-Anpassungsflag: bei -ngl 0 waere es wirkungslos und wuerde den Eindruck
  erwecken, das Paar nehme am VRAM-Wettbewerb teil.

  T002260 - WARUM -b/-ub 8192 gesetzt sein MUSS:
  bge-m3 ist ein nicht-kausales Modell (XLM-RoBERTa). llama.cpp kann eine solche
  Sequenz NICHT ueber mehrere physische Batches aufteilen - jede Sequenz muss
  komplett in einen n_ubatch passen. Ohne -b/-ub gilt der Default n_ubatch=512,
  und der Server lehnt jeden laengeren Input ab.

  --pooling cls MUSS explizit gesetzt bleiben, sonst greift der GGUF-Modell-Default
  (Befund aus T002110) und die Vektoren weichen von den gespeicherten ab.
.PARAMETER LlamaDir
  Verzeichnis mit llama-server.exe. Default: C:\Users\PatrickKorczewski\llama-b10090-13.3
.EXAMPLE
  .\scripts\llm\start-embed-batch-server.ps1
#>

param(
  [string]$LlamaDir = "C:\Users\PatrickKorczewski\llama-b10090-13.3",
  [int]$Port = 8085,
  [switch]$NoWait
)

$Exe = Join-Path $LlamaDir "llama-server.exe"
if (-not (Test-Path $Exe)) {
  Write-Error "llama-server.exe not found at: $Exe"
  exit 1
}

# Bitgleich zum interaktiven Paar (T002319, SHA256 geprueft) - beide Paare muessen
# denselben Vektorraum erzeugen, sonst waere ein Failover zwischen ihnen sinnlos.
$Model = "F:\Embedding\bge-m3-Q8_0.gguf"
if (-not (Test-Path $Model)) {
  Write-Error "Model not found at: $Model"
  exit 1
}

Write-Host "Starting bge-m3 BATCH embedding server on port $Port (CPU only)..."
Write-Host "  Model: $Model"
Write-Host "  NGL:   0 (fest - dieses Paar belegt kein VRAM)"

$Params = @(
  "-m", $Model
  "--embedding"
  "--pooling", "cls"
  "--embd-normalize", "2"
  "-c", "8192"
  "-b", "8192"
  "-ub", "8192"
  # Fest. Siehe .DESCRIPTION - kein Override, kein Default mit Rueckweg.
  "-ngl", "0"
  # Batch-Last: mehrere Sequenzen gleichzeitig lohnen hier, anders als beim
  # interaktiven Paar, das pro Suchanfrage genau einen Text embedded.
  "--parallel", "4"
  "--host", "0.0.0.0"
  "--port", "$Port"
)

# Kein -fa: Flash Attention ist eine GPU-Optimierung und aendert auf der CPU nur
# die Rechenreihenfolge. Die bitgenaue Uebereinstimmung mit den gespeicherten
# Vektoren wiegt schwerer (T002319).

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
          -RedirectStandardOutput (Join-Path $logDir "embed-batch-out.log") `
          -RedirectStandardError  (Join-Path $logDir "embed-batch-err.log")
"PID: $($proc.Id)" | Out-File -FilePath (Join-Path $logDir "embed-batch.pid") -Encoding ascii

if (-not $NoWait) {
  Write-Host "Batch embedding server started (PID: $($proc.Id))"
  Write-Host "Endpoint: http://127.0.0.1:$Port/v1/embeddings"
  Write-Host ""
  Write-Host "Test (T002260 - MIT LANGTEXT pruefen, ein Kurztext bleibt auch bei"
  Write-Host "kaputtem -ub gruen und verdeckt die 512-Token-Kappung):"
  Write-Host '  $long = "kubernetes deployment reconciliation " * 120   # ~600+ Tokens'
  Write-Host '  $body = @{ model = "bge-m3"; input = @($long) } | ConvertTo-Json'
  Write-Host '  Invoke-RestMethod -Uri http://127.0.0.1:8085/v1/embeddings -Method Post `'
  Write-Host '    -ContentType application/json -Body $body | ForEach-Object { $_.data[0].embedding.Count }'
  Write-Host "  -> erwartet: 1024. HTTP 500 'too large to process' = -b/-ub fehlen."
}
