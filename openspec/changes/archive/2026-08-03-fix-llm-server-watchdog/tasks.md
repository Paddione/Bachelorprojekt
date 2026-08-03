# Tasks: LLM-Server Watchdog

## T1 — Watchdog-Skript erstellen

**Datei:** `scripts/llm/watchdog-llm-servers.ps1`
**Aufwand:** 1h (Entwurf) + 0.5h (Review)

Implementiere das Watchdog-Skript gemäß Design:
- [x] Parameter: `-PollSeconds` (Default 60), `-NoLoop`, `-Uninstall`
- [x] Server-Definitionen: Gemma (:8091), bge-m3 (:8095), Reranker (:8096)
  - Jeder Eintrag: Name, Port, Script-Pfad, Argumente
- [x] `Get-HealthStatus(port)`: `GET /health` mit 5s Timeout, erwartet `status == "ok"`
- [x] `Test-ServerAlive(port, name)`: Health-Check + Prozess-Existenz via `Get-NetTCPConnection`
- [x] `Invoke-ServerRestart(port, name)`:
  - Port räumen (`Get-NetTCPConnection` → `taskkill`)
  - `Start-Process` mit dem Startskript + `-NoWait`
  - Warten auf Health (max 240s, analog zu den Startskripten)
  - Log-Eintrag mit alter PID, Grund, neuer PID
- [x] Hauptschleife: alle `$PollSeconds` Sekunden prüfen, tote Server restart
- [x] Exit-Code: `1` wenn ALLE Server tot sind
- [x] Logging nach `$LlamaDir\watchdog-llm-servers.log`
- [x] Pid-Datei nach `$LlamaDir\watchdog.pid`
- [x] `-Uninstall`: Watchdog-Prozess killen, Pid-Datei löschen

## T2 — In `install-startup-autostart.ps1` integrieren

**Datei:** `scripts/llm/install-startup-autostart.ps1`
**Aufwand:** 0.5h

- [x] Neuen Parameter `-Watchdog` (Switch)
- [x] Mit `-Watchdog`: nach Server-Start den Watchdog im Hintergrund starten
- [x] Neuen Parameter `-WatchdogOnly`: nur Watchdog starten, keine Server
- [x] Shim (`llm-stack-autostart.cmd`) um Watchdog-Zeile ergänzen
- [x] Watchdog wird MIT `-PollSeconds 60` und `-NoLoop` NICHT gestartet
  (es ist eine Endlosschleife — in der .cmd dann `start /B`)

## T3 — BATS-Guards

**Datei:** `tests/spec/llm-pipeline.bats`
**Aufwand:** 0.5h

- [x] `watchdog-llm-servers.ps1` existiert
- [x] Jeder Watchdog-Server-Eintrag hat Name, Port, Script, Args
- [x] Health-Prüfung nutzt `localhost:PORT/health`
- [x] `install-startup-autostart.ps1` referenziert das Watchdog-Skript
- [x] Kein `Start-Job` im Watchdog (T002276-Klasse: `Start-Process` verwenden)

## T4 — Deployment auf dem GPU-Host

**Aufwand:** 0.5h

> **Nach dem Merge auszufuehren [T002335].** Der Shim schreibt den `-RepoRoot`-Pfad
> fest: aus dem Worktree zeigte er nach dem Cleanup ins Leere, mit dem Default-Pfad
> existiert das Watchdog-Skript erst nach dem Merge. Ein Probelauf wuerde ausserdem
> den bestehenden Autostart-Shim ueberschreiben. Der Kill-Test trifft den live
> laufenden Gemma-Server (:8091), auf dem die Factory arbeitet.
>
> Bereits verifiziert: PowerShell-Syntax beider Skripte (`Parser::ParseFile`, 0 Fehler)
> und ein `-NoLoop`-Lauf auf dem Host -> `summary: 3/3 Server healthy`,
> `initial health check passed`, Exit 0.

- [ ] `install-startup-autostart.ps1 -Watchdog` auf dem Host ausführen
- [ ] Verifikation: Watchdog-Log zeigt "initial health check passed"
- [ ] Verifikation: absichtliches Killen eines Servers → Watchdog restartet ihn
  - `taskkill /F /PID <gemma-pid>` warten 90s, prüfen ob Server zurück ist
- [ ] Verifikation: `install-startup-autostart.ps1 -Uninstall` + `-Watchdog`
  entfernt beide Einträge sauber
