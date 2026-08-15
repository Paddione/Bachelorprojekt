# download-quant.ps1 - laedt eine GGUF-Datei per curl auf ein PK-Geraet.
# Wird vom deploy-to-devices.sh bzw. manuell per ssh aufgerufen; als
# PS1-Datei gibt es kein cmd-Quoting-Problem (Argumente leerzeichenfrei).
#
# Aufruf auf dem Geraet:
#   powershell -NoProfile -ExecutionPolicy Bypass -File C:\pk-device\download-quant.ps1 -Url https://... -Dest C:\...\Modell.gguf
param(
    [Parameter(Mandatory=$true)][string]$Url,
    [Parameter(Mandatory=$true)][string]$Dest
)

$ErrorActionPreference = "Stop"

if (-not (Test-Path (Split-Path $Dest))) {
    New-Item -ItemType Directory -Force -Path (Split-Path $Dest) | Out-Null
}
Write-Host "Download: $Url"
Write-Host "Ziel: $Dest"
curl.exe -L --retry 3 -C - -o "$Dest" "$Url"
if ($LASTEXITCODE -ne 0) { Write-Host "FEHLER: curl Exit $LASTEXITCODE"; exit 1 }
$size = (Get-Item $Dest).Length
Write-Host "Fertig: $Dest ($size Bytes)"
