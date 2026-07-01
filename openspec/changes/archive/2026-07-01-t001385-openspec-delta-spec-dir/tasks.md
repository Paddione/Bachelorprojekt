---
title: "t001385-openspec-delta-spec-dir — Implementation Plan"
ticket_id: T001385
domains: [docs, ci-cd]
status: active
file_locks: []
shared_changes: false
batch_id: null
parent_feature: null
depends_on_plans: []
---

# t001385-openspec-delta-spec-dir — Implementation Plan

_Ticket: T001385_

## File Structure

```
openspec/specs/openspec-workflow.md          # SSOT: MODIFIED + ADDED requirements (this change's delta merges here on archive)
.claude/skills/openspec-propose/SKILL.md      # canonical /opsx:propose flow — add target-spec pre-check
.claude/commands/opsx/propose.md              # mirror of above (Claude Code slash command form)
.opencode/commands/opsx-propose.md            # mirror of above (opencode slash command form)
tests/spec/openspec-workflow.bats             # NEW regression test (grep-based, documentation-only bug)
```

All five files are Markdown/BATS — ungated extensions, S1 threshold 0 (no code-quality
budget gate applies; see `docs/code-quality/baseline.json`, none of the five are baselined).

## Root Cause (recap)

`openspec/specs/openspec-workflow.md` (SSOT) and `.claude/skills/openspec-propose/SKILL.md`
(+ its two mirrors) only document the default `propose` path, where the Delta-Spec file is
named after the **change slug**. Neither mentions the Sub-Feature path required by CLAUDE.md
"Delta-Spec-Konvention (T001304)", where the Delta-Spec must be named after the **parent
SSOT slug** (`--target-spec <parent-slug>` in the `scripts/openspec.sh` fallback, which
already implements this correctly at `scripts/openspec.sh:91`). Any agent following the
canonical `/opsx:propose` flow therefore always names the Delta-Spec after the change slug,
even for sub-features of an existing capability — breaking later `archive` merges into the
correct SSOT file.

## Tasks

### Task 1 — Failing test (RED): Delta-Spec-Konvention muss in allen Propose-Anleitungen dokumentiert sein

Add a new BATS test file `tests/spec/openspec-workflow.bats` is already used by existing
requirements in `openspec/specs/openspec-workflow.md`; append a new test to the existing
file (do not create a duplicate). The test greps the five guidance files for the
Parent-SSOT-Slug convention keyword (`target-spec` and `Parent-SSOT-Slug` / `parent-slug`)
and FAILS on the current (unfixed) branch because
`.claude/skills/openspec-propose/SKILL.md`, `.claude/commands/opsx/propose.md`, and
`.opencode/commands/opsx-propose.md` do not yet mention it.

```bash
cat >> tests/spec/openspec-workflow.bats <<'EOF'

@test "openspec-workflow: propose guidance documents the parent-SSOT-slug delta-spec convention (T001385)" {
  local files=(
    "openspec/specs/openspec-workflow.md"
    ".claude/skills/openspec-propose/SKILL.md"
    ".claude/commands/opsx/propose.md"
    ".opencode/commands/opsx-propose.md"
  )
  for f in "${files[@]}"; do
    run grep -qi "target-spec\|parent-ssot-slug\|parent ssot slug" "$REPO_ROOT/$f"
    [ "$status" -eq 0 ] || {
      echo "missing parent-SSOT-slug convention reference in $f" >&2
      return 1
    }
  done
}
EOF
```

Adapt `$REPO_ROOT` to whatever variable the existing `openspec-workflow.bats` file already
uses for the repo root (check the `setup()` block at the top of the file before appending —
reuse the existing helper variable, do not invent a new one).

Run it and confirm RED:

```bash
tests/unit/lib/bats-core/bin/bats tests/spec/openspec-workflow.bats
# expected: FAIL (red — SKILL.md and its two mirrors don't mention target-spec/parent-SSOT-slug yet)
```

### Task 2 — Fix-Step (GREEN) 1/3: SSOT-Spec `openspec/specs/openspec-workflow.md` korrigieren

Apply the exact MODIFIED+ADDED requirement text drafted in this change's delta spec
(`openspec/changes/t001385-openspec-delta-spec-dir/specs/openspec-workflow.md`) directly to
the live SSOT file `openspec/specs/openspec-workflow.md`:

- Replace the existing "### Requirement: Propose erstellt vollständiges Change-Skeleton"
  section (currently lines ~16-41, spanning the requirement prose through the "Fehlende
  Pflichtargumente" scenario) with the MODIFIED version from the delta spec — same
  requirement title, updated prose distinguishing the new-capability default path
  (`specs/<slug>.md`) from the sub-feature path (`specs/<parent-slug>.md` via
  `--target-spec`), plus the two new scenarios ("neue Capability" / "Sub-Feature einer
  bestehenden Capability") ahead of the pre-existing "Doppelter Slug" and "Fehlende
  Pflichtargumente" scenarios.
- Insert the new "### Requirement: Kanonischer /opsx:propose-Flow respektiert die
  Delta-Spec-Konvention für Sub-Features" requirement (with its two scenarios) immediately
  after the modified requirement above, before the "### Requirement: Apply setzt Change auf
  implementierbar" section.

This is a manual, careful text merge — do not blindly copy the delta file's `## MODIFIED /
## ADDED Requirements` headers into the SSOT (those headers are Delta-Spec-only syntax); the
live SSOT keeps its existing `### Requirement:` / `#### Scenario:` structure without the `##
MODIFIED/ADDED` wrapper headers.

### Task 3 — Fix-Step (GREEN) 2/3: kanonischen /opsx:propose-Flow um Vor-Check ergänzen (SKILL.md + 2 Mirrors)

In `.claude/skills/openspec-propose/SKILL.md`, extend step 4a (currently: "Get instructions"
→ "Read any completed dependency files for context" → "Create the artifact file using
`template`") with an explicit sub-step for the `specs` artifact only:

> **For the `specs` artifact specifically**: before writing the file, check whether this
> change is a sub-feature of an existing capability (consult `openspec/component-map.yaml`
> for a matching file-path prefix, or ask the user if ambiguous). If it is a sub-feature of
> an existing capability with SSOT spec `openspec/specs/<parent-slug>.md`, write the Delta-
> Spec to `openspec/changes/<name>/specs/<parent-slug>.md` (Parent-SSOT-Slug) instead of the
> `outputPath` filename returned by `openspec instructions`. If this is a genuinely new
> capability with no existing SSOT spec, use the `outputPath` filename unchanged. See
> CLAUDE.md "Delta-Spec-Konvention (T001304)".

Apply the identical guidance text (adjusted only for slash-command syntax: `/opsx:propose`
vs `/opsx-propose`) to:
- `.claude/commands/opsx/propose.md` (same step-4a location)
- `.opencode/commands/opsx-propose.md` (same step-4a location)

Keep the three files' existing structural differences (frontmatter fields, `/opsx:propose`
vs `/opsx-propose` command name) untouched — only the step-4a body gains the new sub-step.

### Task 4 — Fix-Step (GREEN) 3/3: BATS-Test grün bekommen

Re-run the test from Task 1:

```bash
tests/unit/lib/bats-core/bin/bats tests/spec/openspec-workflow.bats
```

Confirm the new test (and all pre-existing tests in the same file) pass.

### Task 5 — Final Verification

Run the three mandatory CI-equivalent gates plus the OpenSpec validator and the test
inventory refresh (this PR adds a new `@test` entry):

```bash
task test:changed
task test:inventory
task test:openspec
task freshness:regenerate
task freshness:check
```

Commit the regenerated `website/src/data/test-inventory.json` alongside the test addition if
it changed.
