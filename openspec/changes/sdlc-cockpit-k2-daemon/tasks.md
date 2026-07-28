---
title: "K2: Daten-Adapter & lokaler Daemon"
ticket_id: T002461
domains: [cockpit, daemon, adapter]
status: plan_staged
---

# Tasks: SDLC Cockpit — K2 Daten-Adapter & lokaler Daemon

**Ticket:** T002461  
**Branch:** `feature/sdlc-cockpit-k2-daemon-T002461`  
**Spec:** `openspec/changes/sdlc-cockpit-k2-daemon/design.md`

## Partial Manifest

| Partial | Name | Files | Role |
|---------|------|-------|------|
| p1 | daemon-core | `.lavish/kit/daemon/server.ts`, `.lavish/kit/daemon/routes/`, `.lavish/kit/daemon/lib/` | implementation |
| p2 | source-adapters | `.lavish/kit/daemon/sources/`, `.lavish/kit/daemon/routes/*` (Stub-Editierungen) | implementation |
| p3 | adapter-js | `.lavish/kit/adapter.js`, `.lavish/kit/daemon/server.ts` (+token route) | implementation |
| p4 | tests | `tests/spec/sdlc-cockpit/`, `tests/unit/cockpit-adapter.test.ts`, `tests/unit/cockpit-daemon-cache.test.ts` | tests |

**Disjunktheit:** Keine Datei kommt in mehr als einem Partial vor (D1).

**Pipeline:** Partials werden in Reihenfolge p1→p2→p3→p4 gestaged und enqueued. p4 (Tests-Rolle) ist das letzte Partial.

## Partial Plans

- [p1] `tasks.d/p1-daemon-core.md` — HTTP-Server (Hono), Routing, Token-Generierung, SSE-Mechanismus, Lib-Module
- [p2] `tasks.d/p2-source-adapters.md` — 8 Source-Module (kubectl, gh-axi, git, agent-lock, ticket-mcp, factory-mcp, opencode-db, model-health), Route-Editierungen (Stubs→echt)
- [p3] `tasks.d/p3-adapter-js.md` — Browser-Adapter ersetzt K1-Fixtures: HTTP-Client mit D10-D13, SSE-Streams, Token-Retrieval
- [p4] `tasks.d/p4-tests.md` — 5 BATS-Strukturtests + 2 Vitest-Unit-Tests

## STRUCT2 Failing-Test Step

In p4: Die Vitest-Unit-Tests (`cockpit-adapter.test.ts`, `cockpit-daemon-cache.test.ts`) starten
mit Placeholder-Assertions (`expect(true).toBe(true)`) und müssen nach der Adapter-Implementierung
(p3) durch echte Assertions ersetzt werden. Vor der Implementierung:
```bash
npx vitest run tests/unit/cockpit-adapter.test.ts  # erwartet: FAIL (Placeholder oder Import-Fehler)
```
Nach der Implementierung:
```bash
npx vitest run tests/unit/cockpit-adapter.test.ts  # erwartet: PASS
```

## STRUCT3 Verify Task

```bash
task test:changed          # nur K2-relevante Tests
task freshness:regenerate  # test-inventory.json aktualisieren
task freshness:check       # muss bestehen
```

## Quality Gates

- `bash scripts/plan-lint.sh openspec/changes/sdlc-cockpit-k2-daemon/tasks.md`
- `bash scripts/openspec.sh validate`
- `task test:changed` — nur K2-relevante Tests
- `task freshness:check` — test-inventory.json muss aktuell sein
- `task test:code-quality`
- Alle BATS-Negativtests haben Positiv-Anker (T002356-M1)
- D13: Kein Null/Strich/Beispielwert in Fehlerantworten
- D12: Jede Antwort trägt `fetchedAt`

## Blockiert durch

K1 (T002460) — `.lavish/kit/`-Verzeichnis existiert erst nach K1-Merge
