---
title: "K2: Daten-Adapter & lokaler Daemon"
ticket_id: T002461
domains: [cockpit, daemon, adapter]
status: plan_staged
---

# Implementation Plan

**Ticket:** T002461  
**Branch:** `feature/sdlc-cockpit-k2-daemon-T002461`  
**Spec:** `openspec/changes/sdlc-cockpit-k2-daemon/design.md`

## File Structure

```
openspec/changes/sdlc-cockpit-k2-daemon/
├── proposal.md
├── design.md
├── specs/sdlc-cockpit/spec.md
├── tasks.md
└── tasks.d/
    ├── p1-daemon-core.md
    ├── p2-source-adapters.md
    ├── p3-adapter-js.md
    └── p4-tests.md
```

```
.lavish/kit/
├── adapter.js                           # [K2-ersetzt]
└── daemon/                              # [K2-neu]
    ├── server.ts
    ├── routes/  (cockpit, cluster, factory, custom, stream)
    ├── sources/ (kubectl, gh-axi, git, agent-lock, ticket-mcp, factory-mcp, opencode-db, model-health)
    ├── lib/     (token, exec, cache, sse)
    └── audit.jsonl
```

```
tests/
├── spec/sdlc-cockpit/
│   ├── adapter-contract.bats
│   ├── daemon-endpoints.bats
│   ├── no-silent-fallback.bats
│   ├── freshness-timestamp.bats
│   └── daemon-token-mode.bats
└── unit/
    ├── cockpit-adapter.test.ts
    └── cockpit-daemon-cache.test.ts
```

## Partials

| p1 | tasks.d/p1-daemon-core.md | implementation | .lavish/kit/daemon/server.ts, .lavish/kit/daemon/lib/token.ts, .lavish/kit/daemon/lib/exec.ts, .lavish/kit/daemon/lib/cache.ts, .lavish/kit/daemon/lib/sse.ts |
| p2 | tasks.d/p2-source-adapters.md | implementation | .lavish/kit/daemon/sources/kubectl.ts, .lavish/kit/daemon/sources/gh-axi.ts, .lavish/kit/daemon/sources/git.ts, .lavish/kit/daemon/sources/agent-lock.ts, .lavish/kit/daemon/sources/ticket-mcp.ts, .lavish/kit/daemon/sources/factory-mcp.ts, .lavish/kit/daemon/sources/opencode-db.ts, .lavish/kit/daemon/sources/model-health.ts, .lavish/kit/daemon/routes/cockpit.ts, .lavish/kit/daemon/routes/cluster.ts, .lavish/kit/daemon/routes/factory.ts, .lavish/kit/daemon/routes/custom.ts, .lavish/kit/daemon/routes/stream.ts |
| p3 | tasks.d/p3-adapter-js.md | implementation | .lavish/kit/adapter.js |
| p4 | tasks.d/p4-tests.md | tests | tests/spec/sdlc-cockpit/adapter-contract.bats, tests/spec/sdlc-cockpit/daemon-endpoints.bats, tests/spec/sdlc-cockpit/no-silent-fallback.bats, tests/spec/sdlc-cockpit/freshness-timestamp.bats, tests/spec/sdlc-cockpit/daemon-token-mode.bats, tests/unit/cockpit-adapter.test.ts, tests/unit/cockpit-daemon-cache.test.ts |

**Disjunktheit:** Keine Datei kommt in mehr als einem Partial vor (D1).

## Partial Plans

- [p1] `tasks.d/p1-daemon-core.md` — HTTP-Server (Hono), Token-Generierung, SSE-Mechanismus, Lib-Module (token, exec, cache, sse). Route-Dateien sind NICHT in p1 (werden in p2 erstellt).
- [p2] `tasks.d/p2-source-adapters.md` — 8 Source-Module + Route-Dateien (cockpit, cluster, factory, custom, stream) mit echten Quell-Aufrufen
- [p3] `tasks.d/p3-adapter-js.md` — Browser-Adapter ersetzt K1-Fixtures
- [p4] `tasks.d/p4-tests.md` — 5 BATS + 2 Vitest (STRUCT2: failing-test step)

## Failing-Test Step (STRUCT2)

**p4 enthält einen failing-test step:** Vor der Adapter-Implementierung sind die Vitest-Tests
Platzhalter. Der Befehl `npx vitest run tests/unit/cockpit-adapter.test.ts` erwartet FAIL
(weil Adapter-Mocks/Imports nicht aufgelöst werden können). Nach p3-Implementierung: PASS.

```bash
# Schritt 1 (vor Implementierung) — erwartet: FAIL
npx vitest run tests/unit/cockpit-adapter.test.ts && echo "UNEXPECTED PASS" || echo "EXPECTED FAIL"

# Schritt 2 (nach p3) — erwartet: PASS
npx vitest run tests/unit/cockpit-adapter.test.ts
```

## Verify Task (STRUCT3)

```bash
task test:changed          # K2-relevante Tests
task freshness:regenerate  # test-inventory.json aktualisieren
task freshness:check
task test:code-quality
```

## Blockiert durch

K1 (T002460)
