# Proposal: mcp-token-auto-sync

_Ticket: T900223_

## Why

Nach jeder Rotation der devmesh `workspace-secrets` (Schlüssel `BGE_MCP_TOKEN`,
`MCP_POSTGRES_TOKEN` u.a. sind `generate:true`-Zufallswerte) stimmen die lokalen
Client-Secrets (`~/.config/*/server.env`) und die gerenderten Harness-Configs
nicht mehr mit dem Live-Secret überein. Remote-MCPs — vor allem `bge-mcp`
(`:13005`) — antworten darauf mit 401; opencode und Codex melden „server
unavailable / check server log". Ein Reboot kann das prinzipbedingt nie heilen
(Credential-Mismatch, kein Prozesszustand); bislang half nur manuelles Re-Sync
(z. B. am 2026-09-17 gegen 07:50 Uhr für `BGE_MCP_TOKEN`). Die Historie
(`bge-mcp status=failed` über Wochen im opencode-Log) zeigt: Das ist ein
Dauerzustand, kein Einzelfall.

## What

Der bestehende `mcp-gateway-watchdog` (60-s-Tick) bekommt einen
Token-Drift-Heal: Fingerprint-Vergleich (sha256, Werte nie geloggt) von
Live-Secrets gegen lokale `server.env`-Dateien; bei Drift automatisch
`server.env` neu schreiben (600), `mcp-sync.sh render` für alle
Harness-Configs (inkl. `~/.codex/config.toml`-Bearer), betroffene Units
restarten und per `agent-msg` + Journal Bescheid geben, damit der Harness
einmal neu gestartet wird (laufende Sessions lesen Tokens nur beim Start).
Keine neue Sync-Pipeline — Erweiterung des bestehenden `mcp-sync`-Mechanismus.
