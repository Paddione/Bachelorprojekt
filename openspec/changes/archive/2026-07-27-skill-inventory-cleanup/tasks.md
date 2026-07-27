---
title: "skill-inventory-cleanup — Implementation Plan"
ticket_id: T002302
domains: [agent-config, skills, tests]
status: completed
file_locks: []
shared_changes: false
batch_id: null
parent_feature: T002299
depends_on_plans: []
---

# skill-inventory-cleanup — Implementation Plan

_Ticket: T002302 — Kind K3 von Epic T002299._

Design: `openspec/changes/skill-inventory-cleanup/design.md`.
Proposal: `openspec/changes/skill-inventory-cleanup/proposal.md`.

## File Structure

```
ENTFERNT (11 getrackte Skill-Verzeichnisse, je SKILL.md + references/):
  .claude/skills/test-driven-development/
  .claude/skills/verification-before-completion/
  .claude/skills/requesting-code-review/
  .claude/skills/superpowers-brainstorming/
  .claude/skills/superpowers-writing-plans/
  .claude/skills/superpowers-executing-plans/
  .claude/skills/llm-ops/
  .claude/skills/gguf-quantization/
  .claude/skills/llama-cpp/
  .claude/skills/speculative-decoding/
  .claude/skills/unsloth/

ENTFERNT (Tests + SSOT-Specs der zwei spec'd Stubs):
  tests/spec/superpowers-writing-plans.bats
  tests/spec/superpowers-executing-plans.bats
  openspec/specs/superpowers-writing-plans.md
  openspec/specs/superpowers-executing-plans.md

NEU:
  tests/spec/dev-flow-execute.bats

GEAENDERT:
  skills-lock.json
  .claude/skills/OVERVIEW.md
  .claude/skills/dev-flow-plan/SKILL.md
  .claude/skills/dev-flow-execute/SKILL.md
  .claude/skills/infra-ops/SKILL.md
  .claude/agents/bachelorprojekt-ops.md
  .opencode/opencode.jsonc
  .claude/lib/goals.md
  tests/spec/dev-flow-plan.bats
  website/src/data/test-inventory.json          (regeneriert)
  website/src/lib/goals-data.generated.json     (regeneriert)
  docs/code-quality/repo-index.json             (regeneriert)
  k3d/docs-content-built/                       (regeneriert)
```

**S1-Exposition: keine.** Keine der geänderten Dateien hat eine in `docs/code-quality/gates.yaml`
unter `s1.limits` gelistete Extension — dort stehen nur `.astro .ts .svelte .sh .mjs .mts .py
.js .jsx .tsx .cjs .bash .java .php`. Dieser Change fasst ausschließlich `.md`, `.bats`, `.json`
und `.jsonc` an, plus Verzeichnislöschungen. Es gibt daher kein Zeilenbudget zu wahren und keinen
Split einzuplanen.

## Partials

| id | plan | rolle | target_files | depends_on |
|----|------|-------|--------------|------------|
| p1 | `tasks.d/p1-remove-skill-dirs.md` | impl | `.claude/skills/test-driven-development/`, `.claude/skills/verification-before-completion/`, `.claude/skills/requesting-code-review/`, `.claude/skills/superpowers-brainstorming/`, `.claude/skills/superpowers-writing-plans/`, `.claude/skills/superpowers-executing-plans/`, `.claude/skills/llm-ops/`, `.claude/skills/gguf-quantization/`, `.claude/skills/llama-cpp/`, `.claude/skills/speculative-decoding/`, `.claude/skills/unsloth/`, `skills-lock.json` |  |
| p2 | `tasks.d/p2-crossrefs.md` | impl | `.claude/skills/OVERVIEW.md`, `.claude/skills/dev-flow-plan/SKILL.md`, `.claude/skills/dev-flow-execute/SKILL.md`, `.claude/skills/infra-ops/SKILL.md`, `.claude/agents/bachelorprojekt-ops.md` | p1 |
| p3 | `tasks.d/p3-harness-and-goals.md` | impl | `.opencode/opencode.jsonc`, `.claude/lib/goals.md` | p1 |
| p4 | `tasks.d/p4-tests-and-specs.md` | tests | `tests/spec/dev-flow-plan.bats`, `tests/spec/dev-flow-execute.bats`, `tests/spec/superpowers-writing-plans.bats`, `tests/spec/superpowers-executing-plans.bats`, `openspec/specs/superpowers-writing-plans.md`, `openspec/specs/superpowers-executing-plans.md` | p1, p2, p3 |

Die `target_files`-Mengen sind disjunkt (D1). `p2` und `p3` hängen beide an `p1`, weil beide
Zählwerte oder Verweise gegen den Ist-Zustand nach der Löschung setzen; sie sind untereinander
unabhängig und können parallel laufen. `p4` läuft zuletzt, weil es den Gesamtzustand verifiziert
und die generierten Artefakte neu zieht.

## Verify (RED → GREEN)

- [ ] **Failing-Test-Step (RED).** Der neue Test in `tests/spec/dev-flow-execute.bats` (aus p4)
      prüft, dass `dev-flow-execute/SKILL.md` den Worktree-Isolations-Check, den Branch-Guard
      und `gh pr merge --squash` enthält, und dass **kein** `.claude/skills/superpowers-*`
      Verzeichnis mehr getrackt ist. Vor der Umsetzung von p1 schlägt die Verzeichnis-Assertion
      fehl:

```bash
tests/unit/lib/bats-core/bin/bats tests/spec/dev-flow-execute.bats
# expected: FAIL (rot — die Stub-Verzeichnisse existieren noch)
```

- [ ] **Fix-Step (GREEN).** Nach p1 bis p3 läuft derselbe Aufruf grün:

```bash
tests/unit/lib/bats-core/bin/bats tests/spec/dev-flow-execute.bats tests/spec/dev-flow-plan.bats
```

- [ ] **Inventar-Assertion.** Getrackte `SKILL.md` müssen von 39 auf 28 fallen und der in
      `OVERVIEW.md` behauptete Zähler muss exakt diesem Wert entsprechen (G-AGENTIC06 = 0):

```bash
git ls-files -- .claude/skills | grep -c '/SKILL\.md$'   # erwartet: 28
bash scripts/health-goals-check.sh 2>/dev/null | grep -E 'G-AGENTIC0[67]'
```

- [ ] **OpenSpec-Gate.** Die beiden entfernten SSOT-Specs sind im Delta als REMOVED
      dokumentiert; der Validator muss grün bleiben:

```bash
task openspec:validate
```

- [ ] **Final Verification.** Die drei verpflichtenden CI-Gates:

```bash
task test:changed
task freshness:regenerate
task freshness:check
```

      `freshness:regenerate` zieht `website/src/data/test-inventory.json`,
      `website/src/lib/goals-data.generated.json` und `docs/code-quality/repo-index.json` nach.
      Alle regenerierten Artefakte müssen mitcommittet werden, sonst schlägt der
      Inventar-Check in CI fehl.
