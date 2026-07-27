---
title: "agent-definitions-unification — Implementation Plan"
ticket_id: T002304
domains: [agent-config, agents, tests]
status: active
file_locks: []
shared_changes: false
batch_id: null
parent_feature: T002299
depends_on_plans: []
---

# agent-definitions-unification — Implementation Plan

_Ticket: T002304 — Kind K5 von Epic T002299. Behebt zusätzlich T002308._

Design: `openspec/changes/agent-definitions-unification/design.md`.
Proposal: `openspec/changes/agent-definitions-unification/proposal.md`.

## File Structure

```
NEU:
  docs/agent-guide/registry/agents.yaml
  docs/agent-guide/maps/agents-map.md          (generiert)
  tests/spec/agent-roster.bats

GEAENDERT:
  scripts/agent-guide/load.mjs                 (agents.yaml mitladen)
  scripts/agent-guide/validate.mjs             (agents.yaml validieren)
  scripts/agent-guide/emit-maps.mjs            (Agenten-Karte + T002308-Fix)
  CLAUDE.md                                    (nur der Subagent-Layout-Block)
  website/src/data/test-inventory.json         (regeneriert)
```

### S1-Budgets

Nur `.mjs` ist hier S1-gated (`docs/code-quality/gates.yaml`, `s1.limits`, Limit 500). Keine der
drei Dateien ist gebaselined, die wirksame Schwelle ist also das statische Limit.

| Datei | Ist | Budget |
|---|---|---|
| `scripts/agent-guide/load.mjs` | 43 | 457 |
| `scripts/agent-guide/validate.mjs` | 145 | 355 |
| `scripts/agent-guide/emit-maps.mjs` | 292 | 208 |

`CLAUDE.md`, `agents.yaml`, `agents-map.md` und `tests/spec/agent-roster.bats` haben keine
Extension in `s1.limits` und sind nicht S1-gated. Kein Split nötig — die engste Reserve ist
`emit-maps.mjs` mit 208 Zeilen für ein Karten-Template von rund 40.

## Partials

| id | plan | rolle | target_files | depends_on |
|----|------|-------|--------------|------------|
| p1 | `tasks.d/p1-registry.md` | impl | `docs/agent-guide/registry/agents.yaml` |  |
| p2 | `tasks.d/p2-loader-validator.md` | impl | `scripts/agent-guide/load.mjs`, `scripts/agent-guide/validate.mjs` | p1 |
| p3 | `tasks.d/p3-emitter-and-claudemd.md` | impl | `scripts/agent-guide/emit-maps.mjs`, `docs/agent-guide/maps/agents-map.md`, `CLAUDE.md` | p2 |
| p4 | `tasks.d/p4-drift-gate.md` | tests | `tests/spec/agent-roster.bats`, `website/src/data/test-inventory.json` | p1, p2, p3 |

Die `target_files`-Mengen sind disjunkt (D1). Die Kette ist streng sequenziell: ohne Registry
nichts zu laden, ohne Loader nichts zu emittieren, ohne Karte nichts zu prüfen.

## Verify (RED → GREEN)

- [ ] **Failing-Test-Step (RED).** `tests/spec/agent-roster.bats` aus p4 prüft, dass jeder in
      `CLAUDE.md` genannte Agentenname in der Registry vorkommt. Vor p3 nennt `CLAUDE.md` noch
      `qwen35-iq4`, `qwen35`, `qwen35-hq` und `qwen3-14b`, die es nirgends gibt:

```bash
tests/unit/lib/bats-core/bin/bats tests/spec/agent-roster.bats
# expected: FAIL (rot — CLAUDE.md nennt vier Agenten, die weder in roles noch in runtimes stehen)
```

- [ ] **Fix-Step (GREEN).** Nach p1 bis p3 läuft derselbe Aufruf grün:

```bash
tests/unit/lib/bats-core/bin/bats tests/spec/agent-roster.bats
```

- [ ] **Karte ist reproduzierbar.** Ein zweiter Emitter-Lauf darf keinen Diff erzeugen:

```bash
task agent-guide:maps
git diff --exit-code docs/agent-guide/maps/agents-map.md
```

- [ ] **T002308 verifiziert.** Nach einem erzwungenermaßen fehlgeschlagenen Emitter-Lauf darf
      keine `.tmp`-Datei zurückbleiben:

```bash
ls docs/agent-guide/maps/*.tmp 2>/dev/null && echo "FEHLER: tmp-Reste" || echo "OK: keine tmp-Reste"
```

- [ ] **Registry-Validator.**

```bash
task test:agent-guide
```

- [ ] **Final Verification.** Die drei verpflichtenden CI-Gates:

```bash
task test:changed
task freshness:regenerate
task freshness:check
```

      `freshness:regenerate` ruft `agent-guide:emit` mit auf und zieht damit die neue Karte sowie
      `website/src/lib/agent-guide.generated.json` nach. Alle regenerierten Artefakte
      mitcommitten, sonst schlägt der Freshness-Vergleich in CI fehl.
