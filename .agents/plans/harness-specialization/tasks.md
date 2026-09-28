---
title: harness-specialization implementation plan
ticket_id: T900791
domains: [agents, toolset, developer-experience]
status: staged
file_locks: []
shared_changes: false
batch_id: null
parent_feature: null
depends_on_plans: []
---

# harness-specialization — Implementation Plan

_partial-index_

Zweck: Jede Harness bekommt in `capabilities.yaml` eine Aufgabe, einen Anbieter, ein
Standardmodell und Rollen. `sync.mjs` erzeugt daraus die MCP-Freischaltung für claude und
opencode, `check.mjs` meldet Drift, unbekannte Rollen und verbotene Anbieter (DeepSeek).
Spec: `.agents/plans/harness-specialization/design.md` (Abschnitte 1–3, Entscheidungen D1–D9).
Alle Fakten unten am 2026-09-28 live erhoben.

## File Structure

### New files

- `scripts/toolset/lib/resolve.mjs` — Harness-Schema-Validierung und Werkzeugsatz-Auflösung
- `scripts/toolset/lib/adapters/claude.mjs` — Adapter `.claude/settings.json`
- `scripts/toolset/lib/adapters/opencode.mjs` — Adapter `.opencode/opencode.jsonc`
- `scripts/toolset/lib/adapters/index.mjs` — Adapter-Tabelle
- `scripts/toolset/lib/adapters/adapters.test.mjs` — node:test für beide Adapter
- `tests/spec/toolset-registry/harness-specialization.bats` — Ausgabe-Tests für check/sync
- `docs/agent-guide/registry/harness-config-targets.md` — Messprotokoll Konfigurationsziele

### Changed files

| Datei | Ist | Budget |
|---|---|---|
| `scripts/toolset/check.mjs` | 183 | 547 |
| `scripts/toolset/sync.mjs` | 100 | 646 |
| `scripts/toolset/lib/registry.mjs` | 88 | 710 |

- `docs/agent-guide/registry/capabilities.yaml` (Ist 943, .yaml nicht S1-gated, kein numerisches Budget)
- `.claude/settings.json` (durch den echten Sync-Lauf, erwarteter Effekt E1; .json nicht S1-gated)
- `components/website/src/data/test-inventory.json` (nur falls die Regeneration sie ändert; .json nicht S1-gated)

S1: Budgets gegen das statische `.mjs`-Limit 800 (`yq '.s1.limits' docs/code-quality/gates.yaml`),
alle drei Dateien `nicht-baselined`
(`jq -r '."S1:scripts/toolset/check.mjs".metric // "nicht-baselined"' docs/code-quality/baseline.json`).
Ist = Stand bei Planung, Budget = Restbudget nach Umsetzung (B1a: 800 − aktuelle Zeilen).

Prior art (T002829): `grep -rn -e 'scripts/toolset' -e 'capabilities.yaml' docs/adr/` ohne
Treffer. `grep -rln 'toolset/sync.mjs\|toolset/check.mjs' tests/spec/` trifft die Suite
`tests/spec/toolset-registry/`, die p5 erweitert. Die bestehende Semantik der Rollen-Wildcard
steht in `scripts/toolset-context.sh:27-51` und wird übernommen, nicht verändert.

## Partials

| id | plan | role | target_files | depends_on | min_tier | ctx_tokens |
|----|------|------|--------------|------------|----------|------------|
| p1 | tasks.d/p1-registry.md | impl | docs/agent-guide/registry/capabilities.yaml, scripts/toolset/lib/registry.mjs, scripts/toolset/lib/resolve.mjs |  | 27b-local | 60000 |
| p2 | tasks.d/p2-adapters.md | impl | scripts/toolset/lib/adapters/claude.mjs, scripts/toolset/lib/adapters/opencode.mjs, scripts/toolset/lib/adapters/index.mjs | p1 | 27b-local | 60000 |
| p3 | tasks.d/p3-measure.md | docs | docs/agent-guide/registry/harness-config-targets.md |  | 27b-local | 40000 |
| p4 | tasks.d/p4-sync-check.md | impl | scripts/toolset/sync.mjs, scripts/toolset/check.mjs, .claude/settings.json | p5 | 27b-local | 90000 |
| p5 | tasks.d/p5-tests.md | tests | scripts/toolset/lib/adapters/adapters.test.mjs, tests/spec/toolset-registry/harness-specialization.bats, components/website/src/data/test-inventory.json | p2 | 27b-local | 80000 |

Reihenfolge: p1 → p2 → p5 (Tests, rot) → p4 (grün) → Task 6. p4 hängt deshalb von p5 ab,
nicht umgekehrt. p3 ist unabhängig und kann jederzeit laufen. Jedes Partial committet nur seine eigenen Dateien mit expliziten Pfaden als
`feat(T900791): <betreff> [T900791]`, nie `git add -A`. Vor jedem Commit auf den neuesten
`origin/main` rebasen.

## Task 6: Finale Verifikation über alle Partials

Steps:

1. Aus dem Worktree-Root:
   - `task test:changed`
   - `task freshness:regenerate`
   - `task freshness:check`
2. `node scripts/toolset/check.mjs` gegen das echte Repo: Exit 0, Ausgabe endet mit
   `Toolset registry check passed.`
3. `node scripts/toolset/sync.mjs --dry-run` gegen das echte Repo: keine Diff-Ausgabe (Drift 0).
4. `bash scripts/plan-lint.sh .agents/plans/harness-specialization/tasks.md`: Exit 0.
5. Kein Partial hat Dateien außerhalb seiner Manifest-Zeile berührt:
   `git diff --name-only origin/main...HEAD`.

Acceptance: alle Gate-Befehle grün, check.mjs Exit 0, Dry-Run ohne Diff, jede Manifest-Datei
existiert auf dem Branch.
