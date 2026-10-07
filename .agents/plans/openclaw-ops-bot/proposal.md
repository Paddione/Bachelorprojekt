# Proposal: openclaw-ops-bot

## Why

opencode, Claude Code und Pi sind sitzungsbasierte Coding-Harnesses. Es fehlt ein dauerhaft
laufender Assistent, der (a) von sich aus den Zustand von fleet, CI und Factory prüft und nur bei
Befund per Messenger meldet, und (b) anderen Agenten und Menschen als Broker dient: eine vage
Aufgabe annehmen, dem passenden Task oder Skript zuordnen, read-only ausführen und das Ergebnis
synchron zurückgeben. Ein erster Ansatz existiert (`taskfiles/Taskfile.openclaw.yml`,
`openclaw/.env.example`, Fallback in `scripts/vda/oracle.sh`), ist aber defekt: das Taskfile
installiert opencode statt OpenClaw, der Agent `task-runner` existiert nicht, und die
Beispiel-Config zeigt auf einen toten Ollama-Endpunkt.

## What

- OpenClaw `2026.9.6` läuft als systemd-User-Dienst auf dem WSL-Host, mit eigenem, gepinntem
  Node `v24.21.0`. Das System-Node bleibt unverändert.
- Modellkette: primär lokal `:1919`, Fallback `opencode-go/muse-spark-1.3-contributor` mit
  Reasoning `low`.
- Agent `ops`: Heartbeat alle 30 min nach der Checkliste `openclaw/heartbeat-scratch.md` (Monitor-Scratch), meldet nur Befunde
  per Telegram, führt ausschließlich Read-only-Befehle aus und empfiehlt Fixes, statt sie
  auszuführen.
- Agent `task-runner`: Broker, erreichbar über `scripts/openclaw-ask.sh` (synchron,
  `/v1/chat/completions`) und über den bestehenden `oracle.sh`-Fallback.
- Das Gateway bleibt auf Loopback. Kein MCP, keine ClawHub-Skills in dieser Ausbaustufe.
- Nicht im Umfang: Push-Alerts aus dem Cluster, Auto-Fix, weitere Messenger. Die Provider-Header
  für OpenCode Go (R4) und die Session-Granularität (R5) übernimmt der Nutzer nach dem Merge.

_Ticket: T900538_
