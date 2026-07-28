---
title: "bge-dual-pair-failover — zweites bge-Paar, MCP-Shim und gegenseitiges Failover"
ticket_id: T002426
domains: [infra, website, llm]
status: plan_staged
file_locks: []
shared_changes: false
batch_id: null
parent_feature: null
depends_on_plans: []
---

# bge-dual-pair-failover — Implementation Plan

Stellt neben das bestehende GPU-Paar (`:8095` Embedding, `:8096` Rerank aus T002110) ein zweites,
CPU-gebundenes Paar für Batch- und Reindex-Last, führt einen MCP-Shim als gemeinsame
Zugriffsschicht ein und verbindet beide Paare zu einer bidirektionalen Failover-Route, die sowohl
auf Ausfall als auch auf Überlast reagiert.

Design, verworfene Alternativen und die bekannte Grenze des Host-SPOF:
`openspec/changes/bge-dual-pair-failover/proposal.md`.

_Ticket: T002426_

## File Structure

| Datei | Ist | Budget |
| --- | --- | --- |
| `website/src/lib/embeddings.ts` | 198 | 402 |
| `website/src/lib/rerank.ts` | 83 | 517 |
| `website/src/lib/embeddings.test.ts` | 186 | 414 |
| `website/src/lib/rerank.test.ts` | 103 | 497 |
| `scripts/llm-proxy/runner.mjs` | 110 | 390 |
| `scripts/llm-proxy/runner.test.mjs` | 125 | 375 |
| `scripts/llm-proxy/loadouts.mjs` | 100 | 400 |
| `scripts/llm-proxy/server.test.mjs` | 166 | 334 |
| `tests/spec/llm-pipeline.bats` | 589 | — |
| `tests/spec/local-llm-proxy.bats` | 406 | — |

Neue Dateien mit S1-Gate: `website/src/lib/bge-router.ts` (`.ts`, Limit 600),
`website/src/lib/bge-router.test.ts` (`.ts`, Limit 600), `website/src/pages/api/bge/retrieve.ts`
(`.ts`, Limit 600), `website/src/pages/api/bge/changes.ts` (`.ts`, Limit 600),
`scripts/bge-mcp/server.mjs` (`.mjs`, Limit 500). Alle werden deutlich unter ihrer Schwelle
geschnitten; der Router ist die einzige Datei mit nennenswertem Umfang und bleibt unter 300
Zeilen, weil Health-Probing und Routing-Entscheidung getrennte Funktionen bleiben.

Ungegatete Dateien ohne S1-Extension-Grenze: `scripts/llm/start-embed-batch-server.ps1`,
`scripts/llm/start-rerank-batch-server.ps1`, `scripts/llm/register-scheduled-tasks.ps1`,
`scripts/llm/watchdog-llm-servers.ps1`, `scripts/llm/loadouts.json`,
`scripts/llm/mcp-servers.json`, `docs/agent-guide/registry/mcp.yaml`,
`environments/schema.yaml`, `environments/dev.yaml`, `environments/mentolder.yaml`,
`environments/korczewski.yaml`, `environments/staging.yaml`,
`environments/fleet-mentolder.yaml`, `environments/fleet-korczewski.yaml`, `k3d/llm-gpu.yaml`,
`tests/spec/llm-pipeline/dual-pair-failover.bats`, `.mcp.json`, `.opencode/opencode.jsonc`.

`.mcp.json` und `.opencode/opencode.jsonc` werden in `p4` **nicht von Hand editiert**, sondern von
`task mcp:sync` aus der Registry regeneriert; sie stehen im Manifest, weil der Commit sie enthält.

Keine der bestehenden Dateien steht in `docs/code-quality/baseline.json`; die wirksame Schwelle
ist damit überall das statische Extension-Limit. Keine Datei kommt ihrer Schwelle nahe, ein
Split oder eine Verkleinerung ist an keiner Stelle erforderlich.

CQ02: Dieser Plan führt keine `any`-Typen ein. Die Antwortformen von `llama-server`
(Embedding, Rerank, Health) werden als explizite Interfaces typisiert.

## Partials

| id | Datei | Rolle | target_files | depends_on |
| --- | --- | --- | --- | --- |
| p1 | `tasks.d/p1-batch-host.md` | impl | `scripts/llm/start-embed-batch-server.ps1`, `scripts/llm/start-rerank-batch-server.ps1`, `scripts/llm/register-scheduled-tasks.ps1`, `scripts/llm/watchdog-llm-servers.ps1`, `scripts/llm/loadouts.json`, `scripts/llm-proxy/runner.mjs` | |
| p2 | `tasks.d/p2-failover-router.md` | impl | `website/src/lib/bge-router.ts`, `website/src/lib/embeddings.ts`, `website/src/lib/rerank.ts` | p1 |
| p3 | `tasks.d/p3-retrieval-api.md` | impl | `website/src/pages/api/bge/retrieve.ts`, `website/src/pages/api/bge/changes.ts` | p2 |
| p4 | `tasks.d/p4-mcp-shim.md` | impl | `scripts/bge-mcp/server.mjs`, `scripts/llm/mcp-servers.json`, `docs/agent-guide/registry/mcp.yaml`, `.mcp.json`, `.opencode/opencode.jsonc` | p2 |
| p5 | `tasks.d/p5-config.md` | impl | `environments/schema.yaml`, `environments/dev.yaml`, `environments/mentolder.yaml`, `environments/korczewski.yaml`, `environments/staging.yaml`, `environments/fleet-mentolder.yaml`, `environments/fleet-korczewski.yaml`, `k3d/llm-gpu.yaml` | p1 |
| p6 | `tasks.d/p6-tests.md` | tests | `website/src/lib/bge-router.test.ts`, `website/src/lib/embeddings.test.ts`, `website/src/lib/rerank.test.ts`, `tests/spec/llm-pipeline/dual-pair-failover.bats`, `website/src/data/test-inventory.json`, `scripts/llm-proxy/runner.test.mjs`, `scripts/llm-proxy/loadouts.mjs`, `scripts/llm-proxy/server.test.mjs`, `tests/spec/llm-pipeline.bats`, `tests/spec/local-llm-proxy.bats` | p1, p2, p3, p4, p5 |

Vier Dateien kamen beim Umsetzen zu `p6` hinzu, weil bestehende Guards die neuen
Artefakte sonst falsch-negativ abgelehnt haetten — der Befund gehoert in den Plan, nicht in
einen stillen Nebenbei-Commit:

- `scripts/llm-proxy/loadouts.mjs` — `ARG_KEYS` kannte `uiMcpProxy` nicht; ohne den Eintrag
  faellt die fail-closed-Validierung ueber das neue Loadout-Feld aus `p1`.
- `scripts/llm-proxy/server.test.mjs` und `tests/spec/local-llm-proxy.bats` — der
  T002394-Guard „kein Loadout pinnt ctx oder ngl" galt pauschal und haette damit jedes
  bewusst CPU-gebundene Loadout (`-ngl 0`) verboten. Er gilt jetzt fuer Loadouts **mit**
  `--fit`; fuer `fit.enabled=false` verlangt `validateLoadout()` das Gegenteil.
- `tests/spec/llm-pipeline.bats` — zwei Bestandsassertions: das Adressliteral `llm-gateway`
  steht nicht mehr in `embeddings.ts` (es ist in den Router gewandert), und der Watchdog
  deckt jetzt fuenf statt drei Server ab. Beide pruefen nun die Aussage ihres Titels statt
  einer festen Zahl bzw. eines Literals.

`p2` hängt an `p1`, weil erst die Startskripte die Ports des Batch-Paars festschreiben, gegen die
der Router routet. `p3` und `p4` hängen an `p2`, weil beide dieselbe Router-Funktion aufrufen
statt eigene Failover-Logik mitzubringen — das ist der Kern der Indirektion. `p5` hängt an `p1`
aus demselben Portgrund wie `p2`. `p6` hängt an allen, weil die Assertions gegen die dann
vorhandenen Dateien und Signaturen laufen. Der rot→grün-Failing-Test-Step liegt in `p6`.

## Task 7 — Final verification

Nach Abschluss aller Partials, im Worktree ausführen:

```bash
task test:changed
task freshness:regenerate
task freshness:check
bash scripts/plan-lint.sh openspec/changes/bge-dual-pair-failover/tasks.md
task openspec:validate
```

Alle fünf Kommandos müssen fehlerfrei durchlaufen. `task freshness:regenerate` läuft vor
`task freshness:check`, sonst schlägt der Check an der nicht regenerierten Test-Inventory fehl.
