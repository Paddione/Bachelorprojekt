---
ticket_id: null
plan_ref: null
status: active
date: 2026-09-17
---

# Design: mcp-token-auto-sync

_Ticket: T900223 · Parent-SSOT: `openspec/specs/mcp-gateway.md`_

## Ausgangslage (Evidenz)

- Token-Quelle Serverseite: devmesh-Secret `workspace-secrets`, ns `workspace`,
  Keys `BGE_MCP_TOKEN` / `MCP_POSTGRES_TOKEN` (`dev-local/components/llm-services/deployment.yaml:70-73`).
- Client-Seite: `~/.config/{bge-mcp,factory-mcp-node,mcp-postgres}/server.env`
  (alle 600); opencode-Plugins (`mcp-client-tokens-env.ts`, `bge-mcp-env.ts`)
  lesen sie **einmal beim Start** in `process.env`, `{env:VAR}` expandiert daraus.
- Bestehender Sync: `scripts/mcp-sync.sh render|check` (`task mcp:sync` /
  `mcp:check`), Registry-SSOT `docs/agent-guide/registry/mcp.yaml`;
  Drift-Diagnostik darf keine Secrets leaken
  (`mcp-sync-drift-no-secret-leak.bats`).
- Bestehende Aufsicht: `mcp-gateway-watchdog.timer` (60-s-Tick, `OnBootSec=60`),
  `watchdog-check.sh` prüft nur Erreichbarkeit (`probe.sh`), **keine Tokens**.
- Fingerprint-Präzedenz ohne Klartext: `scripts/verify-deployment.sh:117-146`
  (`_secret_key_in_sync`, base64-Vergleich); sha256-Präzedenz
  `scripts/lib/mcp-http-security.mjs:108-109`.
- Notify-Präzedenz: `scripts/agent-msg.sh post` (kein `notify-send` im Repo).

## Entscheidung: Bestehendes behalten und erweitern

Kein zweiter Sync-Pfad. Neues Skript `scripts/mcp-gateway/token-drift-heal.sh`,
aufgerufen aus `watchdog-check.sh` (selber Tick, selbes Rate-Limit
`mcp-gateway-watchdog.last_restart`, selber Pod-Death-Guard fail-closed).

## Ablauf pro Tick

1. **Detect (read-only):** Für jeden überwachten Key
   (`BGE_MCP_TOKEN`, `MCP_POSTGRES_TOKEN`, `FACTORY_MCP_TOKEN` — Quelle je Key
   dokumentiert, devmesh-Secret bzw. zuständiger Service):
   `sha256(live)` vs. `sha256(server.env-Wert)` vergleichen. Kein Wert in
   stdout/Journal/Agent-Msg (nur Key-Name + `match`/`drift`).
   Live-Abfrage nur, wenn der Cluster erreichbar ist (sonst SKIP, kein Heal).
2. **Heal (nur bei Drift):** `server.env` atomar neu schreiben (600 via
   `harden_secret_file`-Muster) → `bash scripts/mcp-sync.sh render` (heilt
   `.opencode/opencode.jsonc`, `.mcp.json`, Gemini/Qwen/Claude-User-Configs und
   die Codex-Bearer in `~/.codex/config.toml`) → betroffene Units restarten
   (`devmesh-forward`, `bge-mcp`, `factory-mcp`, `mcp-postgres-local`;
   nur die, deren Token driftete).
3. **Notify:** `agent-msg.sh post` + Journal-Echo:
   „Token <KEY> rotiert, Dateien geheilt — Harness einmal neu starten".
4. **Verify:** `scripts/mcp-gateway/doctor.sh`-Bearer-Probes müssen danach
   wieder 200 liefern (sonst zweite Meldung, kein endloser Heal-Loop:
   Rate-Limit des Watchdogs gilt auch hier).

## Nicht-Ziele

- Keine Änderung am Rotationsmechanismus selbst (`generate:true` bleibt);
  keine Stable-Tokens (bewusst verworfene Alternative, User-Entscheid).
- Kein Restart laufender opencode-/Codex-Sessions (technisch unmöglich von
  außen) — dafür Notify.
- Keine Secrets in Logs, Diffs oder Commit-Messages (T002941-Redaction gilt).

## Tests

Neue Datei `tests/spec/mcp-gateway/token-drift-auto-sync.bats`
(Fake-Secret-Input + Fake-HOME/`server.env`-Fixtures, Python-Fake-Server
Bearer→200/401 wie in `client-env-check.bats`):
Drift→Heal (Datei neu, Unit-Restart gemockt, Redaction-Assert),
kein Heal ohne Drift (Idempotenz), 401-vs-down-Unterscheidung.
