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
  [string]$LlamaDir = "C:\Users\PatrickKorczewski\llama-b10090-13.3"
)

$Exe = Join-Path $LlamaDir "llama-server.exe"
if (-not (Test-Path $Exe)) {
  Write-Error "llama-server.exe not found at: $Exe"
  exit 1
}

$Model = "C:\Users\PatrickKorczewski\.lmstudio\models\gpustack\bge-m3-GGUF\bge-m3-Q8_0.gguf"
if (-not (Test-Path $Model)) {
  Write-Error "Model not found at: $Model"
  exit 1
}

# T002275: stand hier als Ternary (cond ? a : b). Den gibt es erst ab
# PowerShell 7 - unter 5.1 (dem einzigen auf diesem Host installierten
# PowerShell) ist das ein Parse-Fehler: 'Unerwartetes Token "?"'. Das Skript
# war damit nie ausfuehrbar. if/else ist versionsunabhaengig.
$Ngl = "99"
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
  "-fa", "on"
  "--host", "0.0.0.0"
  "--port", "8095"
)

# Start as background job so the shell stays usable
$Job = Start-Job -ScriptBlock {
  param($Exe, $Params)
  & $Exe @Params
} -ArgumentList $Exe, $Params

Write-Host "Embedding server started (Job ID: $($Job.Id))"
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
