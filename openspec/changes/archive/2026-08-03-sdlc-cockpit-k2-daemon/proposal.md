# Proposal: SDLC Cockpit — K2 Daten-Adapter & lokaler Daemon

**Ticket:** T002461
**Epic:** T002458 (SDLC Cockpit)
**Hängt ab von:** K1 (T002460, PR #3518)
**Status:** planning
**Date:** 2026-07-28

## Purpose

K2 ersetzt die K1-Fixture-Implementierung in `.lavish/kit/adapter.js` durch einen lokalen Daemon, der
**echte Livedaten** aus `kubectl`, `gh-axi`, `git`, `agent-lock.sh`, `ticket-mcp`, `factory-mcp` und
den lokalen Modell-Servern liefert. Die Panels bleiben unverändert — der Austausch betrifft genau
eine Datei (`adapter.js`), der Rest des Kits ist unberührt.

## What

```
┌──────────────────────────────────────────────────────────┐
│  .lavish/kit/adapter.js  (ersetzt K1-Fixtures)           │
│  ┌────────────────────────────────────────────────────┐  │
│  │  data.tickets()  →  GET  http://127.0.0.1:PORT/... │  │
│  │  data.agents()   →  GET  http://127.0.0.1:PORT/... │  │
│  │  data.ci()       →  GET  http://127.0.0.1:PORT/... │  │
│  │  data.cluster()  →  GET  http://127.0.0.1:PORT/... │  │
│  │  data.factory()  →  GET  http://127.0.0.1:PORT/... │  │
│  │  data.models()   →  GET  http://127.0.0.1:PORT/... │  │
│  │  data.ticketAction()  →  POST + Token (→ K4)       │  │
│  │  data.agentAction()   →  POST + Token (→ K4)       │  │
│  └────────────────────────────────────────────────────┘  │
│                                                          │
│  ┌────────────────────────────────────────────────────┐  │
│  │  Lokaler Daemon  (Node.js/TypeScript)              │  │
│  │  Port: 127.0.0.1:49152  (IANA-dynamic, konfig.)   │  │
│  │                                                    │  │
│  │  GET  /api/admin/cockpit/portfolio                 │  │
│  │  GET  /api/admin/cluster/pods-list                 │  │
│  │  GET  /api/admin/cluster/warnings                  │  │
│  │  GET  /api/admin/cockpit/feature?extId=...         │  │
│  │  GET  /api/admin/factory-control                   │  │
│  │  GET  /api/cockpit/ci                              │  │
│  │  GET  /api/cockpit/agents                          │  │
│  │  GET  /api/cockpit/models                          │  │
│  │  SSE  /api/cockpit/stream/agents                   │  │
│  │  POST /api/cockpit/* → Token-geschützt (→ K4)      │  │
│  └────────────────────────────────────────────────────┘  │
│                          │                               │
│                          ▼                               │
│  ┌────────────────────────────────────────────────────┐  │
│  │  Datenquellen  (child_process / sqlite3)           │  │
│  │  kubectl --context fleet · gh-axi · git            │  │
│  │  agent-lock.sh · ticket-mcp · factory-mcp          │  │
│  │  opencode.db (SQLite, readonly)                    │  │
│  └────────────────────────────────────────────────────┘  │
└──────────────────────────────────────────────────────────┘
```

## Key Design Decisions

### B1 — Node.js/TypeScript Daemon
HTTP-Server nativ, SSE trivial, CLI-Tools per `child_process`, vorhandene Runtime im Repo.
Framework: `express` oder `hono` (leichtgewichtig). TypeScript wird direkt mit `tsx` ausgeführt,
kein Build-Schritt.

### B2 — Hybrid-Protokoll: GET + SSE
- **Status/Canvas-Daten** per HTTP GET mit `?refreshMs=N`-Parameter (Panel deklariert Rate)
- **Strom-Daten** (Agenten-Mitlesen) per SSE (Server-Sent Events) mit Lückenmarkierung
- Jede Antwort trägt `fetchedAt`-Timestamp (D12)
- Fehlerantworten tragen `error`-Feld, nie Null/Strich/Beispielwert (D13)

### B3 — opencode.db als Agenten-Mitlesen-Quelle (OF3)
Das SQLite-File `~/.local/share/opencode/opencode.db` wird readonly geöffnet und liefert
strukturierte Session-Daten inkl. SID, Label, Ticket, Worktree, Status, Startzeit.

### B4 — Port 49152 (IANA-dynamic range)
Konfigurierbar via Umgebungsvariable `COCKPIT_DAEMON_PORT`. Token wird beim Start in
`/tmp/cockpit-daemon.token` mit `0600`-Rechten geschrieben.

### B5 — Refresh per Panel (D10, D11)
`adapter.js`-Methoden akzeptieren `{ refreshMs }`. Panel ruft `data.tickets({ refreshMs: 300000 })`.
Adapter managed eigenes Polling-Intervall, setzt `clearInterval` bei `unsubscribe()` und pausiert
bei `document.hidden` (D11).

### B6 — Fehlerverhalten nach Typ (Tabelle 4.2)
- **Status**: Letzter Wert bleibt, `staleSince`-Feld wird gesetzt
- **Strom**: SSE-`retry`-Feld, Lückenmarkierung bei Reconnect
- **Canvas**: Niemals verwerfen, `lastSaveAttempt`-Feld

## Blockiert

K4 (Schreibaktionen), K5 (Epic-Canvas), K6 (Brain-Anbindung), K7 (Admin-Migration)

## Spezifikation

- **Design-Spec:** `openspec/changes/sdlc-cockpit-k2-daemon/design.md`
- **Delta-Spec:** `openspec/changes/sdlc-cockpit-k2-daemon/specs/sdlc-cockpit.md`
- **Epic-Design:** `openspec/changes/sdlc-cockpit-design/design.md` (E1–E22, bindend)

## Tests

- `tests/spec/sdlc-cockpit/adapter-contract.bats` — Vertragstreue: alle Methoden vorhanden, korrekte Signaturen
- `tests/spec/sdlc-cockpit/daemon-endpoints.bats` — Daemon-Endpoints existieren und antworten
- `tests/spec/sdlc-cockpit/no-silent-fallback.bats` — D13: keine Null/Strich/Beispielwerte bei Fehler
- `tests/spec/sdlc-cockpit/freshness-timestamp.bats` — D12: jede Antwort trägt `fetchedAt`
- `tests/unit/cockpit-adapter.test.ts` — Vitest: Adapter.poll(), unsubscribe(), D10/D11
