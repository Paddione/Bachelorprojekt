<#
.SYNOPSIS
  Startet llama-server.exe im Rerank-Modus für bge-reranker-v2-m3 (Port 8096).
.DESCRIPTION
  Startet eine persistente llama.cpp-Instanz für Text-Reranking (bge-reranker-v2-m3 Q8_0)
  auf Port 8096. Getrennter Prozess vom Embedding-Server, da llama.cpp Embedding-Pooling
  (CLS) und Rerank-Pooling (RANK) nicht in einem Server bedienen kann.
  VRAM-Notausstieg via Umgebungsvariable LLM_RERANK_NGL (Default 99).
.PARAMETER LlamaDir
  Verzeichnis mit llama-server.exe. Default: C:\Users\PatrickKorczewski\llama-b10090-13.3
.EXAMPLE
  .\scripts\llm\start-rerank-server.ps1
#>

param(
  [string]$LlamaDir = "C:\Users\PatrickKorczewski\llama-b10090-13.3"
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

$Ngl = [int]::TryParse([Environment]::GetEnvironmentVariable("LLM_RERANK_NGL"), [ref]$null) ? [Environment]::GetEnvironmentVariable("LLM_RERANK_NGL") : "99"

Write-Host "Starting bge-reranker-v2-m3 rerank server on port 8096..."
Write-Host "  Model: $Model"
Write-Host "  NGL:   $Ngl"

$Params = @(
  "-m", $Model
  "--reranking"
  "-c", "8192"
  "-ngl", $Ngl
  "-fa", "on"
  "--host", "0.0.0.0"
  "--port", "8096"
)

$Job = Start-Job -ScriptBlock {
  param($Exe, $Params)
  & $Exe @Params
} -ArgumentList $Exe, $Params

Write-Host "Rerank server started (Job ID: $($Job.Id))"
Write-Host "Endpoint: http://127.0.0.1:8096/v1/rerank"
Write-Host ""
Write-Host "Test: curl -s http://127.0.0.1:8096/v1/rerank -H 'Content-Type: application/json' -d '{\"model\":\"bge-reranker-v2-m3\",\"query\":\"capital of germany\",\"documents\":[\"paris\",\"berlin\",\"hamburg\",\"munich\"]}'"
