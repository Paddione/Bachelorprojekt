<#
.SYNOPSIS
  Startet llama-server.exe im Embedding-Modus fuer bge-m3 (Port 8095).
.DESCRIPTION
  Startet eine persistente llama.cpp-Instanz fuer Text-Embeddings (bge-m3 Q8_0)
  auf Port 8095. Der Server wird mit Flash Attention und GPU-Offload betrieben.
  VRAM-Notausstieg via Umgebungsvariable LLM_EMBED_NGL (Default 99).

  T002260 - WARUM -b/-ub 8192 gesetzt sein MUSS:
  bge-m3 ist ein nicht-kausales Modell (XLM-RoBERTa). llama.cpp kann eine solche
  Sequenz NICHT ueber mehrere physische Batches aufteilen - jede Sequenz muss
  komplett in einen n_ubatch passen. Ohne -b/-ub gilt der Default n_ubatch=512,
  und der Server lehnt jeden laengeren Input ab:
    "input (734 tokens) is too large to process.
     increase the physical batch size (current batch size: 512)"
  Das gesetzte -c 8192 hilft nicht: /props meldet n_ctx 8192, nutzbar sind 512.
  Gemessen 2026-07-27: 2000 Zeichen Code = 774 Tokens -> HTTP 500.
  Die abgeloeste TEI-Instanz konnte 8192 (max_position_embeddings 8194), der
  Cutover T002110 hatte die nutzbare Eingabelaenge also unbemerkt auf 512
  reduziert. Beim Aendern dieser Werte immer mit einem LANGTEXT nachpruefen -
  ein "Hallo Welt"-Smoke-Test bleibt in jedem Fall gruen.
.PARAMETER LlamaDir
  Verzeichnis mit llama-server.exe. Default: C:\Users\PatrickKorczewski\llama-b10090-13.3
.EXAMPLE
  .\scripts\llm\start-embed-server.ps1
#>

param(
  [string]$LlamaDir = "C:\Users\PatrickKorczewski\llama-b10090-13.3",
  [int]$Port = 8095
)

$Exe = Join-Path $LlamaDir "llama-server.exe"
if (-not (Test-Path $Exe)) {
  Write-Error "llama-server.exe not found at: $Exe"
  exit 1
}

# T002319: lag unter C:\Users\...\.lmstudio\. Modelle liegen jetzt auf F:\Embedding.
# Die Datei ist bitgleich (SHA256 geprueft), die Vektoren sind daher unveraendert:
# gemessen 2026-07-27 Cosine 1.00000000 und max. Abweichung 0.00e+00 je Dimension
# gegen den vorherigen Stand. Beide Indizes (code_embeddings, knowledge.chunks)
# bleiben damit gueltig.
$Model = "F:\Embedding\bge-m3-Q8_0.gguf"
if (-not (Test-Path $Model)) {
  Write-Error "Model not found at: $Model"
  exit 1
}

# T002275: stand hier als Ternary (cond ? a : b). Den gibt es erst ab
# PowerShell 7 - unter 5.1 (dem einzigen auf diesem Host installierten
# PowerShell) ist das ein Parse-Fehler: 'Unerwartetes Token "?"'. Das Skript
# war damit nie ausfuehrbar. if/else ist versionsunabhaengig.
# T002319: Default ist jetzt 0 - das Modell liegt im CPU-RAM statt im VRAM.
# bge-m3 Q8_0 braucht rund 0.6 GB; auf der GPU konkurriert es mit den
# Chat-Modellen, waehrend Query-Embeddings (ein Text pro Suchanfrage) auf der
# CPU schnell genug sind. Gemessen: 21 chunks/s auf CPU gegen 167 auf GPU.
# Fuer einen Voll-Reindex lohnt LLM_EMBED_NGL=99 - dann rechnet wieder die GPU.
$Ngl = "0"
if ($env:LLM_EMBED_NGL) { $Ngl = $env:LLM_EMBED_NGL }

Write-Host "Starting bge-m3 embedding server on port 8095..."
Write-Host "  Model: $Model"
Write-Host "  NGL:   $Ngl"

$Params = @(
  "-m", $Model
  "--embedding"
  "--pooling", "cls"
  "--embd-normalize", "2"
  "-c", "8192"
  # T002260: logischer UND physischer Batch auf die volle Kontextlaenge.
  # Ohne -ub scheitert jede Sequenz > 512 Tokens (Default n_ubatch), s. .DESCRIPTION.
  "-b", "8192"
  "-ub", "8192"
  "-ngl", $Ngl
  # T002319: nur EINE Sequenz gleichzeitig. Der Server bediente vorher vier
  # Slots parallel; das nuetzt beim Massen-Indexieren, nicht bei einzelnen
  # Suchanfragen - und teilt auf der CPU nur die Kerne unter den Slots auf.
  "--parallel", "1"
  "--host", "0.0.0.0"
  "--port", "$Port"
)

# T002319: Flash Attention nur mit GPU-Offload. Auf der CPU aendert -fa die
# Rechenreihenfolge; die bitgenaue Uebereinstimmung mit den bereits
# gespeicherten Vektoren wiegt schwerer als ein Mikro-Optimum. Verifiziert
# wurde der CPU-Pfad OHNE -fa (max. Abweichung 0.00e+00 gegen den GPU-Stand).
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

# Start as background job so the shell stays usable
# T002276: hier stand ein Job-basierter Start. Ein Job haengt an der
# PowerShell-SITZUNG - endet sie, stirbt der Server mit. Empirisch geprueft:
# nach Aufruf aus einer transienten Sitzung lief kein llama-server mehr und
# :8095 antwortete nicht. Damit war Autostart strukturell unmoeglich, denn eine
# Scheduled Task oder ein Startup-Eintrag beendet die Sitzung nach dem
# Skriptlauf. Start-Process erzeugt einen eigenstaendigen Prozess, der das
# Sitzungsende ueberlebt.
$logDir = Split-Path $Exe -Parent
$proc = Start-Process -FilePath $Exe -ArgumentList $Params -WindowStyle Hidden -PassThru `
          -RedirectStandardOutput (Join-Path $logDir "embed-out.log") `
          -RedirectStandardError  (Join-Path $logDir "embed-err.log")
"PID: $($proc.Id)" | Out-File -FilePath (Join-Path $logDir "embed.pid") -Encoding ascii

Write-Host "Embedding server started (PID: $($proc.Id))"
Write-Host "Endpoint: http://127.0.0.1:8095/v1/embeddings"
Write-Host ""
Write-Host ""
Write-Host "Test (T002260 - MIT LANGTEXT pruefen, ein Kurztext bleibt auch bei"
Write-Host "kaputtem -ub gruen und verdeckt die 512-Token-Kappung):"
Write-Host '  $long = "kubernetes deployment reconciliation " * 120   # ~600+ Tokens'
Write-Host '  $body = @{ model = "bge-m3"; input = @($long) } | ConvertTo-Json'
Write-Host '  Invoke-RestMethod -Uri http://127.0.0.1:8095/v1/embeddings -Method Post `'
Write-Host '    -ContentType application/json -Body $body | ForEach-Object { $_.data[0].embedding.Count }'
Write-Host "  -> erwartet: 1024. HTTP 500 'too large to process' = -b/-ub fehlen."
