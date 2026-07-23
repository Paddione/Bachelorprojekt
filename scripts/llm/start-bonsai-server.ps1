<#
.SYNOPSIS
  Startet llama-server.exe für Ternary-Bonsai-8B mit 4 parallelen Slots (Port 8093).
.DESCRIPTION
  Startet eine persistente llama.cpp-Instanz für Ternary-Bonsai-8B (TQ2_0) mit vier
  parallelen Dekodierungs-Slots (-np 4) auf Port 8093.
  Der Kontext (-c) muss pro Slot mindestens 32768 Token bieten für Factory-Prompts (~37k).
  Bei -np 4 ergibt sich -c >= 131072. Der tatsächliche Wert wird durch VRAM-Messung
  bestimmt — siehe Kommentar unten.
.PARAMETER LlamaDir
  Verzeichnis mit llama-server.exe. Default: C:\Users\PatrickKorczewski\llama-b10090-13.3
.EXAMPLE
  .\scripts\llm\start-bonsai-server.ps1
#>

param(
  [string]$LlamaDir = "C:\Users\PatrickKorczewski\llama-b10090-13.3"
)

$Exe = Join-Path $LlamaDir "llama-server.exe"
if (-not (Test-Path $Exe)) {
  Write-Error "llama-server.exe not found at: $Exe"
  exit 1
}

$Model = "C:\Users\PatrickKorczewski\.lmstudio\models\gpustack\Ternary-Bonsai-8B-TQ2_0.gguf"
if (-not (Test-Path $Model)) {
  Write-Error "Model not found at: $Model"
  exit 1
}

# ═══════════════════════════════════════════════════════════════════════
# VRAM-Messreihe für -c (2026-07-23)
#
# Nach Start der Embedding- (8095) und Rerank-Server (8096):
#   nvidia-smi.exe --query-gpu=memory.used,memory.free --format=csv
#
# RTX 5070 Ti: 16303 MiB total, Ziel ≤ 15000 MiB belegt (~1300 MiB Reserve)
#
# Messprotokoll (auszufüllen nach Messung):
#   -c 131072 → np 4 → ? MiB belegt
#   -c 196608 → np 4 → ? MiB belegt
#   -c 262144 → np 4 → ? MiB belegt
#
# Gewählter Wert: 131072 (konservativ, anpassen nach Messung)
#   Begründung: 131072 / 4 = 32768 Token pro Slot ≥ Factory-Prompts (~37k sind
#   nicht reine Eingabe — Chat-History overlappt, 32768 reicht für den aktiven Prompt)
#
# Rollback: -np 1 -c 65536
# ═══════════════════════════════════════════════════════════════════════
$ContextSize = 131072

Write-Host "Starting Ternary-Bonsai-8B server on port 8093 (4 slots)..."
Write-Host "  Model: $Model"
Write-Host "  Slots: 4"
Write-Host "  Context: $ContextSize ($($ContextSize / 4) per slot)"
Write-Host "  Cache RAM: 24576 MB"

$Params = @(
  "-m", $Model
  "-c", [string]$ContextSize
  "-np", "4"
  "--cache-ram", "24576"
  "-ngl", "99"
  "-fa", "on"
  "-ctk", "q4_0"
  "-ctv", "q4_0"
  "--jinja"
  "--temp", "0.7"
  "--top-p", "0.95"
  "--top-k", "20"
  "--min-p", "0"
  "--host", "0.0.0.0"
  "--port", "8093"
)

$Job = Start-Job -ScriptBlock {
  param($Exe, $Params)
  & $Exe @Params
} -ArgumentList $Exe, $Params

Write-Host "Bonsai server started (Job ID: $($Job.Id))"
Write-Host "Endpoint: http://127.0.0.1:8093/v1"
Write-Host ""
Write-Host "Test: curl -s http://127.0.0.1:8093/v1/models"
