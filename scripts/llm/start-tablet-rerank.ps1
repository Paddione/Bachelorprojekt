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
  # Optionaler Schalter -NoWait: Server starten und sofort zurueckkehren (T002339).

  AUTOSTART (Scheduled Task, AtLogOn, einmalig registrieren):
    Register-ScheduledTask -TaskPath '\BgeLaptops\' -TaskName 'TabletRerank' `
      -Action (New-ScheduledTaskAction -Execute 'powershell.exe' `
        -Argument '-ExecutionPolicy Bypass -File "<PFAD_ZU_DIESEM_SKRIPT>"') `
      -Trigger (New-ScheduledTaskTrigger -AtLogOn) -Force

  DEAKTIVIEREN/AKTIVIEREN (T002729-Muster, elevated):
    Disable-ScheduledTask -TaskPath '\BgeLaptops\' -TaskName 'TabletRerank'
    Enable-ScheduledTask  -TaskPath '\BgeLaptops\' -TaskName 'TabletRerank'

  FIREWALL (nur Mesh-Subnetz, einmalig, elevated):
    New-NetFirewallRule -DisplayName 'llama-server TabletRerank (WG only)' `
      -Direction Inbound -Action Allow -Protocol TCP -LocalPort 8080 `
      -RemoteAddress 192.168.100.0/24 -ErrorAction SilentlyContinue
    # Scope per Mesh-Subnetz statt InterfaceAlias: WireGuard fuer Windows
    # benennt den Adapter nach dem Tunnel (pk-tablet), ein 'wg-mesh'-Alias
    # existiert nicht. Die alte Regel band wirkungslos (SilentlyContinue
    # verdeckte den Fehler), waehrend der Server auf 0.0.0.0:8080 lauschte.

  WARUM -np 2: Iris-RAM ist geteilter Systemspeicher; jede Parallelitaet
  kostet direkt Budget. Flags gespiegelt von k3d/llm-gpu.yaml (bge-rerank).
#>

param(
  [int]$Port = 8080,
  [string]$ModelPath = "$env:USERPROFILE\.lmstudio\models\gpustack\bge-reranker-v2-m3-GGUF\bge-reranker-v2-m3-Q8_0.gguf",
  [switch]$NoWait
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

# Port raeumen - ein noch laufender Server auf diesem Port laesst den neuen
# still am Bind scheitern (T002288).
$conns = Get-NetTCPConnection -LocalPort $Port -State Listen -ErrorAction SilentlyContinue
foreach ($c in $conns) {
  if ($c.OwningProcess -and $c.OwningProcess -ne 0) {
    Write-Output "Stopping existing process on port $Port (PID $($c.OwningProcess)) ..."
    & taskkill.exe /F /T /PID $c.OwningProcess 2>&1 | Out-Null
  }
}

Write-Host "Starte llama-server fuer bge-reranker-v2-m3 auf Port $Port ..."
$p = Start-Process -FilePath $LlamaServer -ArgumentList $args -NoNewWindow -PassThru

# Mit -NoWait starten und sofort zurueckkehren; ohne -NoWait bis zum
# Ende des Servers warten (Scheduled-Task-Muster, T002339).
if (-not $NoWait) {
  $p.WaitForExit()
}
