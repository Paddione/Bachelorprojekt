---
title: "opencode-flow-symlink-consolidation — Implementation Plan"
ticket_id: T013724
domains: [plan-authoring]
status: active
file_locks:
  - .claude/skills/dev-flow-execute/SKILL.md
  - .claude/skills/dev-flow-plan/SKILL.md
  - .opencode/opencode.jsonc
  - AGENTS.md
  - tests/spec/harness-workflow-split.bats
  - docs/agent-guide/registry/plan-guards.yaml
  - docs/agent-guide/registry/tools.yaml
shared_changes: false
batch_id: null
parent_feature: null
depends_on_plans: []
---

# opencode-flow-symlink-consolidation — Implementation Plan

_Ticket: T013724_

## File Structure

```
.claude/skills/dev-flow-execute/SKILL.md      # 2x subagent_type neutralisiert (M1)
.claude/skills/dev-flow-plan/SKILL.md         # plan-intel.sh + agent-collision Anker, stale Selbstreferenzen, background-agents.ts (M2)
.opencode/skills/opencode-flow-plan           # DIR -> Symlink ../../.claude/skills/dev-flow-plan (M3)
.opencode/skills/opencode-flow-execute        # DIR -> Symlink ../../.claude/skills/dev-flow-execute (M3)
.opencode/skills/opencode-flow-chore          # DIR -> Symlink ../../.claude/skills/dev-flow-chore (M3)
tests/spec/harness-workflow-split.bats        # HWS-1..5 auf Symlink-Vertrag umgeschrieben (M4)
.opencode/opencode.jsonc                      # 4 dev-flow-Denies entfernt, Kommentar aktualisiert (M5)
AGENTS.md                                     # Routing-Text: Shared-Source (M6)
docs/agent-guide/registry/plan-guards.yaml    # applies_to -> kanonische Quelle, T002444-Kommentar (M7)
docs/agent-guide/registry/tools.yaml          # opencode-flow-plan Text aktualisiert (M7)
docs/agent-guide/maps/*.md                    # regeneriert (M8)
components/website/src/lib/agent-guide.generated.json  # regeneriert (M8)
.claude/skills/OVERVIEW.md                    # eine Zeile zum Symlink-Arrangement (M9)
```

## Milestones

- [ ] **M1 — dev-flow-execute neutralisieren.** Zeile 78 (`subagent_type: general-purpose`)
      und Zeile 222 (`subagent_type: general-purpose`) in harness-neutrale Formulierungen
      überführen; die Gemini/Claude/opencode-Bullet-Matrix bleibt erhalten.
- [ ] **M2 — dev-flow-plan Anker + Referenzen.** `scripts/plan-intel.sh` am Intel-Schritt
      nennen; `bash scripts/agent-collision.sh check --branch` vor der Worktree-Anlage
      verankern (T002444); die zwei „inlined in `opencode-flow-plan`“-Zeilen auf
      Shared-Source umstellen; opencode-Delegation via `background-agents.ts` explizit nennen.
- [ ] **M3 — Symlinks setzen.** Die drei `.opencode/skills/opencode-flow-*`-Verzeichnisse
      entfernen und als Directory-Symlinks nach `../../.claude/skills/dev-flow-*` neu anlegen
      (Muster der `openspec-*`-Einträge). `opencode-git-workflow` bleibt echte Datei.
- [ ] **M4 — BATS-Guard anpassen.** HWS-1 prüft Symlink+Resolve statt Dateiexistenz;
      HWS-2 greift die aufgelösten Ziele; HWS-3 verlangt `background-agents.ts` in den
      Quellen und `worktree.ts` weiterhin in `opencode-git-workflow`; HWS-5 prüft
      `git-workflow`-Referenz in execute/chore-Zielen.

## Verify (RED → GREEN)

- [ ] **Failing-Test-Step (RED).** HWS-Guard BEFORE M3/M4 runs green on the old
      contract; after rewriting the guard (M4) but before M3 it must FAIL because the
      flow entries are still real directories. Run after M4, before M3:

```bash
tests/unit/lib/bats-core/bin/bats tests/spec/harness-workflow-split.bats
# expected: FAIL (red — symlinks not yet in place)
```

- [ ] **Fix-Step (GREEN).** Execute M3 (symlinks) — the guard from the previous step
      must now pass, together with guard-parity and the full spec suite:

```bash
tests/unit/lib/bats-core/bin/bats tests/spec/harness-workflow-split.bats
tests/unit/lib/bats-core/bin/bats tests/spec/dev-flow-plan/guard-parity.bats
# expected: PASS (green)
```

- [ ] **Final Verification.** Run the three mandatory CI gates:

```bash
task test:changed
task freshness:regenerate
task freshness:check
```
