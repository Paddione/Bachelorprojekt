# Tasks — K2 Daten-Adapter & lokaler Daemon

**Ticket:** T002461
**Branch:** `feature/sdlc-cockpit-k2-daemon-T002461`

## Partials

| # | Name | Rolle | Dateien | Status |
|---|------|-------|---------|--------|
| p1 | daemon-core | Daemon-Server, Routing, Token | `.lavish/kit/daemon/` (server.ts, routes/, lib/) | `tasks.d/p1-daemon-core.md` ✓ |
| p2 | source-adapters | Quell-Integration (kubectl, gh-axi, etc.) + Route-Editierungen | `.lavish/kit/daemon/sources/`, `routes/*` (Stubs→echt) | `tasks.d/p2-source-adapters.md` ✓ |
| p3 | adapter-js | Browser-Adapter (ersetzt K1-Fixtures) | `.lavish/kit/adapter.js` | — |
| p4 | tests | Struktur- & Unit-Tests | `tests/spec/sdlc-cockpit/`, `tests/unit/` | — |

## File Structure

```
openspec/changes/sdlc-cockpit-k2-daemon/
├── proposal.md                          # Diese Änderung
├── design.md                            # Implementierungsdesign
├── specs/
│   └── sdlc-cockpit.md                  # Delta-Spec (Parent: sdlc-cockpit)
└── tasks.md                             # Diese Datei
```

```
.lavish/kit/
├── adapter.js                           # [K2-ersetzt] Browser-Adapter → Daemon
└── daemon/                              # [K2-neu]
    ├── server.ts                        # HTTP-Server (Hono), Routing, Token
    ├── routes/
    │   ├── cockpit.ts                   # /api/admin/cockpit/* → ticket-mcp
    │   ├── cluster.ts                   # /api/admin/cluster/* → kubectl
    │   ├── factory.ts                   # /api/admin/factory-control → factory-mcp
    │   ├── custom.ts                    # /api/cockpit/agents, /ci, /models
    │   └── stream.ts                    # SSE-Endpoints
    ├── sources/
    │   ├── kubectl.ts                   # kubectl --context fleet Wrapper
    │   ├── gh-axi.ts                    # gh-axi Wrapper
    │   ├── git.ts                       # git Status, Worktree-Liste
    │   ├── agent-lock.ts               # agent-lock.sh list Parser
    │   ├── ticket-mcp.ts               # ticket-mcp CLI Wrapper
    │   ├── factory-mcp.ts              # factory-mcp CLI Wrapper
    │   ├── opencode-db.ts              # opencode.db SQLite Reader
    │   └── model-health.ts             # Port-Check via Health-Endpoint
    ├── lib/
    │   ├── token.ts                    # Token-Generierung, Prüfung, Audit
    │   ├── exec.ts                     # child_process.exec Wrapper
    │   ├── cache.ts                    # In-Memory Cache mit TTL
    │   └── sse.ts                      # SSE-Helfer
    └── audit.jsonl                     # Append-only Audit-Log
```

```
tests/
├── spec/sdlc-cockpit/
│   ├── adapter-contract.bats           # Vertragstreue: 8 Methoden, Signaturen
│   ├── daemon-endpoints.bats           # Daemon-Endpoints existieren
│   ├── no-silent-fallback.bats         # D13: Kein Null/Strich/Beispielwert
│   ├── freshness-timestamp.bats        # D12: fetchedAt in jeder Antwort
│   └── daemon-token-mode.bats          # Token: 0600, POST→401 ohne Token
└── unit/
    ├── cockpit-adapter.test.ts         # poll(), unsubscribe(), D10/D11
    └── cockpit-daemon-cache.test.ts    # Cache mit TTL, staleSince
```

## Quality Gates

- `task test:changed` — nur K2-relevante Tests
- `npm run typecheck --prefix brett && npm test --prefix brett && npm run build --prefix brett`
- `npm --prefix website run test:unit`
- `task freshness:check` (test-inventory.json muss aktuell sein)
- `task test:code-quality`
