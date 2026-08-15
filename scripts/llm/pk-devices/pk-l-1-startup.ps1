# Startup-Script PK-L-1: Qwen3.5-4B Q6_K via LM Studio (Vulkan)
# =====================================================================
# Einmalige GUI-Voraussetzung: LM Studio -> Settings -> Hardware
# Acceleration -> Vulkan/iGPU aktivieren (seit 0.4.17 default-aus).
#
# Autostart-Einrichtung (einmalig, auf dem Laptop):
#   Win+R -> "shell:startup" -> Verknuepfung auf dieses Script legen
#   (oder Task Scheduler: Trigger "Bei Anmeldung", Aktion powershell.exe
#    -ExecutionPolicy Bypass -File <Pfad>\pk-l-1-startup.ps1)
#
# Modell-Download (einmalig): unsloth/Qwen3.5-4B-GGUF
#   Datei: Qwen3.5-4B-Q6_K.gguf (3,28 GiB)
#   https://hf.co/unsloth/Qwen3.5-4B-GGUF
#
# Settings: Context 32768, GPU Offload max (Vulkan), KV-Cache Q8_0,
#   Flash Attention Auto, Sampling temp 0.7 / top_p 0.8 / top_k 20 /
#   presence_penalty 1.5. Hinweis: Qwen3.5-GGUF laeuft NICHT in Ollama.
#   Bei Kauderwelsch-Output: KV-Cache-Typen auf bf16 stellen
#   (--cache-type-k bf16 --cache-type-v bf16, LM-Studio-Advanced-Feld).
# =====================================================================

$ErrorActionPreference = "Stop"

# An den tatsaechlichen Modell-Verzeichnisnamen in LM Studio anpassen
# (mit `lms ls` pruefen; -y bestaetigt Teilnamen-Matches automatisch).
$ModelId = "Qwen3.5-4B"

$lms = Join-Path $env:USERPROFILE ".lmstudio\bin\lms.exe"
if (-not (Test-Path $lms)) { $lms = "lms" }

Write-Host "[PK-L-1] Starte LM-Studio-Server auf Port 1234 (bind 0.0.0.0 fuer LM Link) ..."
& $lms server start --port 1234 --bind 0.0.0.0 -y
if ($LASTEXITCODE -ne 0) { Write-Warning "server start lieferte Exit $LASTEXITCODE (Server laeuft evtl. bereits)." }

Write-Host "[PK-L-1] Lade Qwen3.5-4B Q6_K (ctx 32768, GPU max) ..."
& $lms load $ModelId --gpu max --context-length 32768 -y
if ($LASTEXITCODE -ne 0) {
    Write-Warning "load lieferte Exit $LASTEXITCODE - Modell-ID pruefen: lms ls"
    exit 1
}

Write-Host "[PK-L-1] Fertig. Verifikation: http://localhost:1234/v1/models muss $ModelId enthalten."
