---
title: "openspec-merge Marker-Kollision + ADDED-Duplikat-Guard — Implementation Plan"
ticket_id: T001473
domains: [openspec, scripts]
status: active
---

# openspec-merge Marker-Kollision + ADDED-Duplikat-Guard Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fix two bugs in `scripts/openspec-merge.mjs` (a marker that collides across different deltas sharing a basename+date, and a missing duplicate-guard on `ADDED`), then repair the resulting damage in `openspec/specs/openspec-workflow.md` (a never-applied delta from T001452 plus 10 pre-existing exact-duplicate `### Requirement:` blocks).

**Architecture:** `applyDelta()` in `scripts/openspec-merge.mjs` gains (1) a content-hash-based merge marker instead of a date-based one, and (2) a fail-closed existence check on `ADDED` mirroring the existing check on `MODIFIED`/`REMOVED`/`RENAMED`. Once fixed, the tool is re-run against the archived-but-never-merged T001452 delta to apply it for real, and the 9 remaining pre-existing duplicate pairs are removed by hand (content comparison already done in this plan — see Task 3).

**Tech Stack:** Node.js (`.mjs`), Vitest (`scripts/openspec-merge.test.ts`), Markdown (OpenSpec SSOT format).

## Global Constraints

- No behavior change to `MODIFIED`/`REMOVED`/`RENAMED` handling — only `ADDED` gains a new check.
- No rewrite of existing date-based markers already present in the repo (non-goal, per design spec).
- `openspec/specs/*.md` files other than `openspec-workflow.md` are explicitly out of scope (tracked separately as T001476).
- `bash scripts/openspec.sh validate` must exit 0 after the `openspec-workflow.md` cleanup.

---

## File Structure

| File | Responsibility |
|---|---|
| `scripts/openspec-merge.mjs` | Delta→SSOT merge tool — gains content-hash marker + ADDED duplicate guard (Tasks 1-2) |
| `scripts/openspec-merge.test.ts` | Vitest coverage — 2 new failing tests already present (verified RED pre-plan), turn GREEN in Tasks 1-2 |
| `openspec/specs/openspec-workflow.md` | SSOT spec being repaired — missed T001452 delta applied (Task 3), 10 duplicate blocks removed (Task 4) |

---

### Task 0: Confirm the pre-existing failing tests are RED (evidence, no code change)

**Files:**
- Test: `scripts/openspec-merge.test.ts` (read-only in this task — the two new tests were
  already written and appended before this plan existed)

- [ ] **Step 1: Run the full test file and capture the failure**

Run: `npx vitest run scripts/openspec-merge.test.ts`
Expected: FAIL — 2 failed, 3 passed. The two new tests
(`'applies a second delta with the same basename+date but different content …'` and
`'refuses ADDED when a requirement with the same name already exists …'`) fail because the
marker-collision and ADDED-duplicate bugs are still present in `scripts/openspec-merge.mjs`
at this point. This is the RED baseline that Tasks 1-2 turn GREEN.

---

### Task 1: Fix the marker to use a content hash instead of date

**Files:**
- Modify: `scripts/openspec-merge.mjs:8` (imports), `scripts/openspec-merge.mjs:92-96` (marker construction/check)
- Test: `scripts/openspec-merge.test.ts` (two new tests already present — see Task 0 below)

**Interfaces:**
- Consumes: none new
- Produces: `applyDelta(deltaPath, ssotPath, today, createNew, forceNewComponent)` — signature unchanged (the `today` parameter stays for call-site compatibility but is no longer used to build the marker)

- [ ] **Step 0: Confirm the two failing tests already in the worktree are RED**

The worktree `/tmp/wt-t001473-openspec-merge` already has two new tests appended to
`scripts/openspec-merge.test.ts` (added during the fix-path failing-test step, before this
plan was written):
- `'applies a second delta with the same basename+date but different content (marker must not collide) [T001473]'`
- `'refuses ADDED when a requirement with the same name already exists [T001473]'`

Run: `npx vitest run scripts/openspec-merge.test.ts`
Expected: 2 failed, 3 passed (the 3 pre-existing tests stay green; the 2 new ones fail)

- [ ] **Step 1: Add the `node:crypto` import**

In `scripts/openspec-merge.mjs`, change line 8-10 from:

```js
import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'node:fs'
import { dirname, basename, join } from 'node:path'
import { pathToFileURL } from 'node:url'
```

to:

```js
import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'node:fs'
import { dirname, basename, join } from 'node:path'
import { pathToFileURL } from 'node:url'
import { createHash } from 'node:crypto'
```

- [ ] **Step 2: Replace the marker construction**

In `scripts/openspec-merge.mjs`, find (inside `applyDelta`, right after `let content = readFileSync(ssotPath, 'utf-8')`):

```js
  let content = readFileSync(ssotPath, 'utf-8')
  const marker = `<!-- merged from change delta ${deltaName} on ${today} -->`
  if (content.includes(marker)) {
    process.stdout.write(`skip (already merged): ${deltaName}\n`)
    return 0
  }
```

Replace with:

```js
  let content = readFileSync(ssotPath, 'utf-8')
  const deltaHash = createHash('sha1').update(delta).digest('hex').slice(0, 12)
  const marker = `<!-- merged from change delta ${deltaName} (${deltaHash}) -->`
  if (content.includes(marker)) {
    process.stdout.write(`skip (already merged): ${deltaName}\n`)
    return 0
  }
```

This binds the marker to the delta's actual content (via its SHA-1 prefix) instead of the
delta's filename and the calendar date. Two different deltas that happen to share a
`basename` (the norm under the Parent-SSOT-Slug convention, since delta files are named
after their target SSOT) now produce different markers as long as their content differs.
Two applications of the byte-identical delta still produce the same marker and are still
correctly treated as idempotent no-ops — that is the desired behavior, not a regression.

Note: the `today` parameter is left in place (still used nowhere else in this function,
but removing it would require updating every call site including `main()` and the existing
test file's positional calls — out of scope for this fix, tracked as a possible follow-up
cleanup, not required for T001473's goals).

- [ ] **Step 3: Run the marker test**

Run: `npx vitest run scripts/openspec-merge.test.ts -t "marker must not collide"`
Expected: PASS

- [ ] **Step 4: Commit**

```bash
git add scripts/openspec-merge.mjs
git commit -m "fix(openspec): bind merge marker to delta content hash, not date [T001473]"
```

---

### Task 2: Add the ADDED duplicate guard

**Files:**
- Modify: `scripts/openspec-merge.mjs:101-103`

**Interfaces:**
- Consumes: `hit` (already computed on `scripts/openspec-merge.mjs:100` as `findBlocks(lines).find(b => b.name === item.name)`, currently only read by the `MODIFIED`/`REMOVED`/`RENAMED` branches)
- Produces: no new exports; `applyDelta()` now calls `fail()` (exits 1) when an `ADDED` item's name collides with an existing block

- [ ] **Step 1: Add the guard**

In `scripts/openspec-merge.mjs`, find:

```js
    if (item.op === 'ADDED') {
      const at = endOfRequirements(lines)
      lines.splice(at, 0, '', ...item.lines)
    } else if (item.op === 'MODIFIED') {
```

Replace with:

```js
    if (item.op === 'ADDED') {
      if (hit) fail(`${deltaName}: ADDED target '${item.name}' already exists in ${basename(ssotPath)} — use MODIFIED or rename the requirement`)
      const at = endOfRequirements(lines)
      lines.splice(at, 0, '', ...item.lines)
    } else if (item.op === 'MODIFIED') {
```

- [ ] **Step 2: Run the duplicate-guard test**

Run: `npx vitest run scripts/openspec-merge.test.ts -t "refuses ADDED when a requirement with the same name"`
Expected: PASS

- [ ] **Step 3: Run the full test file to confirm no regressions**

Run: `npx vitest run scripts/openspec-merge.test.ts`
Expected: 5 passed, 0 failed

- [ ] **Step 4: Commit**

```bash
git add scripts/openspec-merge.mjs
git commit -m "fix(openspec): fail-closed ADDED guard against duplicate requirement names [T001473]"
```

---

### Task 3: Apply the missed T001452 delta to openspec-workflow.md

**Files:**
- Modify: `openspec/specs/openspec-workflow.md` (via the now-fixed tool, not by hand)

**Interfaces:**
- Consumes: `applyDelta` from `scripts/openspec-merge.mjs` (via its CLI entrypoint), the archived delta at `openspec/changes/archive/2026-07-02-openspec-tracking-cleanup/specs/openspec-workflow.md` (unchanged since T001452, still contains the original `## REMOVED Requirements` / `## ADDED Requirements` blocks)
- Produces: `openspec/specs/openspec-workflow.md` without the obsolete "Archive registriert neue Komponenten automatisch in config.yaml" requirement, with the 4 new requirements from T001452 present

- [ ] **Step 1: Run the merge tool against the archived T001452 delta**

```bash
node scripts/openspec-merge.mjs apply \
  openspec/changes/archive/2026-07-02-openspec-tracking-cleanup/specs/openspec-workflow.md \
  openspec/specs/openspec-workflow.md
```

Expected: command exits 0 with no output (the tool is silent on success — it only prints on
`skip` or via `fail()`).

- [ ] **Step 2: Verify the REMOVE was applied**

```bash
grep -c "Archive registriert neue Komponenten automatisch in config.yaml" openspec/specs/openspec-workflow.md
```

Expected: `0` (the requirement is gone)

- [ ] **Step 3: Verify the 4 ADDED requirements are present**

```bash
grep -c "^### Requirement: Verzeichnis openspec/specs/ ist die einzige Komponenten-Quelle$" openspec/specs/openspec-workflow.md
grep -c "^### Requirement: One-off-Specs liegen unter openspec/specs/archive/ und werden nicht als Komponenten validiert$" openspec/specs/openspec-workflow.md
grep -c "^### Requirement: archive --create-new verweigert One-off-Slug-Muster ohne expliziten Override$" openspec/specs/openspec-workflow.md
grep -c "^### Requirement: Neu erzeugte SSOT-Stubs tragen einen deutschen Purpose-Platzhalter$" openspec/specs/openspec-workflow.md
```

Expected: `1` for each of the four commands.

- [ ] **Step 4: Commit**

```bash
git add openspec/specs/openspec-workflow.md
git commit -m "fix(openspec): apply the never-merged T001452 delta to openspec-workflow.md [T001473]"
```

---

### Task 4: Remove the 9 pre-existing exact-duplicate requirement blocks

**Files:**
- Modify: `openspec/specs/openspec-workflow.md`

**Interfaces:**
- Consumes: none (plain-text editing)
- Produces: `openspec/specs/openspec-workflow.md` with exactly one `### Requirement:` block per unique name

Content comparison for all 10 duplicate pairs was already done during planning (before Task
3's line numbers shifted the file, so re-locate each block by requirement name with `grep -n`
rather than trusting hardcoded line numbers). Findings:

- **"Kanonischer /opsx:propose-Flow respektiert die Delta-Spec-Konvention für Sub-Features"** —
  the two occurrences are content-identical (verified with `diff`, only a trailing blank-line
  difference from block boundaries). Keep the **first** occurrence, delete the **second**.
- The other 9 pairs (all `plan-frontmatter-hook …` and `plan-lint …` requirements) are **not**
  identical — the second (later) occurrence in each pair is a superset rewrite of the first,
  with additional or more concrete scenarios (e.g. `plan-frontmatter-hook bewahrt bewusst
  gesetzte Nicht-active-Statuses`: the second occurrence adds a `<!-- bats:
  plan-frontmatter-hook.bats -->` marker, more concrete example filenames, and one extra
  scenario). Keep the **second** occurrence, delete the **first**, for all 9 of these:
  - `plan-frontmatter-hook bewahrt bewusst gesetzte Nicht-active-Statuses`
  - `plan-frontmatter-hook ist idempotent für vollständige Frontmatter-Blöcke`
  - `plan-frontmatter-hook leitet ticket_id aus Body oder Dateinamen ab`
  - `plan-frontmatter-hook unterstützt --spec-Modus für Delta-Spec-Dateien`
  - `plan-frontmatter-hook --validate leitet fehlendes title-Feld aus H1 ab`
  - `plan-lint erkennt Pflicht-Strukturfehler als harten Fail`
  - `plan-lint berechnet effektive Datei-Größenschwellen korrekt (B1-Mathematik)`
  - `plan-lint meldet B1a als harten Fehler und B1b als Warnung`
  - `plan-lint gibt bei --json maschinenlesbares Verdict-Objekt aus`

- [ ] **Step 1: Re-locate all duplicate blocks post-Task-3**

```bash
grep -n '^### Requirement:' openspec/specs/openspec-workflow.md | sort -t: -k2 | uniq -f1 -d
```

This lists every requirement *name* that still has more than one occurrence (the command
groups by name, ignoring the line-number prefix, and prints only names appearing more than
once). Cross-check the count is 10 (matches the pre-Task-3 scan) before proceeding — if it's
not 10, stop and re-diff against this plan's findings before continuing (Task 3 should not
have touched any of these 10 names, since none of them appear in the T001452 delta).

- [ ] **Step 2: Delete each duplicate block using the Edit tool**

For each of the 10 requirement names above, open `openspec/specs/openspec-workflow.md`, find
the block to delete (per the keep/delete decision above), and delete from its `### Requirement:`
line through (but not including) the next `### Requirement:` or `## ` line — i.e. the entire
block including its trailing blank line(s) and any `---` separator that belongs to it, so no
extra blank lines accumulate. Use the `Edit` tool with enough surrounding context in
`old_string` to uniquely match the specific occurrence (the duplicate name alone is not
unique — include a scenario line or the line immediately before/after to disambiguate which
of the two occurrences you're targeting).

Do this one requirement name at a time, re-running the Step 1 grep after every 2-3 deletions
to confirm line numbers for the remaining ones (deletions shift subsequent line numbers).

- [ ] **Step 3: Verify no duplicates remain**

```bash
grep -n '^### Requirement:' openspec/specs/openspec-workflow.md | sort -t: -k2 | uniq -f1 -d
```

Expected: empty output.

- [ ] **Step 4: Commit**

```bash
git add openspec/specs/openspec-workflow.md
git commit -m "fix(openspec): remove 10 pre-existing exact-duplicate requirements from openspec-workflow.md [T001473]"
```

---

### Task 5: Validate and verify

**Files:** none (verification only)

- [ ] **Step 1: OpenSpec structural validation**

```bash
bash scripts/openspec.sh validate
```

Expected: exits 0, no `FAIL` lines for `openspec-workflow.md`.

- [ ] **Step 2: Full openspec test suite**

```bash
task test:openspec
```

Expected: all green, including the 5 tests in `scripts/openspec-merge.test.ts`.

- [ ] **Step 3: Changed-file test selection**

```bash
task test:changed
```

Expected: all green.

- [ ] **Step 4: Regenerate and check freshness artifacts**

```bash
task freshness:regenerate
task freshness:check
```

Expected: `freshness:check` exits 0. If `freshness:regenerate` produced diffs (e.g.
`openspec-status.json`, `repo-index.json`), stage and include them in the next commit.

- [ ] **Step 5: Final commit (freshness artifacts, if any)**

```bash
git add -A
git status --porcelain  # confirm only expected freshness artifacts are staged
git commit -m "chore: regenerate freshness artifacts [T001473]"
```

Skip this step entirely if `git status --porcelain` shows nothing after Step 4.
