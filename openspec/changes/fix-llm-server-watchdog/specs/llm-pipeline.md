## ADDED Requirements

### Requirement: Watchdog hält die LLM-Server des GPU-Hosts am Leben

The LLM stack SHALL be supervised by a watchdog process that detects a dead server
and restarts it, rather than relying on the login-time autostart alone. The autostart
shim starts each server exactly once; a server that dies afterwards — VRAM exhaustion,
driver reset, a crash while loading an oversized prompt — stays dead until a human
notices. No Scheduled Task under `\Llama\` exists to observe this: the host is
AzureAD-joined and MDM-managed, and tasks created there are silently removed.

The watchdog SHALL treat a server as dead only when its HTTP health endpoint fails.
A healthy `/health` response without a matching TCP listener SHALL produce a warning
and no restart, because that combination describes a server still in its start-up
window — restarting it would create the very outage the watchdog exists to prevent.

The watchdog SHALL start servers with `Start-Process`, never `Start-Job`. A job is
bound to the PowerShell session that created it and dies with it.

The watchdog SHALL exit non-zero only when every supervised server is dead. A single
failed server is the ordinary case the watchdog has just repaired and MUST NOT be
signalled as a stack-wide failure.

#### Scenario: Ein gestorbener Server wird neu gestartet

- **GIVEN** der Watchdog überwacht bge-m3 (`:8095`), den Reranker (`:8096`) und Gemma (`:8091`)
- **WHEN** einer der Server nicht mehr auf `GET localhost:<port>/health` mit `status == "ok"` antwortet
- **THEN** räumt der Watchdog den Port, ruft das zugehörige Startskript per `Start-Process`
  auf, wartet bis zu 240 Sekunden auf Health und protokolliert alte PID, Grund und neue PID

#### Scenario: Gesunder Server ohne Listener-Eintrag wird nicht angetastet

- **GIVEN** ein Server antwortet auf `/health` mit `status == "ok"`
- **WHEN** `Get-NetTCPConnection` für seinen Port noch keinen lauschenden Prozess führt
- **THEN** schreibt der Watchdog eine WARN-Zeile und startet den Server **nicht** neu

#### Scenario: Log-Ausgabe verlässt den Datenpfad der Funktionen

- **GIVEN** die Log-Funktion des Watchdogs schreibt Zeilen, während sie aus einer
  Funktion aufgerufen wird, die einen Zählwert zurückgibt
- **WHEN** der Aufrufer diesen Rückgabewert mit der Anzahl der Server vergleicht
- **THEN** enthält der Rückgabewert ausschließlich den Zählwert und keine Log-Zeilen —
  `Write-Output` würde sie in den Success-Stream legen und den Vergleich auf ein Array
  ausweiten, das als Filter statt als Gleichheit ausgewertet wird

#### Scenario: Der Autostart-Shim kann den Watchdog mitstarten

- **GIVEN** `install-startup-autostart.ps1` wird mit `-Watchdog` aufgerufen
- **WHEN** der Shim im Startup-Ordner geschrieben wird
- **THEN** enthält er nach den Server-Zeilen eine `start /B`-Zeile für
  `watchdog-llm-servers.ps1`, damit die Endlosschleife den Shim nicht blockiert
- **AND** entfernt `-Uninstall` neben dem Shim auch eine noch laufende Watchdog-Instanz
