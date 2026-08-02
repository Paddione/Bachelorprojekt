---
title: "mcp-registry-ssot — Implementation Plan"
ticket_id: T002300
domains: [mcp, agent-config, tests]
status: active
file_locks: []
shared_changes: false
batch_id: null
parent_feature: T002299
depends_on_plans: []
---

# mcp-registry-ssot — Implementation Plan

_Ticket: T002300 — Kind K1 von Epic T002299._

Design: `openspec/changes/mcp-registry-ssot/design.md`.
Proposal: `openspec/changes/mcp-registry-ssot/proposal.md`.

## File Structure

```
NEU:
  docs/agent-guide/registry/mcp.yaml
  scripts/mcp-sync.sh

GEAENDERT:
  Taskfile.yml                       (Tasks mcp:sync und mcp:check — S4-Pflicht)
  .mcp.json                          (gerendert)
  .opencode/opencode.jsonc           (nur der mcp-Block, gerendert)
  tests/spec/mcp-gateway.bats        (Drift-Assertions ergaenzt)

AUSSERHALB DES REPOS (nur bei render, nie committet):
  ~/.gemini/config/mcp_config.json
```

### S1-Budgets

Nur `scripts/mcp-sync.sh` faellt unter `s1.limits` (`.sh`, Limit 500). Es ist eine neue Datei,
also nicht gebaselined; die wirksame Schwelle ist das statische Limit und die Reserve ist voll.
`.yaml`, `.yml`, `.json`, `.jsonc` und `.bats` stehen nicht in `s1.limits` — `Taskfile.yml`,
`mcp.yaml`, `.mcp.json`, `.opencode/opencode.jsonc` und `tests/spec/mcp-gateway.bats` sind
daher nicht S1-gated.

Dieser Change fasst **keine** bestehende gated Datei an. Es gibt kein Zeilenbudget zu wahren und
keinen Split einzuplanen.

## Abgrenzung

Die drei Emitter-Skripte unter `scripts/agent-guide/` (Loader, Validator, Karten-Emitter) werden
bewusst **nicht** angefasst — siehe Design E2. `scripts/mcp-sync.sh` parst die Registry selbst.
Das haelt diesen Change frei von Dateikollisionen mit T002304 (K5), das genau diese drei Skripte
erweitert, und macht die beiden Changes parallelisierbar.

## Partials

| id | plan | rolle | target_files | depends_on |
|----|------|-------|--------------|------------|
| p1 | `tasks.d/p1-registry.md` | impl | `docs/agent-guide/registry/mcp.yaml` |  |
| p2 | `tasks.d/p2-generator.md` | impl | `scripts/mcp-sync.sh`, `Taskfile.yml` | p1 |
| p3 | `tasks.d/p3-render.md` | impl | `.mcp.json`, `.opencode/opencode.jsonc` | p2 |
| p4 | `tasks.d/p4-drift-gate.md` | tests | `tests/spec/mcp-gateway.bats` | p1, p2, p3 |

Die `target_files`-Mengen sind disjunkt (D1). Die Kette ist sequenziell: ohne Registry nichts zu
rendern, ohne Renderer keine Ausgabe, ohne Ausgabe nichts zu pruefen.

## Verify (RED → GREEN)

- [ ] **Failing-Test-Step (RED).** Die in p4 ergaenzte Assertion ruft
      `scripts/mcp-sync.sh check` auf. Vor p1 bis p3 existiert das Skript nicht, der Test ist
      rot:

```bash
tests/unit/lib/bats-core/bin/bats tests/spec/mcp-gateway.bats
# expected: FAIL (rot — scripts/mcp-sync.sh existiert noch nicht)
```

- [ ] **Fix-Step (GREEN).** Nach p1 bis p3 laeuft derselbe Aufruf gruen:

```bash
tests/unit/lib/bats-core/bin/bats tests/spec/mcp-gateway.bats
```

- [ ] **Roundtrip-Beweis.** Ein `render` direkt nach einem gruenen `check` darf keinen Diff
      erzeugen — sonst ist der Renderer nicht idempotent:

```bash
bash scripts/mcp-sync.sh render
git diff --exit-code .mcp.json .opencode/opencode.jsonc
```

- [ ] **Drift wird erkannt.** Kuenstlich einen Server aus `.mcp.json` entfernen und pruefen,
      dass `check` rot wird. Danach zuruecknehmen:

```bash
bash scripts/mcp-sync.sh check   # erwartet: exit != 0 bei manipulierter Datei
```

- [ ] **Kommentare ueberleben.** Die Begruendungskommentare an den deaktivierten Servern in
      `.opencode/opencode.jsonc` muessen nach dem Rendern unveraendert vorhanden sein:

```bash
grep -c 'zero references in this repo\|not project-relevant\|avoid context bloat' .opencode/opencode.jsonc
```

- [ ] **Final Verification.** Die drei verpflichtenden CI-Gates:

```bash
task test:changed
task freshness:regenerate
task freshness:check
```
