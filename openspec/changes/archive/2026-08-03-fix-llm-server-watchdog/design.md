# Design: LLM-Server Watchdog

## 1. Watchdog-Skript: `scripts/llm/watchdog-llm-servers.ps1`

### Parameter

| Parameter | Default | Beschreibung |
|-----------|---------|--------------|
| `-PollSeconds` | 60 | Abfrageintervall in Sekunden |
| `-NoLoop` | - | Nur einmal prüfen, nicht in Endlosschleife |
| `-Uninstall` | - | Beende laufende Watchdog-Instanz und entferne Startup-Eintrag |

### Struktur

```
watchdog-llm-servers.ps1
├── Parameter / Konfiguration
├── Funktion: Get-HealthStatus(port) → $true/$false
├── Funktion: Test-ServerAlive(port, name) → $true/$false
│   ├── GET /health auf localhost:$port
│   ├── Timeout 5 Sekunden
│   └── Antwort: status == "ok" + Prozess existiert (PID-Check)
├── Funktion: Invoke-ServerRestart(port, name)
│   ├── Port räumen (Get-NetTCPConnection → taskkill)
│   ├── Startskript per Start-Process aufrufen
│   ├── Warten auf Health (max 240s, analog zu start-*-ps1)
│   └── Log-Eintrag
├── Funktion: Write-WatchdogLog(message, level)
│   └── Schreibt ins Log-Verzeichnis des Hosts
├── Hauptschleife (wenn nicht -NoLoop):
│   ├── Servers = @(
│   │   @{ Name="Gemma";    Port=8091; Script="start-gemma-server.ps1";     Args="-Ctx 262144 -Slots 1 -KvType q8_0 -NoWait" },
│   │   @{ Name="bge-m3";   Port=8095; Script="start-embed-server.ps1";    Args="-NoWait" },
│   │   @{ Name="Reranker"; Port=8096; Script="start-rerank-server.ps1";   Args="-NoWait" }
│   │ )
│   ├── foreach: health check → restart if dead → log
│   ├── summary (wie viele laufen / tot)
│   ├── if ALLE tot: exit 1 (damit schtasks-exit auffällt)
│   └── Start-Sleep -Seconds $PollSeconds
└── Watchdog-PID-Datei für -Uninstall
```

### Server-Definitionen

Die Servers-Liste ist das SSOT für "welche Server gehören zum Stack".
Das Watchdog-Skript definiert sie als Hashtable-Array, sodass sie in
Zukunft um weitere Server (z.B. gpt-oss :8097) erweitert werden kann.

**Gemma-Start mit Profil:** Der Watchdog startet Gemma mit denselben
Parametern wie `install-startup-autostart.ps1`: `-Ctx 262144 -Slots 1
-KvType q8_0 -NoWait`. Die Parameter sind an EINER Stelle (der
Watchdog-Server-Definition) hinterlegt, nicht doppelt — im Gegensatz zur
früheren Duplikation zwischen `register-scheduled-tasks.ps1` und den
Startskripten (T002276).

**Embed- und Rerank-Start ohne Parameter:** `start-embed-server.ps1`
und `start-rerank-server.ps1` haben sinnvolle Defaults (`-b/-ub 8192`,
`-ngl 0`), die über Umgebungsvariablen überschreibbar sind. Der Watchdog
startet sie ohne zusätzliche Argumente.

### Health-Prüfung

Der Watchdog prüft zwei Bedingungen, bevor er einen Server als "tot" wertet:

1. **HTTP-Health:** `GET /health` auf `localhost:$port` mit 5s Timeout
   — Antwort muss `status == "ok"` enthalten
2. **Prozess-Existenz:** Der zum Server gehörende Prozess (llama-server.exe)
   muss noch laufen, und zwar mit dem korrekten Port in der
   `Get-NetTCPConnection`-Ausgabe

Falls Health ok ist aber kein Prozess gefunden wird → Warnung loggen,
kein Restart (der Server könnte in einer Race-Condition gerade neu starten).
Falls Health fehlschlägt → sofort Restart.

### Logging

Der Watchdog schreibt in `$LlamaDir` (Verzeichnis von llama-server.exe) 
bzw. in einen konfigurierbaren Pfad:

```
watchdog-llm-servers.log
```

Format: `[2026-07-27 14:00:00] LEVEL ServerName: Meldung`
- LEVEL: INFO, WARN, ERROR, RESTART
- Bei Neustart: vorherige PID, Grund, neue PID
- Bei erstmaligem Start: "initial health check passed"

### Pid-Datei

```
$logDir/watchdog.pid
```

Damit `-Uninstall` die laufende Watchdog-Instanz finden und beenden kann.

## 2. Integration in `install-startup-autostart.ps1`

Die `llm-stack-autostart.cmd` startet nach den Servern den Watchdog im
Hintergrund:

```cmd
rem Nach den Servern: Watchdog starten
start /B powershell.exe -NoProfile -ExecutionPolicy Bypass -WindowStyle Hidden -File "\\wsl$\k3d-dev\home\patrick\Bachelorprojekt\scripts\llm\watchdog-llm-servers.ps1" -PollSeconds 60
```

Ein Modul `-Watchdog` wird dem Skript hinzugefügt:

| Switch | Effekt |
|--------|--------|
| `-Watchdog` | Nach Server-Start auch Watchdog im Hintergrund starten |
| `-WatchdogOnly` | Nur Watchdog starten, keine Server |

## 3. BATS-Guards (tests/spec/llm-pipeline.bats)

- `watchdog-llm-servers.ps1` existiert
- Health-Prüfung verwendet `localhost:PORT/health`
- Jeder Server-Eintrag hat Name, Port, Script und Args
- `install-startup-autostart.ps1` referenziert das Watchdog-Skript
- Kein `Start-Job` im Watchdog (muss `Start-Process` verwenden, T002276-Lehre)

## 4. Offene Punkte

- **Intune-Freigabe:** Der Watchdog läuft erstmal nur via Startup-Ordner.
  Sollte eine Intune-Freigabe für den \Llama\Watchdog-Task erfolgen, kann 
  der Watchdog als systemweiter Scheduled Task registriert werden und
  unabhängig von Benutzer-Anmeldung laufen.
- **Remotefähigkeit:** Der Watchdog läuft auf dem Windows-Host. Ein externes
  Monitoring (z.B. von WSL/fleet aus) per `curl localhost:PORT/health` ist
  als Ergänzung denkbar, aber nicht Teil dieses Tickets.
- **Log-Rotation:** Das Log läuft unbegrenzt — bei Bedarf PowerShell-Json-
  Rotation nachrüsten.
