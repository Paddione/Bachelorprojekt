---
title: "Partial p3 — orchestrator.md & local-subagent.md context-tuning"
ticket_id: "T900074"
change: "opencode-factory-context-tuning"
parent_spec: "llm-local-dev"
domains: ["prompts", "agent-ops"]
status: "draft"
created: "2026-09-04"
---

# p3 — Orchestrator & Local-Subagent Prompts (orchestrator-ops)

## File Structure

```
.opencode/prompts/orchestrator.md      # modified (54 → ~68 lines)
.opencode/prompts/local-subagent.md    # modified (26 → ~36 lines)
```

Neither file is in `docs/code-quality/baseline.json` (no S1 violation).

## Change Summary

Operating-goal discipline, fresh-session/task-packet conventions,
research/implementation separation, information-form tool output,
`Done when` / `Stop when`, `Rejected approaches`, compact-at-transition
and poisoning handling. Both prompts stay slim — no global AGENTS.md
material duplicated.

> Model-string drift note: `orchestrator.md` line 1 names a stale model
> (`qwen38-220k` loadout language); since T014105 the family is
> model-agnostic on `freetoken-local/active`. Separate fix — not in scope.

## orchestrator.md — Before & After

### A1. Operating goal (new H2 after line 1, before "Dispatch Strategy")

```markdown
## Operating target

- **Active:** 60–100k tokens. **Tail:** 12–20k tokens.
- **200k** emergency reserve only (escalation, handoff compaction).
- Compaction triggers at ≈104k active (buffer 96k, keep 16k).
```

### B1. Dispatch Strategy — fresh sessions + research≠implement

Extend the dispatch rules (after the "self-contained goal" bullet):

```markdown
- Each dispatch: one self-contained task packet with goal, files, acceptance,
  `Done when`, `Stop when`, and `Rejected approaches`.
- **Fresh session per ticket/partial:** dispatcher is persistent+light;
  implementation starts fresh per ticket/partial. Continuity travels via Git,
  tickets, specs, and handoff artifacts — not via long-running conversations.
- **Research ≠ implement:** research sessions yield symbols and findings only;
  implementation sessions start clean.
```

### C1. Task packet stopping conditions (new bullets)

```markdown
- `Done when`: requested behavior implemented, specified tests pass, no
  unrelated files changed, commit created, ticket updated with test evidence.
- `Stop when`: same failure 3×, missing credential, spec conflict, or edits
  would leave the assigned file boundary. Retry limits are context management.
```

### D1. Rejected approaches (new H3 after Observability)

```markdown
### Rejected approaches

- X: failed because <exact error/reason>
- Y: incompatible with constraint Z
```

### E1. Compact at phase transitions (new bullets)

```markdown
- Compact after: investigation → implementation, implementation → testing,
  confirmed cause after failed approaches, large test/build runs, one partial
  done before the next. Preserve: ticket+partial, constraints, decisions+reasons,
  changed files, exact unresolved errors, passed tests, rejected approaches,
  next concrete action.
```

### F1. Context-poisoning watch (new bullets)

```markdown
- Poisoning symptoms: reopening the same files, forgetting recent constraints,
  resurrecting rejected solutions, calling unrelated tools, ever-longer plans,
  edits outside scope. Action: write a handoff, start a fresh session.
```

## local-subagent.md — Before & After

### A1. Information-shaped tool output (new H3)

```markdown
## Tool output discipline

- Prefer: `pytest -q --tb=short`, `git diff --stat`, scoped `rg`, scoped diffs.
- Huge output → artifact file; show the model only: exit code, summary, first
  relevant error + surrounding lines, artifact path.
```

### B1. Partial sizing + stopping (new bullets)

```markdown
- Cap a partial at ~3–7 implementation files unless the change is mechanical;
  split implementation from broad regression tests.
- `Done when` / `Stop when` per task packet; stop after the 3rd identical failure.
```

## Acceptance Criteria

- [ ] `orchestrator.md` carries the operating-target H2 (60–100k / 12–20k / 200k).
- [ ] Dispatch Strategy has fresh-session + research≠implement + Done/Stop rules.
- [ ] `Rejected approaches` section present; phase-transition + poisoning rules present.
- [ ] `local-subagent.md` has tool-output discipline + partial-sizing rules.
- [ ] No TBD/TODO/FIXME placeholders in either file.
- [ ] `orchestrator.md` ≤ 80 lines, `local-subagent.md` ≤ 50 lines.
- [ ] Git diff touches only these two files.

## Not in Scope

- **Tests** — p6 owns the test steps. This partial has **no** Failing-Test-Step
  by design.
- Compaction config, tool permissions, AGENTS.md — other partials.
