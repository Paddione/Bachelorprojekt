# Proposal: agentic-terminal-sidekick

## Why

Der Sidekick-Menüpunkt „Final Grilling" (View `grilling` → `GrillingSessionHost`) ist als
Drawer-Zugang redundant — das Grilling-Feature lebt vollständig im `GrillingStepper` auf der
Ticket-Detailseite weiter. Gleichzeitig fehlt ein schneller, voll agentischer Zugriff auf die
lokal auf Patricks WSL-Host laufenden Agenten (opencode, hermes agent, claude code, agy), die
dort bereits mit echtem Projekt-Kontext arbeiten (Repo-cwd, lokales Ollama/LM Studio,
CLAUDE.local.md, lokale Credentials). Ein Cluster-Pod kann diesen Kontext nicht duplizieren.

## What

Der Sidekick-Slot `grilling` wird durch einen neuen View `terminal` ersetzt: ein
iframe-Embed (Muster `MediaviewerPanel`, plus „In neuem Tab öffnen"-Fallback) auf
`terminal.mentolder.de` (dev: `terminal.localhost`). Dahinter: Traefik →
`oauth2-proxy-terminal` (neuer Pocket-ID-Client `terminal-sidekick`,
`--allowed-group=terminal-admins`, `--oidc-groups-claim=groups`) → selector-loser Service
`terminal-bridge` → Endpoints auf `${TERMINAL_OVERLAY_IP}:7681` → ttyd auf dem WSL-Host
(neuer fleet-wg-Mesh-Peer `10.20.0.10`, bind nur auf die wg-IP, `--writable`), der eine
persistente tmux-Session `sidekick` mit vier Agent-Windows attacht. Host-Setup über das
committete Skript `scripts/terminal-sidekick-host.sh` (systemd-User-Unit).

Architektur-Präzedenz: RustDesk-Web-Client
(`docs/superpowers/specs/2026-07-01-rustdesk-web-client-design.md`).
Design-Spec: `docs/superpowers/specs/2026-07-03-agentic-terminal-sidekick-design.md`.

`GrillingSessionHost.svelte` wird gelöscht; `MediaviewerPanel`/Bridge/`GrillingStepper`
bleiben unangetastet (minimaler Rückbau, Q7).

_Ticket: T001565_
