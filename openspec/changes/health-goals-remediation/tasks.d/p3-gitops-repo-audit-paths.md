---
title: "p3 — gitops-repo-audit dead script paths"
ticket_id: T002148
domains: [ops]
status: active
file_locks: []
shared_changes: false
batch_id: null
parent_feature: health-goals-remediation
depends_on_plans: []
---

# p3-gitops-repo-audit-paths — Implementation Plan

_Ticket: T002148 · Partial p3 of `health-goals-remediation` · Role: impl_

Fixes **G-AGENTIC08** (`scripts/health-goals-check.sh` row `G-AGENTIC08`, target `=0`):
`.claude/skills/gitops-repo-audit/SKILL.md`'s three invocation examples reference the
bundled scripts as repo-root-relative bare paths (`scripts/discover.sh`,
`scripts/validate.sh`, `scripts/check-deprecated.sh`), but the scripts actually live under
the skill's own `scripts/` subdirectory (`.claude/skills/gitops-repo-audit/scripts/*.sh`).
The gate's regex (`grep -rhoP '(?<![A-Za-z0-9_./-])scripts/[A-Za-z0-9_./-]+\.(sh|mjs|py)'
.claude/skills --include=SKILL.md`) extracts each reference and checks `[ -f "$p" ]` from
the repo root — all three currently fail that check. This is the identical class of bug the
`G-AGENTIC08` history already lists twice (`scripts/brain-ingest.mjs` in 2026-07-04,
`scripts/search.py` false-positive in 2026-07-14) — a skill's Markdown body drifting from
its own bundled-script layout. Root cause here: the invocation examples were written as if
Claude Code executes shell commands from inside the skill's own directory (a natural mental
model when authoring the skill), but the gate — and the actual runtime CWD when a skill is
invoked from an arbitrary repo root — resolves paths from the repo root, so the prefix must
be explicit.

## File Structure

```
.claude/skills/gitops-repo-audit/SKILL.md   (edit: 3 script-path prefixes, no other content change)
```

No new files. No scripts are moved — `.claude/skills/gitops-repo-audit/scripts/discover.sh`,
`.claude/skills/gitops-repo-audit/scripts/validate.sh`, and
`.claude/skills/gitops-repo-audit/scripts/check-deprecated.sh` already exist at their correct
location; only the three Markdown references are wrong.

## Tasks

### Task 3.0 — RED: confirm the dead-path bug via the shared bats suite

- [ ] Run the shared bats suite that Partial p6 (`tests/spec/health-goals-remediation.bats`,
      role `tests`, `depends_on: p1,p2,p3,p4,p5`) adds for this change, filtered to the
      `gitops-repo-audit` case, against the unmodified `SKILL.md`:

```bash
tests/unit/lib/bats-core/bin/bats tests/spec/health-goals-remediation.bats -f "gitops-repo-audit"
# expected: FAIL (red — SKILL.md:31/53/71 reference scripts/{discover,validate,check-deprecated}.sh
# without the .claude/skills/gitops-repo-audit/ prefix, so `[ -f "$p" ]` from the repo root fails
# for all three)
```

- [ ] If p6 has not yet run in this execution order, reproduce the identical assertion
      standalone with the gate's own extraction regex (same command
      `scripts/health-goals-check.sh` uses internally for `G-AGENTIC08`) as a local sanity
      check before editing:

```bash
for p in $(grep -rhoP '(?<![A-Za-z0-9_./-])scripts/[A-Za-z0-9_./-]+\.(sh|mjs|py)' \
  .claude/skills/gitops-repo-audit/SKILL.md); do [ -f "$p" ] || echo "dead: $p"; done
# expected: three "dead: scripts/..." lines (discover.sh, validate.sh, check-deprecated.sh)
```

### Task 3.1 — Fix the discovery-script reference (SKILL.md:31)

- [ ] In `.claude/skills/gitops-repo-audit/SKILL.md`, Phase 1 "Discovery", change the fenced
      ```bash``` block that currently reads:

```bash
   scripts/discover.sh -d <repo-root>
```

  to:

```bash
   .claude/skills/gitops-repo-audit/scripts/discover.sh -d <repo-root>
```

  Only the path token changes — the `-d <repo-root>` argument, the surrounding prose (lines
  33–38 explaining the JSON `.inventory` shape), and the fence's `bash` language tag are
  untouched.

### Task 3.2 — Fix the validation-script reference (SKILL.md:53)

- [ ] In Phase 2 "Manifest Validation", change the fenced ```bash``` block that currently
      reads:

```bash
bundle="$(mktemp "${TMPDIR:-/tmp}/flux-audit-bundle.XXXXXX" 2>/dev/null || true)"
scripts/validate.sh -d <repo-root> ${bundle:+-b "$bundle"}
```

  to:

```bash
bundle="$(mktemp "${TMPDIR:-/tmp}/flux-audit-bundle.XXXXXX" 2>/dev/null || true)"
.claude/skills/gitops-repo-audit/scripts/validate.sh -d <repo-root> ${bundle:+-b "$bundle"}
```

  Only the second line's path token changes — the `mktemp` line, the `${bundle:+-b "$bundle"}`
  conditional-arg pattern, and the surrounding prose (the "skipped" / `-e <dir>` explanations
  in lines 56–63) are untouched.

### Task 3.3 — Fix the deprecated-API-check reference (SKILL.md:71)

- [ ] In Phase 3 "API Compliance", change the fenced (untagged) code block that currently
      reads:

```
   scripts/check-deprecated.sh -d <repo-root>
```

  to:

```
   .claude/skills/gitops-repo-audit/scripts/check-deprecated.sh -d <repo-root>
```

  Only the path token changes. Leave the block's missing `bash` language tag as-is — that is
  a pre-existing cosmetic inconsistency with the other two blocks (which are tagged
  ```bash```), out of scope for this fix (no gate flags it, and touching the fence tag risks
  an unrelated diff line in a plan whose only job is the three dead paths). The surrounding
  prose (lines 73–78, the `flux migrate --dry-run` explanation and the
  [api-migration.md](references/api-migration.md) pointer) is untouched.

### Task 3.4 — GREEN: re-run the shared bats suite and the gate directly

- [ ] Re-run the same filtered bats invocation from Task 3.0 against the edited `SKILL.md`
      and confirm it now passes:

```bash
tests/unit/lib/bats-core/bin/bats tests/spec/health-goals-remediation.bats -f "gitops-repo-audit"
# expected: PASS (green — all three script paths now resolve to an existing file from the repo root)
```

- [ ] Re-run the standalone extraction loop from Task 3.0 and confirm zero dead-path lines:

```bash
for p in $(grep -rhoP '(?<![A-Za-z0-9_./-])scripts/[A-Za-z0-9_./-]+\.(sh|mjs|py)' \
  .claude/skills/gitops-repo-audit/SKILL.md); do [ -f "$p" ] || echo "dead: $p"; done
# expected: no output
```

- [ ] Confirm the full `G-AGENTIC08` health-goal row is green in isolation (does not require
      a full `health-goals-check.sh` run, which touches other gates outside this partial's
      scope):

```bash
bash -c '
c=0
for p in $(grep -rhoP "(?<![A-Za-z0-9_./-])scripts/[A-Za-z0-9_./-]+\.(sh|mjs|py)" .claude/skills --include=SKILL.md | sort -u); do
  [ -f "$p" ] || c=$((c+1))
done
echo "G-AGENTIC08 dead-path count: $c (target: 0)"
[ "$c" -eq 0 ]
'
```

  Running this repo-wide (not scoped to `gitops-repo-audit/SKILL.md` alone) is deliberate:
  it is the exact invocation `scripts/health-goals-check.sh` uses, so a pass here means this
  partial did not leave any *other* skill's paths broken as a side effect (there are none —
  this partial's only touched file is `gitops-repo-audit/SKILL.md` — but the check is cheap
  and gives the same confidence the parent's final `Verify (RED → GREEN)` block expects).

## Verify

- [ ] Run the three mandatory CI gates:

```bash
task test:changed
task freshness:regenerate
task freshness:check
```

## Scope Boundaries (not in p3)

- No changes to `scripts/health-goals-check.sh` (P1), `.claude/skills/OVERVIEW.md` (P2),
  `.claude/skills/dev-flow-plan/SKILL.md` (P4), or `.github/workflows/e2e.yml` (P5) — each is
  its own disjoint partial.
- No relocation of `.claude/skills/gitops-repo-audit/scripts/*.sh` — they are already at the
  correct path; only the three Markdown references move to match reality.
- No new bats file — the RED/GREEN steps above consume the shared
  `tests/spec/health-goals-remediation.bats` that Partial p6 owns and adds; this partial
  neither creates nor edits that file.
