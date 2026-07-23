<#
.SYNOPSIS
  Startet llama-server.exe im Embedding-Modus für bge-m3 (Port 8095).
.DESCRIPTION
  Startet eine persistente llama.cpp-Instanz für Text-Embeddings (bge-m3 Q8_0)
  auf Port 8095. Der Server wird mit Flash Attention und GPU-Offload betrieben.
  VRAM-Notausstieg via Umgebungsvariable LLM_EMBED_NGL (Default 99).
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

$Ngl = [int]::TryParse([Environment]::GetEnvironmentVariable("LLM_EMBED_NGL"), [ref]$null) ? [Environment]::GetEnvironmentVariable("LLM_EMBED_NGL") : "99"

Write-Host "Starting bge-m3 embedding server on port 8095..."
Write-Host "  Model: $Model"
Write-Host "  NGL:   $Ngl"

$Params = @(
  "-m", $Model
  "--embedding"
  "--pooling", "cls"
  "--embd-normalize", "2"
  "-c", "8192"
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
Write-Host "Test: curl -s http://127.0.0.1:8095/v1/embeddings -H 'Content-Type: application/json' -d '{\"model\":\"bge-m3\",\"input\":[\"Hallo Welt\"]}'"
