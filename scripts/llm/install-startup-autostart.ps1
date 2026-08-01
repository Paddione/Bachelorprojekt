<#
.SYNOPSIS
  Richtet den Autostart der LLM-Server ueber den Windows-Startup-Ordner ein.
.DESCRIPTION
  Legt eine .cmd-Datei im Startup-Ordner des aktuellen Benutzers an, die beim
  Anmelden die Startskripte aufruft:
    start-embed-server.ps1   (bge-m3,             Port 8095)
    start-rerank-server.ps1  (bge-reranker-v2-m3, Port 8096)


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

   UMFANG seit T002459: nur noch Embedding und Rerank - Gemma laeuft ueber den Linux-Loadout-Stack (siehe Kommentar ueber `$startups` weiter unten fuer den Rollback-Pfad).


  WEITERHIN NICHT IM AUTOSTART: gpt-oss-20b (:8097, 12,1 GB). Welches Chat-Modell
  die Factory nutzt, entscheidet tickets.factory_model_slots - zwei Chat-Server
  gleichzeitig passen nicht auf die Karte.
.PARAMETER Uninstall
  Entfernt den Startup-Eintrag wieder.
.PARAMETER Watchdog
  Haengt nach den Server-Zeilen den Watchdog an den Shim (T002335). Der Autostart
  startet die Server nur EINMAL; stirbt danach einer, bleibt er ohne Watchdog tot.
.PARAMETER WatchdogOnly
  Schreibt einen Shim, der ausschliesslich den Watchdog startet. Sinnvoll, wenn die
  Server anders hochkommen (manuell, anderes Profil) und nur die Aufsicht fehlt.
.PARAMETER RepoRoot
  Wurzel des Repos aus Windows-Sicht. Default ist der UNC-Pfad in WSL.
.EXAMPLE
  .\scripts\llm\install-startup-autostart.ps1
.EXAMPLE
  .\scripts\llm\install-startup-autostart.ps1 -Uninstall
#>

param(
  [switch]$Uninstall,
  [switch]$Watchdog,
  [switch]$WatchdogOnly,
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
  # T002335: Den Shim zu loeschen beendet keinen bereits laufenden Watchdog - er
  # haengt an keinem Startup-Eintrag mehr, laeuft aber weiter und wuerde Server
  # neu starten, die man gerade abschalten wollte.
  $watchdogScript = Join-Path (Join-Path $RepoRoot 'scripts\llm') 'watchdog-llm-servers.ps1'
  if (Test-Path $watchdogScript) {
    & powershell.exe -NoProfile -ExecutionPolicy Bypass -File $watchdogScript -Uninstall
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
# Reihenfolge ist Absicht (T002286): scheitert Gemma - der groesste Brocken -,
# steht der Embedding-Stack trotzdem. Args je Eintrag seit T002297, weil Gemma
# sonst die Skript-Defaults bekaeme (-Ctx 65536, -KvType q4_0) statt des
# gemessenen Max-Kontext-Profils. Embed und Rerank brauchen keine Argumente,
# ihre Flags (-b/-ub 8192, --pooling cls) stehen in den Startskripten selbst.
#
# WARUM 262144/q8_0/1 Slot (T002297), alles am 2026-07-27 gemessen:
#   - 262144 ist n_ctx_train, das harte Modell-Maximum. Darueber warnt
#     llama.cpp und nutzt es nicht.
#   - q8_0 statt q4_0: schneller (146,9 vs 138,0 t/s) und praktisch verlustfrei.
#     Der 4-Bit-Umweg (T002296) diente nur dazu, VRAM fuer den mmproj-Tower
#     freizuraeumen - bei einem Slot ist der Platz auch mit 8 Bit da.
#   - 1 Slot: maximaler Praefix-Reuse (T002286), und mehrere Slots teilen sich
#     mit -kvu ohnehin denselben Pool.
# GEMMA FEHLT SEIT T002459 BEWUSST: der Autostart startet Gemma nicht mehr.
# Gemma laeuft als Loadout ('gemma-factory'/'gemma-multiagent') im
# Linux-llm-proxy mit nativem 'systemd Restart=on-failure' (design.md D3).
# ROLLBACK (design.md D5): Cutover-Commit per 'git revert' zurueckdrehen
# und danach den Shim neu erzeugen ('.\scripts\llm\install-startup-autostart.ps1').
$startups = @(
  @{ Script = 'start-embed-server.ps1';  Arguments = '' },
  @{ Script = 'start-rerank-server.ps1'; Arguments = '' },
  # T002489: Paar A (Batch, CPU) fehlte hier, obwohl der Watchdog es laengst
  # ueberwacht (T002426). Folge: nach jedem Neustart lief nur Paar B, und der
  # bge-Router fiel bei jeder Reindex-Last still auf das interaktive Paar
  # zurueck - genau die Konkurrenz, die die Paartrennung vermeiden soll.
  # Die Batch-Eintraege standen bis T002459 VOR dem Gemma-Eintrag, weil beide
  # CPU-only sind und ein scheiterndes Gemma den bge-Stack nicht mitreissen
  # sollte. Gemma ist hier seit T002459 weg (Linux-Loadout, siehe oben); die
  # Reihenfolge bleibt, damit der bge-Stack zuerst steht.
  @{ Script = 'start-embed-batch-server.ps1';  Arguments = '' },
  @{ Script = 'start-rerank-batch-server.ps1'; Arguments = '' }
)
$lines = @(
  '@echo off',
  'rem Erzeugt von scripts/llm/install-startup-autostart.ps1 [T002276].',
  'rem Nicht von Hand editieren - Aenderungen gehen beim naechsten Lauf verloren.',
  'rem Entfernen: install-startup-autostart.ps1 -Uninstall'
)
if (-not $WatchdogOnly) {
  foreach ($s in $startups) {
    # T002264 als Mahnung: dort wurde $Task.Expr statt $Task.Exe gelesen, ein Key
    # dieses Namens existierte nicht, und PowerShell lieferte still $null - alle
    # Tasks bekamen ein leeres Executable. Deshalb hier fail-loud statt Vertrauen.
    if (-not $s.ContainsKey('Script') -or -not $s.ContainsKey('Arguments')) {
      Write-Error "Startup-Eintrag ohne Script/Arguments-Key: $($s | Out-String)"
      exit 1
    }
    $full = Join-Path $llmDir $s.Script
    $line = 'powershell.exe -NoProfile -ExecutionPolicy Bypass -WindowStyle Hidden -File "{0}"' -f $full
    if ($s.Arguments -ne '') { $line += ' ' + $s.Arguments }
    $lines += $line
  }
}

# T002335: Der Watchdog ist eine Endlosschleife. Ohne 'start /B' wuerde der Shim
# an dieser Zeile stehen bleiben und - im WatchdogOnly-Fall irrelevant, sonst
# fatal - nachfolgende Zeilen nie erreichen. Deshalb NICHT -NoLoop uebergeben:
# genau die Endlosschleife ist der Zweck.
if ($Watchdog -or $WatchdogOnly) {
  $watchdogScript = Join-Path $llmDir 'watchdog-llm-servers.ps1'
  if (-not (Test-Path $watchdogScript)) {
    Write-Error "Watchdog-Skript nicht gefunden: $watchdogScript"
    exit 1
  }
  $lines += 'rem Watchdog [T002335] - startet tote Server neu. start /B, weil Endlosschleife.'
  $lines += ('start /B powershell.exe -NoProfile -ExecutionPolicy Bypass -WindowStyle Hidden -File "{0}" -PollSeconds 60' -f $watchdogScript)
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
