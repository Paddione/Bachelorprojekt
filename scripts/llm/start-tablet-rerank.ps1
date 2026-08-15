<#
.SYNOPSIS
  Startet llama-server.exe mit bge-reranker-v2-m3 auf dem PK-Tablet (Port 8080).
.DESCRIPTION
  Rerank-Erstglied der llm-proxy-Kette (T006143, Design-Doc
  openspec/changes/2026-08-15-laptop-bge-topologie/design.md). Das
  Tablet hat eine Intel-Iris-iGPU (8 GB shared) - Beschleunigung laeuft
  ueber Vulkan (Standard-Build von llama.cpp), NICHT ueber LM Studio: LM
  Studio 0.4.21 hat keinen /v1/rerank-Endpoint. Die Modell-Datei wird von
  LM Studio heruntergeladen (Discover > bge-reranker-v2-m3, GGUF Q8_0) und
  von llama-server aus demselben Verzeichnis gelesen - ein Download, zwei
  Nutzer.

  AUFRUF:
    powershell -ExecutionPolicy Bypass -File C:\...\start-tablet-rerank.ps1

  AUTOSTART (Scheduled Task, AtLogOn, einmalig registrieren):
    Register-ScheduledTask -TaskPath '\BgeLaptops\' -TaskName 'TabletRerank' `
      -Action (New-ScheduledTaskAction -Execute 'powershell.exe' `
        -Argument '-ExecutionPolicy Bypass -File "<PFAD_ZU_DIESEM_SKRIPT>"') `
      -Trigger (New-ScheduledTaskTrigger -AtLogOn) -Force

  DEAKTIVIEREN/AKTIVIEREN (T002729-Muster, elevated):
    Disable-ScheduledTask -TaskPath '\BgeLaptops\' -TaskName 'TabletRerank'
    Enable-ScheduledTask  -TaskPath '\BgeLaptops\' -TaskName 'TabletRerank'

  FIREWALL (nur WG-Interface, einmalig, elevated):
    New-NetFirewallRule -DisplayName 'llama-server TabletRerank (WG only)' `
      -Direction Inbound -Action Allow -Protocol TCP -LocalPort 8080 `
      -InterfaceAlias 'wg-mesh' -ErrorAction SilentlyContinue

  WARUM -np 2: Iris-RAM ist geteilter Systemspeicher; jede Parallelitaet
  kostet direkt Budget. Flags gespiegelt von k3d/llm-gpu.yaml (bge-rerank).
#>

param(
  [int]$Port = 8080,
  [string]$ModelPath = "$env:USERPROFILE\.lmstudio\models\gpustack\bge-reranker-v2-m3-GGUF\bge-reranker-v2-m3-Q8_0.gguf"
)

$ErrorActionPreference = 'Stop'

$LlamaServer = Get-Command llama-server.exe -ErrorAction SilentlyContinue |
  Select-Object -First 1 -ExpandProperty Source
if (-not $LlamaServer) {
  throw "llama-server.exe nicht gefunden. Installation: winget install llama.cpp"
}

if (-not (Test-Path -LiteralPath $ModelPath)) {
  throw "Modell fehlt: $ModelPath - in LM Studio herunterladen (bge-reranker-v2-m3 GGUF Q8_0)"
}

$args = @(
  '-m', $ModelPath,
  '--host', '0.0.0.0',
  '--port', $Port,
  '--reranking',
  '-ngl', '99',
  '-b', '8192',
  '-ub', '8192',
  '-np', '2'
)

Write-Host "Starte llama-server fuer bge-reranker-v2-m3 auf Port $Port ..."
Start-Process -FilePath $LlamaServer -ArgumentList $args -NoNewWindow -Wait
