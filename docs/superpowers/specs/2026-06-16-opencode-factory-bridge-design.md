---
title: "OpenCode × Factory Bridge + Agent-Msg Wiring"
date: 2026-06-16
status: draft
ticket_id: T000914
plan_ref: docs/superpowers/plans/2026-06-16-opencode-factory-bridge.md
domains: [factory, opencode, agent-coordination]
---

# OpenCode × Factory Bridge + Agent-Msg Wiring

## Problem

1. **OpenCode kann die Factory nicht nutzen.** Die Software Factory (Autopilot) läuft via
   `claude -p` + Workflow-Harness. OpenCode hat keinen Zugang dazu — weder per CLI noch
   per MCP. Wenn der User in OpenCode arbeitet, muss er Factory-Operationen manuell via
   Bash tippen.

2. **`agent-msg.sh` wird im Factory-Kontext ignoriert.** `wakeup.sh`, `dispatcher.js` und
   `pipeline.js` posten und lesen keine Agent-Nachrichten. Parallele Sessions (z. B.
   Claude Code + OpenCode gleichzeitig) wissen nicht voneinander und können Konflikte
   erzeugen (doppelte Branch-Claims, Race auf Shared-Files).

## Ziel

- OpenCode kann Factory-Tickets sehen, einreihen und einen Tick triggern — direkt aus dem
  Chat, ohne Bash-Kenntnisse.
- Factory-Pipeline posted `agent-msg`-Nachrichten an Schlüsselpunkten (Start/Ende/Block).
- OpenCode-Sessions lesen ausstehende Nachrichten beim Start und sehen so, ob die Factory
  gerade ein Ticket bearbeitet.

## Nicht-Ziel

- OpenCode als Factory-Execution-Backend (das würde den Workflow-Harness erfordern).
- GUI / Dashboard (ist T000899 → archiviert, T000905 → eigenes Ticket).
- Deep-Integration in den Verify/Deploy-Loop — nur Koordination, keine Steuerung.

## Lösung

### Komponente 1 — Factory MCP Server (`scripts/factory/mcp-server.mjs`)

Ein schlanker Node.js HTTP-Server (StreamableHTTP-MCP-Transport) auf `localhost:13003`.
Er exponiert 5 Tools, die alle nichts weiter als dünne Bash-Wrapper sind:

| Tool | Beschreibung | Implementierung |
|------|-------------|-----------------|
| `factory_status` | Queue-Tiefe + laufende Jobs | `SELECT`-Query gegen website-DB via `psql` |
| `factory_queue` | Liste wartender Tickets (backlog/plan_staged) | `SELECT`-Query |
| `factory_enqueue` | Ticket zur Factory-Queue hinzufügen | `scripts/ticket.sh enqueue` |
| `factory_trigger` | Factory-Tick sofort starten | `bash scripts/factory/wakeup.sh` im Hintergrund |
| `factory_recent` | Letzte N Factory-Läufe aus ticket_comments | `SELECT`-Query |

**Transport:** MCP Streamable-HTTP (nicht SSE, weil OpenCode SSE schon für k8s/keycloak
nutzt und der neue Server einfacher sein soll). Endpunkt: `POST http://localhost:13003/mcp`.

**Auth:** Kein Auth (loopback only, `127.0.0.1:13003`). Bind auf `127.0.0.1`, nicht `0.0.0.0`.

**Implementierung:** ~150 Zeilen, `@modelcontextprotocol/sdk` (schon in `scripts/factory/package.json`
verfügbar). Startet via `node scripts/factory/mcp-server.mjs`.

### Komponente 2 — OpenCode-Konfiguration

`.opencode/opencode.jsonc` erhält einen neuen Eintrag:
```jsonc
"mcp-factory": {
  "type": "local",
  "command": "node",
  "args": ["scripts/factory/mcp-server.mjs"],
  "enabled": true
}
```

Alternativ (falls OpenCode `local`-Type nicht unterstützt): `"type": "remote"` mit
`"url": "http://localhost:13003/mcp"` + manueller Start via Taskfile.

**Taskfile.openclaw.yml** erhält Tasks:
- `openclaw:factory-mcp:start` — startet den MCP-Server als Hintergrundprozess (PID-Datei)
- `openclaw:factory-mcp:stop` — beendet ihn
- `openclaw:factory-mcp:status` — Healthcheck (`curl localhost:13003/health`)

### Komponente 3 — AGENTS.md: Factory-Abschnitt

Ein neuer Abschnitt erklärt OpenCode:
- Welche Factory-Tools verfügbar sind und wann sie zu nutzen sind
- Wann man Factory nutzen soll vs. manuell implementieren
- Wie man `agent-msg`-Nachrichten liest beim Session-Start

### Komponente 4 — Agent-Msg-Wiring in Factory-Pipeline

**`scripts/factory/wakeup.sh`** (nach dem flock-Acquire, vor dem ersten Tick):
```bash
# Ausstehende Nachrichten anderer Sessions lesen (informativ, kein Blocker)
bash scripts/agent-msg.sh read --unread 2>/dev/null || true
# Factory-Start broadcasten
AGENT_MSG_LABEL=factory bash scripts/agent-msg.sh post "factory-tick: starting (dry_run=${DRY_RUN})" 2>/dev/null || true
```
Nach dem Tick-Loop:
```bash
AGENT_MSG_LABEL=factory bash scripts/agent-msg.sh post "factory-tick: done" 2>/dev/null || true
```

**`scripts/factory/pipeline.js`** (am Anfang der Scout-Phase, nach dem Ticket-Claim):
```javascript
// Broadcasting via Bash ist OK — wir sind in einem claude -p Prozess mit Repo-Zugang
agent(`Run: AGENT_MSG_LABEL=factory bash scripts/agent-msg.sh post "factory-pipeline: claiming ${ticket_id} (${title})"`, {label: 'agent-msg-claim'})
```
Und am Ende (Cleanup-Block):
```javascript
const finalStatus = result?.status ?? 'unknown'
agent(`Run: AGENT_MSG_LABEL=factory bash scripts/agent-msg.sh post "factory-pipeline: ${ticket_id} finished status=${finalStatus}"`, {label: 'agent-msg-done'})
```

**`scripts/factory/dispatcher.js`** (Escalation-Routing — nur wenn blockiert):
```javascript
// Bereits bestehender PushNotification-Call; zusätzlich agent-msg
agent(`Run: AGENT_MSG_LABEL=factory bash scripts/agent-msg.sh post "factory-dispatch: ${N} run(s) blocked/escalated"`, {label: 'agent-msg-escalate'})
```

## Abhängigkeiten

- `@modelcontextprotocol/sdk` — schon als dep in `scripts/factory/package.json`
- `scripts/ticket.sh` — für enqueue-Wrapper
- `scripts/agent-msg.sh` — existiert, unverändert
- OpenCode >= v1.17.7 (gemäß opencode.yml SHA-Pin)

## Risiken & Mitigationen

| Risiko | Mitigation |
|--------|------------|
| MCP-Server läuft nicht → OpenCode ohne Factory-Tools | Graceful degradation: OpenCode zeigt Fehler, aber funktioniert weiterhin |
| `factory_trigger` startet parallelen Tick (Lock-Race) | wakeup.sh hat bereits `flock -n`-Guard — zweiter Trigger-Aufruf ist harmloser No-Op |
| agent-msg-Aufrufe in pipeline.js verlangsamen den Workflow | Alle `|| true` — fail-open; kein Blocker |
| `local`-Type in opencode.jsonc nicht unterstützt | Fallback auf `remote`-Type + manueller Start |

## Acceptance Criteria

1. `factory_status` Tool in OpenCode zeigt Queue-Tiefe und ob ein Tick läuft
2. `factory_enqueue <ticket_id>` setzt Ticket auf `backlog` in der DB
3. `factory_trigger` ruft `wakeup.sh` auf und gibt Exit-Status zurück
4. `wakeup.sh` postet Start- und End-Nachricht in `.git/agent-msgs/log.jsonl`
5. `pipeline.js` postet Claim- und Done-Nachrichten
6. OpenCode liest beim Session-Start ausstehende Factory-Nachrichten (via AGENTS.md-Instruktion)
7. BATS-Test: `factory_mcp_server.bats` prüft alle 5 Tool-Calls gegen einen Mock-DB-Stub
