# Tasks: LLM-Server Watchdog

## T1 — Watchdog-Skript erstellen

**Datei:** `scripts/llm/watchdog-llm-servers.ps1`
**Aufwand:** 1h (Entwurf) + 0.5h (Review)

Implementiere das Watchdog-Skript gemäß Design:
- [ ] Parameter: `-PollSeconds` (Default 60), `-NoLoop`, `-Uninstall`
- [ ] Server-Definitionen: Gemma (:8091), bge-m3 (:8095), Reranker (:8096)
  - Jeder Eintrag: Name, Port, Script-Pfad, Argumente
- [ ] `Get-HealthStatus(port)`: `GET /health` mit 5s Timeout, erwartet `status == "ok"`
- [ ] `Test-ServerAlive(port, name)`: Health-Check + Prozess-Existenz via `Get-NetTCPConnection`
- [ ] `Invoke-ServerRestart(port, name)`:
  - Port räumen (`Get-NetTCPConnection` → `taskkill`)
  - `Start-Process` mit dem Startskript + `-NoWait`
  - Warten auf Health (max 240s, analog zu den Startskripten)
  - Log-Eintrag mit alter PID, Grund, neuer PID
- [ ] Hauptschleife: alle `$PollSeconds` Sekunden prüfen, tote Server restart
- [ ] Exit-Code: `1` wenn ALLE Server tot sind
- [ ] Logging nach `$LlamaDir\watchdog-llm-servers.log`
- [ ] Pid-Datei nach `$LlamaDir\watchdog.pid`
- [ ] `-Uninstall`: Watchdog-Prozess killen, Pid-Datei löschen

## T2 — In `install-startup-autostart.ps1` integrieren

**Datei:** `scripts/llm/install-startup-autostart.ps1`
**Aufwand:** 0.5h

- [ ] Neuen Parameter `-Watchdog` (Switch)
- [ ] Mit `-Watchdog`: nach Server-Start den Watchdog im Hintergrund starten
- [ ] Neuen Parameter `-WatchdogOnly`: nur Watchdog starten, keine Server
- [ ] Shim (`llm-stack-autostart.cmd`) um Watchdog-Zeile ergänzen
- [ ] Watchdog wird MIT `-PollSeconds 60` und `-NoLoop` NICHT gestartet
  (es ist eine Endlosschleife — in der .cmd dann `start /B`)

## T3 — BATS-Guards

**Datei:** `tests/spec/llm-pipeline.bats`
**Aufwand:** 0.5h

- [ ] `watchdog-llm-servers.ps1` existiert
- [ ] Jeder Watchdog-Server-Eintrag hat Name, Port, Script, Args
- [ ] Health-Prüfung nutzt `localhost:PORT/health`
- [ ] `install-startup-autostart.ps1` referenziert das Watchdog-Skript
- [ ] Kein `Start-Job` im Watchdog (T002276-Klasse: `Start-Process` verwenden)

## T4 — Deployment auf dem GPU-Host

**Aufwand:** 0.5h

- [ ] `install-startup-autostart.ps1 -Watchdog` auf dem Host ausführen
- [ ] Verifikation: Watchdog-Log zeigt "initial health check passed"
- [ ] Verifikation: absichtliches Killen eines Servers → Watchdog restartet ihn
  - `taskkill /F /PID <gemma-pid>` warten 90s, prüfen ob Server zurück ist
- [ ] Verifikation: `install-startup-autostart.ps1 -Uninstall` + `-Watchdog`
  entfernt beide Einträge sauber
