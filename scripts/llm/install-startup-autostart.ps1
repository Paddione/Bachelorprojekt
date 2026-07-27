<#
.SYNOPSIS
  Richtet den Autostart der LLM-Server ueber den Windows-Startup-Ordner ein.
.DESCRIPTION
  Legt eine .cmd-Datei im Startup-Ordner des aktuellen Benutzers an, die beim
  Anmelden die Startskripte aufruft:
    start-embed-server.ps1   (bge-m3,             Port 8095)
    start-rerank-server.ps1  (bge-reranker-v2-m3, Port 8096)
    start-gemma-server.ps1   (Gemma 4 12B QAT,    Port 8091)

  WARUM NICHT SCHEDULED TASKS (T002276):
  Auf diesem Host schlaegt der Task-Weg aus drei Gruenden fehl, alle gemessen am
  2026-07-27:
    1. schtasks erlaubt fuer /tr maximal 261 Zeichen. Die Embed-Zeile brauchte
       262, die eines Chat-Servers 338 - beide wurden abgewiesen mit
       "FEHLER: Der Wert fuer die Option /tr darf nicht mehr als 261 Zeichen
       enthalten."
    2. Selbst ein kurzer Task (253 Zeichen) wurde als "ERFOLGREICH erstellt"
       gemeldet und war Minuten spaeter verschwunden. Nicht-elevated schlaegt die
       Erstellung direkt mit "Zugriff verweigert" fehl. Der Rechner ist
       AzureAD-gejoined und hat einen \Microsoft\Intune\-Taskordner, ist also
       MDM-verwaltet; eine Policy, die nicht freigegebene Tasks entfernt, ist die
       naheliegende Erklaerung.
    3. Die Startskripte starteten den Server mit Start-Job, was ihn an die
       PowerShell-Sitzung bindet - eine Task beendet die Sitzung nach dem
       Skriptlauf, der Server stirbt mit. Behoben im selben Ticket
       (Start-Process statt Start-Job); ohne diesen Fix wuerde auch der
       Startup-Ordner nichts nuetzen.

  UNTERSCHIED ZUM TASK-WEG: der Startup-Ordner laeuft bei der ANMELDUNG, nicht
  beim Systemstart, und im Benutzerkontext statt als SYSTEM. Fuer eine
  Einzelplatz-Workstation ist das ausreichend - die Modelle liegen ohnehin im
  Benutzerprofil, und die GPU wird interaktiv genutzt.

  UMFANG: Embedding, Rerank und Gemma - in dieser Reihenfolge. Gemma kam mit
  T002286 dazu, nachdem sein Startskript von "-fit on" auf den festen Deckel
  "-c 65536 -fit off" umgestellt wurde. Vorher nahm sich der Server ALLES freie
  VRAM und haette dem Embedding-Stack den Speicher weggenommen; jetzt ist sein
  Bedarf deterministisch (rund 13,0 GB von 16,3 GB, gemessen 2026-07-27), sodass
  bge-m3 und der Reranker mit zusammen ~1,7 GB daneben passen. Die Reihenfolge
  bleibt trotzdem embed -> rerank -> gemma: scheitert der groesste Brocken,
  steht der Embedding-Stack wenigstens.

  WEITERHIN NICHT IM AUTOSTART: gpt-oss-20b (:8097, 12,1 GB). Welches Chat-Modell
  die Factory nutzt, entscheidet tickets.factory_model_slots - zwei Chat-Server
  gleichzeitig passen nicht auf die Karte.
.PARAMETER Uninstall
  Entfernt den Startup-Eintrag wieder.
.PARAMETER RepoRoot
  Wurzel des Repos aus Windows-Sicht. Default ist der UNC-Pfad in WSL.
.EXAMPLE
  .\scripts\llm\install-startup-autostart.ps1
.EXAMPLE
  .\scripts\llm\install-startup-autostart.ps1 -Uninstall
#>

param(
  [switch]$Uninstall,
  [string]$RepoRoot = '\\wsl$\k3d-dev\home\patrick\Bachelorprojekt'
)

$startupDir = [Environment]::GetFolderPath('Startup')
$shim = Join-Path $startupDir 'llm-stack-autostart.cmd'

if ($Uninstall) {
  if (Test-Path $shim) {
    Remove-Item $shim -Force
    Write-Output "Entfernt: $shim"
  } else {
    Write-Output "Nichts zu entfernen - $shim existiert nicht."
  }
  exit 0
}

$llmDir = Join-Path $RepoRoot 'scripts\llm'
if (-not (Test-Path $llmDir)) {
  Write-Output "FAILED: $llmDir nicht erreichbar."
  Write-Output "  - laeuft WSL?            'wsl -l -v'"
  Write-Output "  - anderer Distro-Name?   'wsl -l -q', dann -RepoRoot anpassen"
  exit 1
}

# Der Shim ist eine .cmd, weil der Startup-Ordner .cmd direkt ausfuehrt und
# damit kein Umweg ueber eine .lnk mit Zielpfad-Escaping noetig ist.
# -WindowStyle Hidden, damit beim Anmelden kein Fenster aufpoppt; die
# Startskripte protokollieren selbst in <build>\*-out.log / *-err.log.
$scripts = @('start-embed-server.ps1', 'start-rerank-server.ps1', 'start-gemma-server.ps1')
$lines = @(
  '@echo off',
  'rem Erzeugt von scripts/llm/install-startup-autostart.ps1 [T002276].',
  'rem Nicht von Hand editieren - Aenderungen gehen beim naechsten Lauf verloren.',
  'rem Entfernen: install-startup-autostart.ps1 -Uninstall'
)
foreach ($s in $scripts) {
  $full = Join-Path $llmDir $s
  $lines += ('powershell.exe -NoProfile -ExecutionPolicy Bypass -WindowStyle Hidden -File "{0}"' -f $full)
}

Set-Content -Path $shim -Value $lines -Encoding ascii
Write-Output "Angelegt: $shim"
Write-Output ""
Get-Content $shim | ForEach-Object { Write-Output "  $_" }
Write-Output ""
Write-Output "Wirksam ab der naechsten Anmeldung. Sofort testen ohne Neustart:"
Write-Output "  & '$shim'"
Write-Output ""
Write-Output "Danach verifizieren - /health allein genuegt NICHT, der Embed-Server"
Write-Output "antwortet auch bei fehlendem -b/-ub mit 200 (T002260). Langtext:"
Write-Output '  $long = "kubernetes deployment reconciliation " * 120'
Write-Output '  $body = @{ model = "bge-m3"; input = @($long) } | ConvertTo-Json'
Write-Output '  Invoke-RestMethod -Uri http://127.0.0.1:8095/v1/embeddings -Method Post `'
Write-Output '    -ContentType application/json -Body $body | ForEach-Object { $_.data[0].embedding.Count }'
Write-Output "  -> erwartet: 1024"
