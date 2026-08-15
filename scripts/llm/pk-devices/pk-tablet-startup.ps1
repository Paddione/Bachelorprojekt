# Startup-Script PK-Tablet: Gemma 4 12B UD-IQ3_XXS via LM Studio (Vulkan)
# =====================================================================
# Einmalige GUI-Voraussetzung: LM Studio -> Settings -> Hardware
# Acceleration -> Vulkan/iGPU aktivieren (seit 0.4.17 default-aus).
#
# Autostart-Einrichtung (einmalig, auf dem Tablet):
#   Win+R -> "shell:startup" -> Verknuepfung auf dieses Script legen
#   (oder Task Scheduler: Trigger "Bei Anmeldung", Aktion powershell.exe
#    -ExecutionPolicy Bypass -File <Pfad>\pk-tablet-startup.ps1)
#
# Modell-Download (einmalig): unsloth/gemma-4-12b-it-GGUF
#   Datei: gemma-4-12b-it-UD-IQ3_XXS.gguf (4,32 GiB)
#   https://hf.co/unsloth/gemma-4-12b-it-GGUF
#
# Settings: Context 32768, GPU Offload max (Vulkan), KV-Cache Q8_0,
#   Flash Attention Auto, Sampling temp 1.0 / top_p 0.95 / top_k 64.
# =====================================================================

$ErrorActionPreference = "Stop"

# An den tatsaechlichen Modell-Verzeichnisnamen in LM Studio anpassen
# (mit `lms ls` pruefen; -y bestaetigt Teilnamen-Matches automatisch).
$ModelId = "gemma-4-12b-it"

$lms = Join-Path $env:USERPROFILE ".lmstudio\bin\lms.exe"
if (-not (Test-Path $lms)) { $lms = "lms" }

Write-Host "[PK-Tablet] Starte LM-Studio-Server auf Port 1234 (bind 0.0.0.0 fuer LM Link) ..."
& $lms server start --port 1234 --bind 0.0.0.0 -y
if ($LASTEXITCODE -ne 0) { Write-Warning "server start lieferte Exit $LASTEXITCODE (Server laeuft evtl. bereits)." }

Write-Host "[PK-Tablet] Lade Gemma 4 12B UD-IQ3_XXS (ctx 32768, GPU max) ..."
& $lms load $ModelId --gpu max --context-length 32768 -y
if ($LASTEXITCODE -ne 0) {
    Write-Warning "load lieferte Exit $LASTEXITCODE - Modell-ID pruefen: lms ls"
    exit 1
}

Write-Host "[PK-Tablet] Fertig. Verifikation: http://localhost:1234/v1/models muss $ModelId enthalten."
