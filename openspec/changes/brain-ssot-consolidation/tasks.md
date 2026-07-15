---
title: "brain-ssot-consolidation — Implementation Plan"
ticket_id: T001884
domains: [brain, docs, website, ci]
status: active
file_locks: []
shared_changes: false
batch_id: null
parent_feature: null
depends_on_plans: []
---

# brain-ssot-consolidation — Implementation Plan

_Ticket: T001884_ · Design: `docs/superpowers/specs/2026-07-15-brain-ssot-consolidation-design.md`

## File Structure

```
Changed:
  scripts/brain/ingest-sources.yaml            # E1: ssot-specs glob + health-goals/diagrams groups
  scripts/brain-ingest-worklist.sh              # E2: fail-loud 0-match warning + .worktrees prune
  scripts/brain-ingest.sh                       # E1: Phase-2b MOC loop + doc-string, new groups (26-line budget!)
  scripts/brain-ingest-transform.sh             # E5: verbatim-mermaid prompt rule
  scripts/build-graph-docs.mjs                  # E3: emits docs/diagrams/architecture.md (Markdown, not HTML)
  scripts/build-graph-shared.mjs                # E3: + buildApiTableMarkdown()
  scripts/brain-merge-hook.sh                   # E6: single-file SRC support
  .github/workflows/brain-merge-hook.yml        # E6: ADR handler + goals.md/diagrams triggers+handlers
  Taskfile.yml                                  # E3+E4: graph:build-docs desc, health:goals:emit target,
                                                 #   freshness:regenerate + freshness:check FILES wiring
  website/src/lib/goals-data.ts                 # E4: RAW_GOALS -> generated JSON import
  website/src/lib/goals-data.test.ts            # E4: fix goals.md-content-coupled G-SIZE04 assertion
  .claude/skills/brain-ingest/SKILL.md          # E7: sync to real pipeline (no more fictional Quartz CLI)
  docs/code-quality/gates.yaml                  # E7: drop dead migrate-docs-style.mjs allowlist entry
  tests/spec/brain-foundation.bats              # new @test blocks (E3 diagram determinism, E7 SKILL.md sync)
  tests/spec/brain-ingest.bats                  # new @test blocks (E1 groups, E2 fail-loud, E5 mermaid rule)
  tests/spec/brain-merge-hook.bats              # new @test blocks (E6 path parity, single-file SRC)
  tests/spec/health-goals.bats                  # new @test blocks (E4 generator)
  website/src/data/test-inventory.json          # regenerated via `task test:inventory` (Task 10)

New:
  scripts/gen-goals-data.mjs                    # E4: .claude/lib/goals.md -> goals-data.generated.json
  website/src/lib/goals-data.generated.json     # E4: generated + committed artifact
  docs/diagrams/architecture.md                 # E3: generated + committed Mermaid-Markdown artifact

Deleted:
  scripts/migrate-docs-style.mjs                # E7: dead (target HTML markup no longer exists)

Already authored this planning session (not an execute-time task — verify content, do not rewrite):
  openspec/changes/brain-ssot-consolidation/specs/brain-foundation.md   # delta: REQ-BRAIN-FOUNDATION-008..012
  openspec/changes/brain-ssot-consolidation/specs/health-goals.md       # new SSOT spec (archived via --create-new)

No-op (verified during planning research — already absent, listed for completeness only):
  docs/agent-guide/maps/*.tmp                   # confirmed absent via `find`; Task 9 re-verifies defensively
```

## S1 Budget Ledger (gated files only — `.yaml`/`.yml`/`.md`/`.bats` are ungated, no budget claimed)

Baselines for every file below are `null` in `docs/code-quality/baseline.json` (checked live), so the
effective threshold is the static extension limit. Budget = limit − current `wc -l`.

| `path` | ist | budget |
|---|---|---|
| `scripts/brain-ingest-worklist.sh` | 102 | 398 |
| `scripts/brain-ingest-transform.sh` | 105 | 395 |
| `scripts/brain-ingest.sh` | 474 | 26 |
| `scripts/build-graph-docs.mjs` | 350 | 150 |
| `scripts/build-graph-shared.mjs` | 250 | 250 |
| `scripts/brain-merge-hook.sh` | 12 | 488 |
| `website/src/lib/goals-data.ts` | 304 | 296 |

`scripts/gen-goals-data.mjs` is a **new** file (no live `wc -l` yet) — target ≤ 500 lines (the `.mjs`
static limit; new/unbaselined files are checked against the static limit only).

**Critical constraint (intel.json risk):** `scripts/brain-ingest.sh` has only **26 lines** of budget.
Task 3 below touches it and MUST NOT add net-new lines — the two edits are in-place token additions to
an existing `for group in …` line and an existing doc-string line, not new statements. No split/shrink
step is needed because the edit is net-zero-line by construction (verified via `wc -l` before/after in
Task 3's acceptance check).

`scripts/build-graph-docs.mjs` currently emits ~300 lines of inline HTML/CSS/JS (LAD-3 standalone page).
Task 4 **replaces** that with a small Markdown-template function, which shrinks the file well under its
150-line budget (verified, not assumed) — no split needed, this is a net shrink.

---

## Task 1: Manifest glob-refresh — `ssot-specs` becomes a glob, add `health-goals` + `diagrams` groups (E1)

**Status: ✅ DONE** (commit 7d42eeb2f)

**Files:** `scripts/brain/ingest-sources.yaml`, `tests/spec/brain-ingest.bats`

**Problem:** `ssot-specs:` lists 24 static `openspec/specs/*.md` paths; only 5 exist. `openspec/specs/`
has 63+ real specs today — over 90% never reach the brain. The `type_map.overrides` entry for
`openspec/specs/health-goals.md` is a dead reference (that spec file doesn't exist).

**RED — failing test first:**

```bash
cat >> tests/spec/brain-ingest.bats <<'BATS'

# --- T001884: glob-based ssot-specs + new groups (E1) ---

@test "ssot-specs group is a single glob line, not a static per-file list" {
  [ -f "$MANIFEST" ]
  grep -qE '^  ssot-specs:[[:space:]]+openspec/specs/\*\.md[[:space:]]*$' "$MANIFEST" \
    || { echo "FAIL: ssot-specs is not the glob 'openspec/specs/*.md'"; return 1; }
}

@test "manifest declares a health-goals group targeting .claude/lib/goals.md" {
  [ -f "$MANIFEST" ]
  grep -qE '^  health-goals:[[:space:]]+\.claude/lib/goals\.md[[:space:]]*$' "$MANIFEST" \
    || { echo "FAIL: health-goals group missing or wrong target"; return 1; }
}

@test "manifest declares a diagrams group targeting docs/diagrams/*.md and docs/db-schema-diagram.md" {
  [ -f "$MANIFEST" ]
  grep -A3 '^  diagrams:[[:space:]]*|' "$MANIFEST" | grep -q 'docs/diagrams/\*\.md' \
    || { echo "FAIL: diagrams group missing docs/diagrams/*.md"; return 1; }
  grep -A3 '^  diagrams:[[:space:]]*|' "$MANIFEST" | grep -q 'docs/db-schema-diagram\.md' \
    || { echo "FAIL: diagrams group missing docs/db-schema-diagram.md"; return 1; }
}

@test "type_map and tag_defaults cover health-goals and diagrams" {
  [ -f "$MANIFEST" ]
  for group in health-goals diagrams; do
    grep -q "$group:" "$MANIFEST" || { echo "FAIL: type_map/tag_defaults missing $group"; return 1; }
  done
  grep -qE '^\s+health-goals:\s+decision' "$MANIFEST" || { echo "FAIL: health-goals default type != decision"; return 1; }
  grep -qE '^\s+diagrams:\s+note' "$MANIFEST" || { echo "FAIL: diagrams default type != note"; return 1; }
}

@test "dead health-goals.md type_map override is removed" {
  [ -f "$MANIFEST" ]
  ! grep -q 'pattern: "openspec/specs/health-goals.md"' "$MANIFEST" \
    || { echo "FAIL: dead health-goals.md override still present"; return 1; }
}
BATS
tests/unit/lib/bats-core/bin/bats tests/spec/brain-ingest.bats
# expected: FAIL (red — manifest still has the 24-line static list and no
# health-goals/diagrams groups)
```

**GREEN — implement:**

- Replace the 24-line `ssot-specs: |` block with a single line: `ssot-specs: openspec/specs/*.md`
  (the existing `exclude: [openspec/specs/archive/]` prefix-exclude keeps applying downstream in
  `brain-ingest-worklist.sh`'s `is_excluded()` — no change needed there for this part).
- Add two new `groups:` entries:
  ```yaml
  health-goals: .claude/lib/goals.md
  diagrams: |
    docs/diagrams/*.md
    docs/db-schema-diagram.md
  ```
- Add to `type_map.defaults`: `health-goals: decision`, `diagrams: note`.
- Remove the `type_map.overrides` entry `pattern: "openspec/specs/health-goals.md"` (dead — the file
  doesn't exist today). Replace it with a forward-looking override
  `pattern: "openspec/specs/health-goals*.md", type: decision` so that once this change is archived and
  the new `openspec/specs/health-goals.md` SSOT spec exists, it still gets the `decision` type (rather
  than falling back to the `ssot-specs` group default `note`), consistent with how `security*.md` and
  `database*.md` are already overridden.
- Add to `tag_defaults`: `health-goals: [health, goals]`, `diagrams: [diagram, architecture]`.

**Acceptance:** `bats tests/spec/brain-ingest.bats` passes (GREEN). The pre-existing
`tests/spec/brain-initial-ingest.bats::"real manifest declares the ssot-specs group..."` test
(`grep -qE '(ssot-specs|SSOT)'`) still passes unmodified — verified by inspection, it only greps for
group-name presence, not the static list.

---

## Task 2: Fail-loud worklist warning + `.worktrees` prune (E2)

**Status: ✅ DONE** (commit 7d42eeb2f)

**Files:** `scripts/brain-ingest-worklist.sh`, `tests/spec/brain-ingest.bats`

**Problem:** `group_for()` silently drops files that match no group; a manifest group with **zero**
matches anywhere in the tree is currently invisible — this is exactly how the 78%-dead `ssot-specs`
list went unnoticed for weeks (T001884 motivation #1). Also: `find` doesn't prune `.worktrees/`, so a
worktree checkout under the repo root gets walked as a second, duplicate copy of every source file.

**RED — failing test first:**

```bash
cat >> tests/spec/brain-ingest.bats <<'BATS'

# --- T001884: fail-loud 0-match warning + .worktrees prune (E2) ---

@test "worklist warns on stderr when a manifest group matches zero files (exit stays 0)" {
  mkdir -p "$WORK/repo"
  printf -- '---\ntype: note\ntags: [x]\nstatus: active\n---\na\n' > "$WORK/repo/a.md"
  cat > "$WORK/manifest.yaml" <<YAML
groups:
  matched: a.md
  empty-group: nonexistent-pattern-*.md
YAML
  run bash "$REPO_ROOT/scripts/brain-ingest-worklist.sh" --root "$WORK/repo" --manifest "$WORK/manifest.yaml"
  [ "$status" -eq 0 ] || { echo "FAIL: exit must stay 0 even with a 0-match group"; return 1; }
  [[ "$output" == *"empty-group"* ]] || { echo "FAIL: no drift warning naming empty-group"; return 1; }
}

@test "worklist does not warn for a group that has at least one match" {
  mkdir -p "$WORK/repo"
  printf -- '---\ntype: note\ntags: [x]\nstatus: active\n---\na\n' > "$WORK/repo/a.md"
  cat > "$WORK/manifest.yaml" <<YAML
groups:
  matched: a.md
YAML
  run bash "$REPO_ROOT/scripts/brain-ingest-worklist.sh" --root "$WORK/repo" --manifest "$WORK/manifest.yaml"
  [ "$status" -eq 0 ]
  [[ "$output" != *"Warnung"* ]] || { echo "FAIL: warned on a group with a real match"; return 1; }
}

@test "worklist prunes a .worktrees/ subtree so it never produces duplicate slugs" {
  mkdir -p "$WORK/repo/.worktrees/copy1"
  printf -- '---\ntype: note\ntags: [x]\nstatus: active\n---\na\n' > "$WORK/repo/a.md"
  printf -- '---\ntype: note\ntags: [x]\nstatus: active\n---\na\n' > "$WORK/repo/.worktrees/copy1/a.md"
  cat > "$WORK/manifest.yaml" <<YAML
groups:
  matched: "**/*.md"
YAML
  run bash "$REPO_ROOT/scripts/brain-ingest-worklist.sh" --root "$WORK/repo" --manifest "$WORK/manifest.yaml"
  [ "$status" -eq 0 ]
  [[ "$output" != *".worktrees"* ]] || { echo "FAIL: .worktrees/ subtree not pruned"; return 1; }
}
BATS
tests/unit/lib/bats-core/bin/bats tests/spec/brain-ingest.bats
# expected: FAIL (red — no drift warning exists yet, .worktrees/ is not in the find -prune list)
```

**GREEN — implement (`scripts/brain-ingest-worklist.sh`):**

- Add `.worktrees` to the `find ... -prune` alternation (alongside `.git`, `node_modules`, …):
  `-o -name .worktrees \`.
- After the main `find | while read -r file; do … done` pipeline that emits the TSV rows, add a
  drift-detection pass: extract the set of declared group names from the manifest's `groups:` section
  (map-style `  name:`/`  name: |` keys — same shape `brain_group_for` already parses), diff it against
  the set of groups actually observed in the emitted worklist output (column 3), and for each declared
  group with zero emitted rows, print `Warnung: Manifest-Gruppe '<name>' hat 0 Treffer (Drift?)` to
  stderr. Because bash pipelines run the `while` loop in a subshell, capture the worklist to a temp file
  first (or use `<(…)`/process substitution) so the parent shell can inspect group coverage after the
  loop exits — do not try to accumulate group counts across the subshell boundary with plain variables.
  Exit code stays `0` (this is diagnostic, not a hard gate — the design explicitly keeps partial
  ingests unblocked).

**Acceptance:** `bats tests/spec/brain-ingest.bats` GREEN. Manually verify no net-line-count concern
here — this file has 398 lines of budget (loc 102), plenty of room.

---

## Task 3: `brain-ingest.sh` Phase-2b group loop + doc-string sync (E1 cont., 26-line budget)

**Status: ✅ DONE** (commit 2201ef4cd — net-zero-line, `wc -l` still 474)

**Files:** `scripts/brain-ingest.sh`, `tests/spec/brain-ingest.bats`

**Critical constraint:** this file has only **26 lines** of S1 budget (474/500). Per intel.json risk
guidance, do **not** add new code per group — the Phase-2b MOC loop (lines ~240) is already
group-agnostic (`for group in <names>; do … done`); only the group *name list* on that one line and
the PR-description doc-string on line ~455 change. Both edits are **in-place token insertions on
existing lines — zero net new lines**.

**RED — failing test first:**

```bash
cat >> tests/spec/brain-ingest.bats <<'BATS'

# --- T001884: Phase-2b MOC loop covers the new groups (E1 cont.) ---

@test "Phase 2b MOC loop includes health-goals and diagrams groups" {
  grep -q 'for group in ssot-specs runbooks adr gotchas-footguns agent-guide-maps core-docs health-goals diagrams; do' \
    "$INGEST" || { echo "FAIL: Phase 2b loop not extended with new groups"; return 1; }
}

@test "PR description doc-string lists health-goals and diagrams as source groups" {
  grep -q 'ssot-specs, runbooks, adr, gotchas-footguns, agent-guide-maps, core-docs, health-goals, diagrams' \
    "$INGEST" || { echo "FAIL: PR body source-groups string not updated"; return 1; }
}
BATS
tests/unit/lib/bats-core/bin/bats tests/spec/brain-ingest.bats
# expected: FAIL (red — the for-loop and doc-string still only list the 6 original groups)
```

**GREEN — implement:**

- Edit the existing line `for group in ssot-specs runbooks adr gotchas-footguns agent-guide-maps
  core-docs; do` → append ` health-goals diagrams` before `; do`.
- Edit the existing `**Source groups:**` doc-string line the same way.
- **Verify net-zero line delta:** `wc -l scripts/brain-ingest.sh` must still read `474` after this
  task (both edits lengthen existing lines, they don't add lines).

**Known pre-existing limitation (out of scope, not introduced by this change):** the Phase-2b `pages="$(jq …)"`
filter that builds each group's MOC content does not actually filter by the `$g` (group) argument it
receives — it selects the same `openspec/|docs/|CLAUDE|AGENTS`-prefixed page set for every group name in
the loop. This is a pre-existing bug (produces identical MOC bodies across all six/eight groups) unrelated
to E1; adding `health-goals`/`diagrams` to the loop reproduces the same behavior the six existing groups
already have, not a regression. Fixing the `$g` filter is out of scope for T001884 — file a follow-up
ticket if desired, do not fix it inline here (it would require touching Phase-2b logic beyond the
26-line budget).

**Acceptance:** `bats tests/spec/brain-ingest.bats` GREEN; `wc -l scripts/brain-ingest.sh` == 474.

---

## Task 4: Mermaid-Markdown diagram generator (E3)

**Status: ✅ DONE**

**Files:** `scripts/build-graph-shared.mjs`, `scripts/build-graph-docs.mjs`, `Taskfile.yml`,
`docs/diagrams/architecture.md` (new, generated), `tests/spec/brain-foundation.bats`

**Problem:** `build-graph-docs.mjs` currently emits a ~300-line standalone HTML page with inline
CSS/JS and a CDN-loaded `mermaid@10.9.3` script to `k3d/docs-content-built/architecture/index.html` —
a path that has **never actually been generated or committed** (verified: the directory doesn't exist
on disk, isn't in `git ls-files`, and `graph:build-docs` isn't called by any Taskfile flow). It's dead
weight and outside brain-ingest scope. `docs/diagrams/` doesn't exist yet.

**Design constraint — byte-determinism:** the new `docs/diagrams/architecture.md` MUST NOT embed a
live wall-clock "generated at" timestamp. Unlike `docs/generated/graph.json` and
`docs/generated/blast-radius.md` (which need the special `del(.generatedAt)` / `grep -v "^> Generated:"`
stripped-diff treatment in `freshness:graph-check` before they can be compared), this file is added to
the **plain** `freshness:check` `FILES` list, which does a literal `git diff --exit-code`. If the
generator embedded `new Date().toISOString()`, every CI run would flag the file as stale even with zero
structural change. Node/edge/endpoint **counts** are fine to display (they only change when the
underlying `graph.json`/`api-map.json` content changes, which is exactly the signal `freshness:check`
should catch) — only a live timestamp is forbidden.

**RED — failing test first:**

```bash
cat >> tests/spec/brain-foundation.bats <<'BATS'

# --- T001884: Mermaid-Markdown architecture page (E3) ---

@test "build-graph-docs.mjs emits docs/diagrams/architecture.md with mermaid fences, not HTML" {
  cd "$REPO_ROOT"
  run node scripts/build-graph-docs.mjs
  [ "$status" -eq 0 ] || { echo "FAIL: generator exited non-zero: $output"; return 1; }
  [ -f "$REPO_ROOT/docs/diagrams/architecture.md" ] || { echo "FAIL: docs/diagrams/architecture.md not written"; return 1; }
  grep -q '```mermaid' "$REPO_ROOT/docs/diagrams/architecture.md" \
    || { echo "FAIL: no mermaid fence in output"; return 1; }
  ! grep -q '<html' "$REPO_ROOT/docs/diagrams/architecture.md" \
    || { echo "FAIL: output still contains raw HTML"; return 1; }
  ! grep -q 'cdn.jsdelivr.net' "$REPO_ROOT/docs/diagrams/architecture.md" \
    || { echo "FAIL: output still references the CDN mermaid script"; return 1; }
}

@test "docs/diagrams/architecture.md is byte-identical across two consecutive generator runs (no embedded timestamp)" {
  cd "$REPO_ROOT"
  run node scripts/build-graph-docs.mjs
  [ "$status" -eq 0 ]
  first="$(cat "$REPO_ROOT/docs/diagrams/architecture.md")"
  run node scripts/build-graph-docs.mjs
  [ "$status" -eq 0 ]
  second="$(cat "$REPO_ROOT/docs/diagrams/architecture.md")"
  [ "$first" = "$second" ] || { echo "FAIL: output differs between consecutive runs — likely an embedded timestamp"; return 1; }
}
BATS
tests/unit/lib/bats-core/bin/bats tests/spec/brain-foundation.bats
# expected: FAIL (red — scripts/build-graph-docs.mjs still writes HTML to k3d/docs-content-built/,
# docs/diagrams/architecture.md does not exist)
```

**GREEN — implement:**

- `scripts/build-graph-shared.mjs`: add `buildApiTableMarkdown(apiMap)`, a pure function returning a
  GFM table (`| Path | Methods | Auth |`) built from `apiMap.endpoints` (`path`, `methods.join(', ')`,
  and a plain-text auth marker, e.g. `🔐 admin` / `🔑 auth` / `🌐 public`) — no inline HTML/CSS, so the
  output is directly LLM- and docs-site-friendly. `buildServiceMap`/`buildTopology` already return raw
  Mermaid text (no HTML wrapper) and are reused as-is inside ` ```mermaid ` fences.
- `scripts/build-graph-docs.mjs`: rewrite `main()` to build a Markdown string with this shape:
  ```
  # Architektur — Living Docs

  <N> Services · <M> Abhängigkeitskanten · <K> API-Endpoints

  ## Service-Map

  ```mermaid
  <serviceMapDiagram>
  ```

  ## K8s-Topology

  ```mermaid
  <topologyDiagram>
  ```

  ## API-Surface

  <buildApiTableMarkdown output>
  ```
  Write it to `docs/diagrams/architecture.md` (via `mkdirSync(join(ROOT, 'docs/diagrams'), {recursive:
  true})`). Drop the `hasStructuralChange`/`k3d/docs-content-built` logic entirely — the file is always
  written; `freshness:check`'s `git diff --exit-code` is now the sole staleness detector. Update the file
  header comment (currently says "generates k3d/docs-content-built/architecture/index.html") to describe
  the new target.
- `Taskfile.yml` `graph:build-docs`: update `desc:` to `"Generiere Mermaid-Architecture-Markdown nach
  docs/diagrams/architecture.md (LAD-3)"`.
- `Taskfile.yml` `freshness:regenerate`: add `- task: graph:build-docs` immediately after
  `- task: graph:build    # LAD: K8s graph artifacts`.
- `Taskfile.yml` `freshness:check` `FILES` block: add `docs/diagrams/architecture.md` as a new line
  inside the existing `FILES="..."` heredoc-style variable (alongside `website/src/data/openspec-status.json`
  etc.).
- Generate and commit the resulting `docs/diagrams/architecture.md` (run `task graph:build-docs` once
  locally as part of this task so the committed file matches what the generator produces).

**Acceptance:** `bats tests/spec/brain-foundation.bats` GREEN; `task graph:build-docs` run twice in a
row produces a byte-identical `docs/diagrams/architecture.md`; `git diff --exit-code
docs/diagrams/architecture.md` is clean after committing.

---

## Task 5: Mermaid verbatim-preservation prompt rule (E5)

**Status: ✅ DONE** (commit 2201ef4cd)

**Files:** `scripts/brain-ingest-transform.sh`, `tests/spec/brain-ingest.bats`

**Problem:** the LLM transform prompt has no rule about ` ```mermaid ` blocks, so the model distills
diagrams to prose during ingestion — making the new `diagrams` group (Task 1) pointless once real
pages are transformed.

**RED — failing test first:**

```bash
cat >> tests/spec/brain-ingest.bats <<'BATS'

# --- T001884: mermaid verbatim-preservation prompt rule (E5) ---

@test "transform prompt instructs the LLM to keep mermaid code blocks verbatim" {
  grep -qi 'mermaid' "$TRANSFORM" || { echo "FAIL: no mermaid rule in transform prompt"; return 1; }
  grep -qiE 'mermaid.*(verbatim|unveraendert|unver.ndert)' "$TRANSFORM" \
    || { echo "FAIL: mermaid rule doesn't say verbatim/unveraendert"; return 1; }
}
BATS
tests/unit/lib/bats-core/bin/bats tests/spec/brain-ingest.bats
# expected: FAIL (red — PROMPT has no mermaid rule at all today)
```

**GREEN — implement:** add one bullet to the `Regeln:` block inside the `PROMPT="..."` heredoc in
`scripts/brain-ingest-transform.sh`:
```
- ```mermaid-Codeblöcke UNVERÄNDERT (verbatim) übernehmen — nicht in Prosa auflösen
```

**Acceptance:** `bats tests/spec/brain-ingest.bats` GREEN. One net-new line in a 395-budget file — no
concern.

---

## Task 6: `gen-goals-data.mjs` — health-goals generator (E4a)

**Status: ✅ DONE** (82 goals parsed from the real `.claude/lib/goals.md`: 1 Prio-A, 10 Prio-B, 71 Prio-C)

**Files:** `scripts/gen-goals-data.mjs` (new), `Taskfile.yml`, `tests/spec/health-goals.bats`

**Pattern:** mirrors `scripts/openspec-status-map.sh` → `website/src/data/openspec-status.json`
(existing, working precedent wired into `freshness:regenerate`/`freshness:check`), translated to
Node.js/mjs since the output must satisfy the `HealthGoal[]` TypeScript shape already defined in
`website/src/lib/goals-data.ts`.

**Contract:** `node scripts/gen-goals-data.mjs`. Env overrides (mirrors `OPENSPEC_ROOT` in
`openspec-status-map.sh`, needed so BATS can point at fixture files without touching the real repo):
`GOALS_MD_PATH` (default `.claude/lib/goals.md`), `GOALS_JSON_OUT` (default
`website/src/lib/goals-data.generated.json`).

**Parsing rules — goals.md has two distinct entry shapes, both must be parsed** (Prio A/B use
individual H2 sections; Prio C is a single Markdown table — dropping Prio C would silently empty
`GREEN_GATES` on the dashboard, a real behavior regression the design does not call for):

1. **H2-section entries** (Prio A + B), per the file's own documented convention (`.claude/lib/goals.md`
   header: "Jedes Ziel trägt eine Meta-Zeile: Priorität · Baseline · Target · Aufwand · Messzyklus ·
   Reproduzierbar"):
   - `id`: `^## (G-[A-Z0-9]+)` captured from the heading.
   - `title`: heading text after `— `, with a trailing status suffix (a `: ` followed by digits/emoji/
     `n/a`/parenthetical) stripped — e.g. `Dateien > 1MB im Tree (kein LFS): 7 🔴 (Ziel ≤ 6)` → `Dateien
     > 1MB im Tree (kein LFS)`.
   - `priority`: the `A`/`B` letter at the start of the meta blockquote line
     (`> **A · Baseline:** …`).
   - `baseline`/`current`: from the `Baseline:` field. First number found = baseline. If a `→` arrow is
     present, the number after it = current; otherwise current = baseline (matches the file's own
     `"17 (unverändert)"` convention — unchanged since baseline).
   - `target`: first number found in the `Target:` field (strip `≤`/`≥`/`<`/`>`/`%`/`min` etc.).
   - `direction`: `'lower'` if the Target field contains `≤`/`<`; `'higher'` if it contains `≥`/`>`;
     otherwise compare baseline vs. target numerically (baseline > target → lower, baseline < target →
     higher, equal → lower).
   - `unit`: best-effort leftover descriptive text from the target/heading (not fail-loud — cosmetic).
   - `measurement`: the content of the first fenced ` ```bash ` or ` ```sql ` block between the H2
     heading and the next `#`/`##` heading.
   - `source`: fixed string `` `.claude/lib/goals.md · <id>` `` for every entry — this also **fixes**
     the `.agents/lib/goals.md` source-path drift the design calls out (the old hand-written
     `RAW_GOALS` pointed at the symlink alias `.agents/lib/goals.md`, not the real path).
   - `measured_at`: the single global date from the file's `**Baseline-Stichtag:** \`YYYY-MM-DD\``
     line, reused for every entry (deterministic, single source, no per-goal date tracking needed).
   - `status`: always `'unknown'` — `computeStatus()` in `goals-data.ts` (unchanged) recomputes it live
     from current/target/baseline, which is strictly more correct than the old hand-picked `'achieved'`
     flags.
   - `category`: looked up from the ID prefix via a fixed table (see below).

2. **Table-row entries** (Prio C — Green Gates, `| **G-ID** | Ziel | Aktuell | Target | Basis-Messung |`):
   - `id` from column 1, `title` from column 2 (already a clean description).
   - `current`/`target`: first number found in columns 3/4; if a cell has **zero digits** and isn't a
     recognizable non-numeric-but-valid form (`Exit 0`, `N/M` fraction, `PM`), leave both `null` and put
     the raw cell text in `unit` (mirrors 3 existing hand-written entries: `G-RH07`, `G-SPEC01`,
     `G-SEC02`, which already use `baseline: null, current: null, target: null, unit: 'Exit'`).
   - `baseline`: **always `null`** — the table has no baseline column, and inventing one from prose
     elsewhere in the file would violate fail-loud determinism.
   - `direction`: `'higher'` if the Target cell contains `≥`; else `'lower'`.
   - `priority`: always `'C'`.
   - `measurement`: column 5 raw text.
   - `category`, `source`, `measured_at`, `status`: same rules as the H2 case.

3. **Category lookup table** (ID prefix → German category, mirrors categories already used in
   `goals-data.ts`):

   | Prefix | Category | | Prefix | Category |
   |---|---|---|---|---|
   | `GIT` | Repo-Hygiene | | `SPEC` | Prozess |
   | `SIZE` | Code-Größe | | `DOC` | Dokumentation |
   | `CQ` | Code-Qualität | | `RH` | Kern-Ziele |
   | `DB` | Datenbank | | `TEST` | Test-Health |
   | `SEC` | Sicherheit | | `AGENTIC` | Agent-Tooling |
   | `CI` / `CD` | CI/CD | | `DORA` | CI/CD |
   | `DEP` / `IMG` | Dependencies | | `FE` | Frontend |
   | `K8S` | Infrastruktur | | `CFG` | Konfiguration |

   Unrecognized prefixes fall back to category `"Sonstige"` (cosmetic, not fail-loud).

**Fail-loud triggers (exit ≠ 0, stderr names the offending ID — per E4/intel.json risk):**
1. A `## G-XXX — …` heading appears under the Prio-A or Prio-B section but no meta-line matching the
   documented `**<P> · Baseline:** … · **Target:** …` shape follows before the next heading.
2. A meta-line's `Baseline:` or `Target:` field contains **zero digits** and isn't the literal token
   `n/a` (an all-prose field is a real authoring mistake, not tolerable free text).
3. A Prio-C table row's ID column doesn't match `G-[A-Z0-9-]+`.

Everything else (messy-but-numeric free text like `"3 (dev-flow-execute 662, infra-ops 595, …) → 1
(dev-flow-plan 508)"`) is tolerated via the "first/last number found" extraction rules above — this is
the tolerant half of "tolerant, aber fail-loud" from the risk note.

**RED — failing test first:**

```bash
cat >> tests/spec/health-goals.bats <<'BATS'

# --- T001884: gen-goals-data.mjs (E4) ---

setup_gen() {
  GEN="$REPO_ROOT/scripts/gen-goals-data.mjs"
  WORK="$(mktemp -d)"
}
teardown_gen() { rm -rf "$WORK"; }

@test "gen-goals-data.mjs parses an H2-section Prio-A goal into the HealthGoal shape" {
  REPO_ROOT="$(cd "$(dirname "$BATS_TEST_FILENAME")/../.." && pwd)"
  setup_gen
  cat > "$WORK/goals.md" <<'MD'
# Repository Health Goals

**Baseline-Stichtag:** `2026-07-01`

## G-TEST01 — Beispielziel: 7 (Ziel <= 6)

```bash
echo 7
```

> **A · Baseline:** 6 → 7 · **Target:** ≤ 6 · **Aufwand:** gering · **Messzyklus:** wöchentlich · **Reproduzierbar:** ja · Ticket: T000001
MD
  GOALS_MD_PATH="$WORK/goals.md" GOALS_JSON_OUT="$WORK/out.json" run node "$GEN"
  [ "$status" -eq 0 ] || { echo "FAIL: $output"; return 1; }
  run jq -r '.[0].id' "$WORK/out.json"
  [ "$output" = "G-TEST01" ]
  [ "$(jq -r '.[0].baseline' "$WORK/out.json")" = "6" ]
  [ "$(jq -r '.[0].current' "$WORK/out.json")" = "7" ]
  [ "$(jq -r '.[0].target' "$WORK/out.json")" = "6" ]
  [ "$(jq -r '.[0].direction' "$WORK/out.json")" = "lower" ]
  [ "$(jq -r '.[0].source' "$WORK/out.json")" = ".claude/lib/goals.md · G-TEST01" ]
}

@test "gen-goals-data.mjs fails loud on an H2 goal with no meta-line" {
  REPO_ROOT="$(cd "$(dirname "$BATS_TEST_FILENAME")/../.." && pwd)"
  setup_gen
  cat > "$WORK/goals.md" <<'MD'
# Repository Health Goals

**Baseline-Stichtag:** `2026-07-01`

## G-BROKEN01 — Kaputtes Ziel ohne Meta-Zeile

Nur Prosa, keine Meta-Zeile.
MD
  GOALS_MD_PATH="$WORK/goals.md" GOALS_JSON_OUT="$WORK/out.json" run node "$GEN"
  [ "$status" -ne 0 ] || { echo "FAIL: should fail loud on missing meta-line"; return 1; }
  [[ "$output" == *"G-BROKEN01"* ]] || { echo "FAIL: error should name the offending id"; return 1; }
}

@test "gen-goals-data.mjs parses a Prio-C table row" {
  REPO_ROOT="$(cd "$(dirname "$BATS_TEST_FILENAME")/../.." && pwd)"
  setup_gen
  cat > "$WORK/goals.md" <<'MD'
# Repository Health Goals

**Baseline-Stichtag:** `2026-07-01`

# Priorität C — Green Gates {#prio-c}

| ID | Ziel | Aktuell | Target | Basis-Messung |
|----|------|---------|--------|---------------|
| **G-TABLE01** | Beispiel-Gate | 0 ✓ | 0 | `echo 0` |
MD
  GOALS_MD_PATH="$WORK/goals.md" GOALS_JSON_OUT="$WORK/out.json" run node "$GEN"
  [ "$status" -eq 0 ] || { echo "FAIL: $output"; return 1; }
  [ "$(jq -r '.[0].id' "$WORK/out.json")" = "G-TABLE01" ]
  [ "$(jq -r '.[0].priority' "$WORK/out.json")" = "C" ]
  [ "$(jq -r '.[0].baseline' "$WORK/out.json")" = "null" ]
  [ "$(jq -r '.[0].current' "$WORK/out.json")" = "0" ]
}
BATS
tests/unit/lib/bats-core/bin/bats tests/spec/health-goals.bats
# expected: FAIL (red — scripts/gen-goals-data.mjs does not exist yet)
```

**GREEN — implement:** create `scripts/gen-goals-data.mjs` per the contract and rules above. Register
in `Taskfile.yml`:
```yaml
  health:goals:emit:
    desc: "Regenerate website/src/lib/goals-data.generated.json from .claude/lib/goals.md (SSOT, E4)"
    cmds:
      - node scripts/gen-goals-data.mjs
```
Add `- task: health:goals:emit` to `freshness:regenerate` (after `- task: openspec:status-map`) and add
`website/src/lib/goals-data.generated.json` to the `freshness:check` `FILES` list.

**Acceptance:** `bats tests/spec/health-goals.bats` GREEN; `node scripts/gen-goals-data.mjs` run
against the real `.claude/lib/goals.md` succeeds and writes a non-empty
`website/src/lib/goals-data.generated.json`.

---

## Task 7: `goals-data.ts` consumes the generated JSON (E4b)

**Status: ✅ DONE** (304→61 lines, 15/15 vitest green)

**Files:** `website/src/lib/goals-data.ts`, `website/src/lib/goals-data.test.ts`

**Problem:** `RAW_GOALS` (lines ~52-297, ~245 lines) is a hand-maintained constant that has already
drifted from the real `.claude/lib/goals.md` (e.g. `G-SIZE04`, `G-DEP01`, `G-CI01`, `G-CD01` appear in
`RAW_GOALS` as Prio-A goals but no longer exist as H2 sections in the current `goals.md` at all — the
file moved on, the constant didn't). This also means the existing vitest assertion `"a known
Priority-A goal (G-SIZE04) is present and lower-direction"` (line ~64) will break once real,
live-parsed data replaces the stale constant — it must be rewritten to a structural assertion that
doesn't pin a specific ID from `goals.md`'s current content.

**RED — failing test first:**

```bash
cd website
cat >> src/lib/goals-data.test.ts <<'EOF'

describe('goals-data: generated JSON integration', () => {
  it('GOALS entries all carry the corrected .claude/lib/goals.md source path (not the .agents/ alias)', () => {
    for (const g of GOALS) {
      expect(g.source.startsWith('.claude/lib/goals.md')).toBe(true);
    }
  });
});
EOF
npx vitest run src/lib/goals-data.test.ts
cd ..
# expected: FAIL (red — RAW_GOALS entries still carry `.agents/lib/goals.md · ...` as source)
```

**GREEN — implement:**

- Delete the `RAW_GOALS: HealthGoal[] = [ … ]` array literal (lines ~52-297).
- Add `import rawGoals from './goals-data.generated.json';` and `const RAW_GOALS = rawGoals as
  HealthGoal[];` in its place. `resolveJsonModule: true` is already set in `website/tsconfig.json`
  (verified) — same pattern as `website/src/lib/learning-assets.ts` importing
  `learning-assets.generated.json` (existing, working precedent).
- Everything below `RAW_GOALS` (`computeStatus`, `healthPercent`, the
  `GOALS`/`ACTIVE_GOALS`/`GREEN_GATES`/`CATEGORIES` exports) is unchanged; `GoalsDashboard.svelte`'s
  imports (`ACTIVE_GOALS`, `GREEN_GATES`, `CATEGORIES`, `healthPercent`, `HealthGoal` type) need no
  changes (verified — it never imports `RAW_GOALS` directly).
- Rewrite the stale test in `goals-data.test.ts`:
  ```ts
  it('every Priority-A goal has a valid, computable direction', () => {
    const aGoals = GOALS.filter((g) => g.priority === 'A');
    for (const g of aGoals) {
      expect(['lower', 'higher']).toContain(g.direction);
    }
  });
  ```
  replacing the old `"a known Priority-A goal (G-SIZE04) is present..."` test (which hardcoded an ID
  that no longer exists in `goals.md`'s current Prio-A section — the new assertion is robust to
  `goals.md` content changes going forward, which is the whole point of this change).

<!-- vitest: goals-data.test.ts is the existing test file for this module, extended in place, not
     replaced — see W1/Vitest-Abdeckung requirement in plan-quality-gates.md -->

**Acceptance:** `npx vitest run src/lib/goals-data.test.ts` GREEN (all tests, old and new).
`website/src/lib/goals-data.ts` budget note: current 304 lines, budget 296 — deleting ~245 lines and
adding ~2 import lines is a large net **shrink**, well within budget (no split needed, this is the
opposite problem).

---

## Task 8: Merge-hook path parity (E6)

**Status: ✅ DONE**

**Files:** `scripts/brain-merge-hook.sh`, `.github/workflows/brain-merge-hook.yml`,
`tests/spec/brain-merge-hook.bats`

**Problem:** the workflow declares `docs/adr/**` as a trigger path but the "Run merge-hook" step never
processes it (only `openspec/specs` and `docs/runbooks` are handled) — a silent gap between declared
intent and actual behavior. `.claude/lib/goals.md`, `docs/diagrams/**`, and `docs/db-schema-diagram.md`
(new/changed by this ticket) aren't wired at all yet. `brain-merge-hook.sh`'s `find "$SRC" -name '*.md'
-type f` technically matches a single-file `$SRC` too, but the `rel="${f#$SRC/}"` prefix-strip only
works for directory sources — a single-file `$SRC` falls through to copying the file at a deeply nested,
ugly destination path instead of a clean `$DEST/<basename>`.

**RED — failing test first:**

```bash
cat >> tests/spec/brain-merge-hook.bats <<'BATS'

# --- T001884: single-file SRC + workflow path parity (E6) ---

@test "merge-hook copies a single-file SRC directly to DEST/<basename>" {
  echo "goal content" > "$WORK/source/single.md"
  run bash "$HOOK" "$WORK/source/single.md" "$WORK/target/raw"
  [ "$status" -eq 0 ]
  [ -f "$WORK/target/raw/single.md" ] || { echo "FAIL: single-file SRC not copied to DEST/<basename>"; return 1; }
}

@test "brain-merge-hook.yml triggers on and processes docs/adr/**" {
  wf="$REPO_ROOT/.github/workflows/brain-merge-hook.yml"
  grep -q 'docs/adr/\*\*' "$wf"
  grep -q 'bachelorprojekt/docs/adr brain/raw/adr' "$wf" \
    || { echo "FAIL: ADR handler step missing despite declared trigger"; return 1; }
}

@test "brain-merge-hook.yml triggers on and processes .claude/lib/goals.md, docs/diagrams/**, docs/db-schema-diagram.md" {
  wf="$REPO_ROOT/.github/workflows/brain-merge-hook.yml"
  grep -q '\.claude/lib/goals\.md' "$wf"
  grep -q 'docs/diagrams/\*\*' "$wf"
  grep -q 'docs/db-schema-diagram\.md' "$wf"
  grep -q 'bachelorprojekt/\.claude/lib/goals\.md brain/raw/goals' "$wf" \
    || { echo "FAIL: goals.md handler step missing"; return 1; }
  grep -q 'bachelorprojekt/docs/diagrams brain/raw/diagrams' "$wf" \
    || { echo "FAIL: docs/diagrams handler step missing"; return 1; }
}
BATS
tests/unit/lib/bats-core/bin/bats tests/spec/brain-merge-hook.bats
# expected: FAIL (red — no ADR handler exists today, no goals.md/diagrams triggers or handlers, no
# single-file SRC support in brain-merge-hook.sh)
```

**GREEN — implement:**

- `scripts/brain-merge-hook.sh`: branch on `[ -f "$SRC" ]` — if `$SRC` is a regular file, `cp "$SRC"
  "$DEST/$(basename "$SRC")"` directly; else keep the existing `find`-based directory walk unchanged.
- `.github/workflows/brain-merge-hook.yml`:
  - Extend `on.push.paths` with `.claude/lib/goals.md`, `docs/diagrams/**`, `docs/db-schema-diagram.md`.
  - Extend the "Run merge-hook" step with three more invocations:
    ```
    bash bachelorprojekt/scripts/brain-merge-hook.sh \
      bachelorprojekt/docs/adr brain/raw/adr
    bash bachelorprojekt/scripts/brain-merge-hook.sh \
      bachelorprojekt/.claude/lib/goals.md brain/raw/goals
    bash bachelorprojekt/scripts/brain-merge-hook.sh \
      bachelorprojekt/docs/diagrams brain/raw/diagrams
    bash bachelorprojekt/scripts/brain-merge-hook.sh \
      bachelorprojekt/docs/db-schema-diagram.md brain/raw/diagrams
    ```

**Acceptance:** `bats tests/spec/brain-merge-hook.bats` GREEN (existing 4 tests + 3 new).
`scripts/brain-merge-hook.sh` budget 488 (loc 12) — this task adds ~5 lines, far under budget.

---

## Task 9: Delta-spec verification, SKILL.md sync, and dead-artifact cleanup (E7)

**Files:** `.claude/skills/brain-ingest/SKILL.md`, `docs/code-quality/gates.yaml` (delete one
allowlist line), delete `scripts/migrate-docs-style.mjs`, `tests/spec/brain-foundation.bats`

**Delta specs (already authored this planning session — verify, do not rewrite):**
`openspec/changes/brain-ssot-consolidation/specs/brain-foundation.md` (5 ADDED requirements:
glob-coverage, fail-loud drift, diagram group + mermaid preservation, health-goals group, merge-hook
parity) and `openspec/changes/brain-ssot-consolidation/specs/health-goals.md` (new SSOT spec, to be
created via `--create-new` at archive time) were written directly by this plan-authoring session per
the task brief. `bash scripts/openspec.sh validate` (run in Task 10) is the acceptance gate for their
structure — no separate BATS coverage needed for spec-file shape.

**RED — failing test first (SKILL.md sync):**

```bash
cat >> tests/spec/brain-foundation.bats <<'BATS'

# --- T001884: brain-ingest SKILL.md synced to the real pipeline (E7) ---

@test "brain-ingest SKILL.md references the real orchestrator, not a fictional quartz CLI workflow" {
  skill="$REPO_ROOT/.claude/skills/brain-ingest/SKILL.md"
  grep -q 'scripts/brain-ingest.sh' "$skill" \
    || { echo "FAIL: SKILL.md never mentions the real orchestrator script"; return 1; }
  ! grep -q 'quartz generate --sources' "$skill" \
    || { echo "FAIL: SKILL.md still describes the never-built quartz CLI workflow"; return 1; }
}
BATS
tests/unit/lib/bats-core/bin/bats tests/spec/brain-foundation.bats
# expected: FAIL (red — SKILL.md today only shows `quartz generate --sources ...` and never
# mentions scripts/brain-ingest.sh)
```

**GREEN — implement:**

- `.claude/skills/brain-ingest/SKILL.md`: replace step 3 ("Initial-Ingest ausführen (beispielsweise mit
  Quartz CLI)" / `quartz generate --sources brain-worklist.txt --output docs/brain/wiki/`) with the real
  pipeline: `bash scripts/brain-ingest.sh --brain-repo ~/brain --dry-run` (or the `task
  brain:ingest:dry`/`brain:ingest:pilot`/`brain:ingest:run` targets from `Taskfile.brain.yaml`). Fix the
  "Artefakte" section — wiki pages land in the **external** `Paddione/brain` repo's `wiki/` directory via
  a PR (per `brain-ingest.sh` Phase 4), not in a nonexistent `docs/brain/wiki/` inside this repo. Drop
  the stale "57 Specs" fixed-count reference (now a glob, no fixed count) in favor of "alle
  `openspec/specs/*.md`".
- `docs/code-quality/gates.yaml`: remove the now-dead `- "scripts/migrate-docs-style.mjs"` line from
  `s4.allowlist_globs` (the script is deleted this task; leaving a stale allowlist entry is clutter).
- Delete `scripts/migrate-docs-style.mjs` (target HTML markup — old sidebar-style
  `k3d/docs-content-built/` pages — no longer exists; confirmed dead per the design audit and already
  flagged in `docs/code-quality/gates.yaml`'s own comment "One-shot / manual scripts — used ad-hoc").
- `docs/agent-guide/maps/*.tmp`: **verified absent already** (`find docs/agent-guide/maps -type f` and
  a repo-wide `find . -iname "*.tmp"` both return nothing beyond the tracked `.md` map files) — no
  deletion action needed. Defensive no-op guard for hygiene:
  `rm -f docs/agent-guide/maps/*.tmp 2>/dev/null || true` (a glob that matches nothing is a silent
  no-op under `|| true`, safe to leave in place if ever re-run).

**Acceptance:** `bats tests/spec/brain-foundation.bats` GREEN; `git status` shows
`scripts/migrate-docs-style.mjs` deleted; `grep -c migrate-docs-style docs/code-quality/gates.yaml`
returns `0`.

---

## Task 10: Test-inventory regeneration + Final Verification

**Files:** `website/src/data/test-inventory.json` (regenerated)

Tasks 1–9 added `@test` blocks to `tests/spec/brain-foundation.bats`, `tests/spec/brain-ingest.bats`,
`tests/spec/brain-merge-hook.bats`, and `tests/spec/health-goals.bats`, and added a new vitest suite
extension to `website/src/lib/goals-data.test.ts` — the CI test-inventory check fails if
`website/src/data/test-inventory.json` doesn't reflect these. Regenerate and commit it, then run the
OpenSpec delta validator plus the three mandatory gate commands:

```bash
task test:inventory
bash scripts/openspec.sh validate
task test:changed
task freshness:regenerate
task freshness:check
```

**Acceptance:** all five commands exit 0; `git diff --exit-code website/src/data/test-inventory.json`
clean after the `task test:inventory` run (i.e. nothing left to commit beyond what this task already
staged); `task freshness:check` green confirms `docs/diagrams/architecture.md` and
`website/src/lib/goals-data.generated.json` are both fresh and the S1–S4 quality-gate ratchet has no
new/worsened violations.
