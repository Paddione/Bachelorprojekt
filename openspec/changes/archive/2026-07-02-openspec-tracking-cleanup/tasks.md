---
title: "openspec-tracking-cleanup — Implementation Plan"
ticket_id: T001452
domains: [dev-tooling, openspec]
status: active
file_locks: [scripts/openspec-validate.ts, scripts/openspec-validate.test.ts, scripts/openspec-merge.mjs, scripts/openspec-merge.test.ts, scripts/openspec.sh, openspec/config.yaml, tests/spec/openspec-workflow.bats, website/src/lib/goals-data.ts]
shared_changes: false
batch_id: null
parent_feature: null
depends_on_plans: []
---

# openspec-tracking-cleanup — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

_Ticket: T001452_

**Goal:** Remove the OpenSpec shadow-state (`OpenSpec-Komponenten:` list + its drift/auto-register machinery), move 39 one-off ticket/gate specs into `openspec/specs/archive/`, and harden `archive --create-new` against future one-off specs — so the `openspec/specs/` directory becomes the single source of truth.

**Architecture:** The validator (`scripts/openspec-validate.ts`) drops `checkConfigDrift()` and reads the component set from the directory only. The merge tool (`scripts/openspec-merge.mjs`) drops `registerComponent()`, gains a one-off-slug denylist with a `--force-new-component` override, and emits a German placeholder Purpose instead of `"SSOT spec."`. The 39 one-off specs move out of the SSOT namespace via `git mv` (history preserved). The upstream change `openspec-auto-register` (T001389, already merged and `done`) is archived first with the still-intact tooling, then its requirement is removed from the SSOT via this change's delta.

**Tech Stack:** Node 22 / TypeScript (vitest), `.mjs` ES modules, Bash + BATS, YAML config, Astro/TS data module.

## Global Constraints

- Requirements in SSOT/delta specs: German `## Purpose`, English `### Requirement:` bodies + `#### Scenario:` GIVEN/WHEN/THEN (`openspec/config.yaml` rules).
- No `TODO`/`FIXME` tokens introduced in any spec Purpose or code (G-CQ05 grep gate).
- One-off denylist pattern (verbatim, used in code AND for the move set): `^(t[0-9]{6}|g-[a-z0-9]+[0-9]{2})`.
- S1 line gate is net-negative for every touched code file — all edits remove more than they add; `openspec/config.yaml`, `tests/spec/*.bats`, `openspec/specs/*.md` are ungated (`.md`/`.yaml`/`.bats` → threshold 0).
- No brand-domain literals (`*.mentolder.de` / `*.korczewski.de`) anywhere (S3).
- All code + config + spec-move changes land in ONE commit so the real-repo test `openspec-validate.test.ts` (`validateTree` against `openspec/`, lines 65-88) stays green atomically.

## File Structure

```
Modify: scripts/openspec-validate.ts        # remove checkConfigDrift() + its call in validateTree() (intel s1_budget 373, .ts limit 600 — net removal ~-33 lines)
Modify: scripts/openspec-validate.test.ts   # drop checkConfigDrift import + describe block (s1_budget 434 — net removal)
Modify: scripts/openspec-merge.mjs          # remove registerComponent() + call; add denylist + forceNewComponent; German stub Purpose (s1_budget 329, .mjs limit 500 — net removal)
Modify: scripts/openspec-merge.test.ts      # drop registerComponent tests/import; retarget create-new integration test; simplify fixture (s1_budget 489 — net removal)
Modify: scripts/openspec.sh                  # cmd_archive parses + forwards --force-new-component (s1_budget 292, .sh limit 500)
Modify: openspec/config.yaml                 # delete OpenSpec-Komponenten block (ungated)
Modify: tests/spec/openspec-workflow.bats    # remove T001389 block; add 4 new guards (ungated)
Modify: website/src/lib/goals-data.ts        # G-RH03 current + measured_at (s1_budget 296, .ts limit 600 — 2-line net-neutral edit)
Create: openspec/specs/archive/              # new archive dir (39 git mv'd one-off specs)
Move:   openspec/specs/<39 one-off specs>    # → openspec/specs/archive/ via git mv
Modify: 8 remaining canonical specs          # replace "SSOT spec." placeholder Purpose (ungated .md)
Delete: openspec/changes/openspec-auto-register/  # archived (moved to changes/archive/) in Task 1
Author: openspec/changes/openspec-tracking-cleanup/specs/openspec-workflow.md  # delta (already written alongside this plan)
```

<!-- vitest: no new vitest file — existing scripts/openspec-*.test.ts are edited in place; goals-data.ts change is a data-value edit with no runtime logic to cover. -->

---

### Task 1: Archive the upstream `openspec-auto-register` change (prerequisite)

Archive T001389 with the still-intact tooling. This merges its ADDED requirement
(`Archive registriert neue Komponenten automatisch in config.yaml`) into the SSOT
`openspec/specs/openspec-workflow.md` and moves the change folder into
`openspec/changes/archive/`. This change's delta (Task 11 authoring) later REMOVES
that requirement.

**Files:**
- Modify: `openspec/specs/openspec-workflow.md` (gains the auto-register requirement via merge)
- Move: `openspec/changes/openspec-auto-register/` → `openspec/changes/archive/<date>-openspec-auto-register/`

- [ ] **Step 1: Confirm the ticket is `done` (archive precondition).**

```bash
bash scripts/ticket.sh get --id T001389 | grep -o '"status" *: *"[^"]*"' | head -1
# expected: "status":"done"
```

- [ ] **Step 2: Archive the change.**

```bash
bash scripts/openspec.sh archive openspec-auto-register
# expected: "archived: openspec-auto-register -> .../changes/archive/<date>-openspec-auto-register (delta merged into SSOT)"
```

- [ ] **Step 3: Verify the requirement merged into the SSOT and the folder moved.**

```bash
grep -c 'Archive registriert neue Komponenten automatisch in config.yaml' openspec/specs/openspec-workflow.md   # expected: 1
test ! -d openspec/changes/openspec-auto-register && echo "MOVED"                                                # expected: MOVED
ls -d openspec/changes/archive/*-openspec-auto-register                                                          # expected: one dir
```

- [ ] **Step 4: Commit.**

```bash
git add openspec/specs/openspec-workflow.md openspec/changes/
git commit -m "chore(openspec): archive openspec-auto-register [T001452]"
```

---

### Task 2: Add the RED guards to `tests/spec/openspec-workflow.bats`

Write the four new assertions the cleanup must satisfy. They FAIL on the current
branch (config list still present, no denylist, `registerComponent` still fires).

**Files:**
- Modify: `tests/spec/openspec-workflow.bats`

- [ ] **Step 1: Append the four new guards** under a new section header (after the
      existing `T001385` test, keeping the `_fake_openspec_root` helper — it is
      reused here). Use assembled ticket-shaped slug `t000000-foo` to exercise the denylist.

```bash
# ── T001452: config shadow-state removed + one-off denylist ─────────────#

@test "T001452: openspec/config.yaml carries no OpenSpec-Komponenten list" {
  ! grep -qi 'OpenSpec-Komponenten' "$REPO/openspec/config.yaml"
}

@test "T001452: archive --create-new rejects a one-off ticket-shaped slug" {
  _fake_openspec_root
  run node "$REPO/scripts/openspec-merge.mjs" apply "$FX/delta-added.md" "$ROOT/specs/t000000-foo.md" --create-new
  [ "$status" -ne 0 ]
  [[ "$output" == *"--force-new-component"* ]]
  [ ! -f "$ROOT/specs/t000000-foo.md" ]
}

@test "T001452: --force-new-component overrides the one-off denylist" {
  _fake_openspec_root
  run node "$REPO/scripts/openspec-merge.mjs" apply "$FX/delta-added.md" "$ROOT/specs/t000000-foo.md" --create-new --force-new-component
  [ "$status" -eq 0 ]
  [ -f "$ROOT/specs/t000000-foo.md" ]
}

@test "T001452: validator ignores specs under openspec/specs/archive/" {
  run bash -c "cd '$REPO' && npx tsx -e \"import {validateTree} from './scripts/openspec-validate.ts'; const r=validateTree('openspec'); process.exit(r.ok?0:1)\""
  [ "$status" -eq 0 ]
}
```

- [ ] **Step 2: Run the new guards to confirm they FAIL.**

```bash
tests/unit/lib/bats-core/bin/bats tests/spec/openspec-workflow.bats --filter 'T001452'
# expected: FAIL (config list still present; denylist not implemented yet)
```

- [ ] **Step 3: Commit the RED tests.**

```bash
git add tests/spec/openspec-workflow.bats
git commit -m "test(openspec): add RED guards for tracking cleanup [T001452]"
```

---

### Task 3: Remove `checkConfigDrift()` from the validator

**Files:**
- Modify: `scripts/openspec-validate.ts` (delete `checkConfigDrift`, lines 160-195; delete its call in `validateTree`, lines 221-224)
- Modify: `scripts/openspec-validate.test.ts` (drop the `checkConfigDrift` import on line 6; delete the `describe('checkConfigDrift …')` block, lines 141-166)

**Interfaces:**
- Produces: `validateTree(openspecRoot: string): ValidationResult` now returns only change-validation + `validateSpecsDir` results (no drift step). `validateSpecsDir` already skips subdirectories via its `entry.isFile()` filter — `archive/` is ignored with no code change.

- [ ] **Step 1: Delete `checkConfigDrift`** — remove the whole function (its JSDoc block plus body, `export function checkConfigDrift(openspecRoot: string): ValidationResult { … }`).

- [ ] **Step 2: Remove its call site in `validateTree`** — delete the `// 3) Check config drift …` comment and the three lines that push `driftResult` errors/warnings, so `validateTree` ends after the `validateSpecsDir` block returning `{ ok: allErrors.length === 0, errors: allErrors, warnings: allWarnings }`.

- [ ] **Step 3: Fix the test import + drop the drift describe block** — change the import to `import { validateChange, validateTree } from './openspec-validate.js'` and delete the entire `describe('checkConfigDrift — T001304 hard gate', …)` block.

- [ ] **Step 4: Type-check + run the validator unit tests.**

```bash
npx vitest run scripts/openspec-validate.test.ts
# expected: PASS (drift tests gone; validateTree real-repo test still green ONCE Task 6+7 land — see Task 8 gate)
```

- [ ] **Step 5: Commit as part of the atomic implementation** (see Task 8 for the single squashed implementation commit; stage now).

```bash
git add scripts/openspec-validate.ts scripts/openspec-validate.test.ts
```

---

### Task 4: Rework `scripts/openspec-merge.mjs` — drop auto-register, add denylist + German stub

**Files:**
- Modify: `scripts/openspec-merge.mjs`
- Modify: `scripts/openspec-merge.test.ts`

**Interfaces:**
- Produces: `applyDelta(deltaPath, ssotPath, today = <iso>, createNew = false, forceNewComponent = false)` — new trailing boolean param. When `createNew` is set and the new-spec slug matches `^(t[0-9]{6}|g-[a-z0-9]+[0-9]{2})`, it fails unless `forceNewComponent` is true.
- Produces: `main(argv)` parses `--force-new-component` from flags and passes it through as the 5th `applyDelta` argument.
- `registerComponent()` is removed entirely (no longer exported).

- [ ] **Step 1: Extend `applyDelta` signature and add the denylist** — inside the `if (!existsSync(ssotPath)) { … }` branch, before `mkdirSync`, add the guard:

```javascript
export function applyDelta(deltaPath, ssotPath, today = new Date().toISOString().slice(0, 10), createNew = false, forceNewComponent = false) {
  // … existing stub checks …
  if (!existsSync(ssotPath)) {
    if (!createNew) {
      fail(`Target '${ssotPath}' does not exist. Point the delta at an existing spec, or pass --create-new for a genuinely new component.`)
    }
    const newSlug = basename(ssotPath, '.md')
    if (/^(t[0-9]{6}|g-[a-z0-9]+[0-9]{2})/.test(newSlug) && !forceNewComponent) {
      fail(`Refusing to create one-off spec '${newSlug}.md' (ticket/gate slug pattern). Use --target-spec <parent> to fold it into an existing component, or --force-new-component to override.`)
    }
    mkdirSync(dirname(ssotPath), { recursive: true })
    writeFileSync(ssotPath, `# ${newSlug}\n\n## Purpose\n\n_Purpose fehlt — beim nächsten inhaltlichen Delta zu ${newSlug} ergänzen._\n\n## Requirements\n`)
  }
  // … rest unchanged; the registerComponent try/catch block is deleted …
```

- [ ] **Step 2: Delete `registerComponent()`** — remove the whole `export function registerComponent(openspecRoot, slug) { … }` and its JSDoc comment.

- [ ] **Step 3: Parse the new flag in `main`.**

```javascript
function main(argv) {
  const positional = argv.filter(a => !a.startsWith('--'))
  const flags = argv.filter(a => a.startsWith('--'))
  const [verb, deltaPath, ssotPath] = positional
  if (verb !== 'apply' || !deltaPath || !ssotPath) {
    process.stderr.write('Usage: openspec-merge.mjs apply <deltaPath> <ssotPath> [--create-new] [--force-new-component]\n')
    process.exit(2)
  }
  const createNew = flags.includes('--create-new')
  const forceNewComponent = flags.includes('--force-new-component')
  return applyDelta(deltaPath, ssotPath, new Date().toISOString().slice(0, 10), createNew, forceNewComponent)
}
```

- [ ] **Step 4: Update the tests** — in `scripts/openspec-merge.test.ts`:
  - change the import to `import { applyDelta } from './openspec-merge.mjs'` (drop `registerComponent`);
  - delete the entire `describe('registerComponent', …)` block;
  - simplify `FIXTURE_CONFIG` to drop the `OpenSpec-Komponenten:` block (keep `schema`, `context`, `rules`);
  - retarget the create-new integration test to assert the SSOT is written and config.yaml is UNCHANGED, and add a denylist test:

```javascript
  it('creates a new SSOT and leaves config.yaml untouched on --create-new', () => {
    const deltaPath = join(root, 'delta.md');
    writeFileSync(deltaPath, delta);
    const ssotPath = join(root, 'specs', 'new-widget.md');
    const before = readFileSync(join(root, 'config.yaml'), 'utf-8');
    applyDelta(deltaPath, ssotPath, '2026-07-01', true);
    expect(readFileSync(ssotPath, 'utf-8')).toContain('## Purpose');
    expect(readFileSync(join(root, 'config.yaml'), 'utf-8')).toBe(before);
  });

  it('refuses a one-off ticket/gate slug unless forced', () => {
    const deltaPath = join(root, 'delta.md');
    writeFileSync(deltaPath, delta);
    expect(() => applyDelta(deltaPath, join(root, 'specs', 't000000-foo.md'), '2026-07-01', true, false)).toThrow();
  });
```

  Note: `applyDelta` calls `process.exit(1)` via `fail()`; wrap the throw expectation by spying on `process.exit` OR assert via the BATS-level test in Task 2 if the vitest `toThrow()` is impractical — prefer the BATS coverage already added and keep the vitest create-new + MODIFIED-untouched cases.

- [ ] **Step 5: Run the merge unit tests.**

```bash
npx vitest run scripts/openspec-merge.test.ts
# expected: PASS
```

- [ ] **Step 6: Stage.**

```bash
git add scripts/openspec-merge.mjs scripts/openspec-merge.test.ts
```

---

### Task 5: Forward `--force-new-component` through `scripts/openspec.sh`

**Files:**
- Modify: `scripts/openspec.sh` (`cmd_archive`, lines 119-150; `_merge_delta`, lines 152-158)

**Interfaces:**
- Consumes: `openspec-merge.mjs main(argv)` `--force-new-component` flag (Task 4).
- Produces: `cmd_archive() # args: <slug> [--create-new] [--force-new-component]` — the override flag is parsed and appended to the `_merge_delta` node invocation.

- [ ] **Step 1: Parse the flag in `cmd_archive`** — extend the option loop:

```bash
  local create_new=""
  local force_new=""
  while [[ $# -gt 0 ]]; do case "$1" in
    --create-new) create_new="--create-new"; shift ;;
    --force-new-component) force_new="--force-new-component"; shift ;;
    *) die "Unknown archive option: $1" ;;
  esac; done
```

- [ ] **Step 2: Thread it into the merge call** — pass `$force_new` to `_merge_delta`:

```bash
      _merge_delta "$capfile" "$OPENSPEC_ROOT/specs/$cap" "$create_new" "$force_new"
```

  and extend `_merge_delta`:

```bash
_merge_delta() {
  local delta="$1" ssot="$2" create_new="${3:-}" force_new="${4:-}"
  node "$REPO/scripts/openspec-merge.mjs" apply "$delta" "$ssot" $create_new $force_new
}
```

- [ ] **Step 3: Smoke-test the CLI plumbing.**

```bash
bash scripts/openspec.sh archive 2>&1 | grep -q 'archive requires <slug>' && echo OK   # expected: OK
```

- [ ] **Step 4: Stage.**

```bash
git add scripts/openspec.sh
```

---

### Task 6: Delete the `OpenSpec-Komponenten:` block from `openspec/config.yaml`

**Files:**
- Modify: `openspec/config.yaml` (delete the `OpenSpec-Komponenten: |` key and its full block scalar, lines 14-62; leave the rest of `context:` and all `rules:` intact)

- [ ] **Step 1: Remove the block** — delete from the `  OpenSpec-Komponenten: |` line through the last slug line (`    t001331-mishap-bundle`) and the trailing blank continuation lines, so `context:` ends at the `Secrets:` line and `rules:` follows unchanged.

- [ ] **Step 2: Confirm the key is gone and YAML still parses + rule categories remain** (existing BATS `T001265` asserts `specs:`/`design:` still present).

```bash
! grep -qi 'OpenSpec-Komponenten' openspec/config.yaml && echo REMOVED   # expected: REMOVED
grep -Eq '^[[:space:]]+specs:' openspec/config.yaml && grep -Eq '^[[:space:]]+design:' openspec/config.yaml && echo RULES-OK   # expected: RULES-OK
```

- [ ] **Step 3: Stage.**

```bash
git add openspec/config.yaml
```

---

### Task 7: Move the 39 one-off specs into `openspec/specs/archive/`

**Files:**
- Create: `openspec/specs/archive/`
- Move: the 39 specs below (history preserved via `git mv`)

- [ ] **Step 1: Create the archive dir and move the exact set** (the set = denylist pattern `^(t[0-9]{6}|g-[a-z0-9]+[0-9]{2}|ci01-|cq05-|size04-|pocket-id-)` ∪ 4 named single cases — `mcp-server-capabilities`, `mentolder-homepage-hifi-redesign`, `ticket-verlauf-anhaenge`, `t1224-lockfile-drift` (legacy ticket-slug format, matches no pattern); enumerated here so the move is reproducible and reviewable):

```bash
mkdir -p openspec/specs/archive
ONE_OFFS=(
  ci01-skip-ci-bot-commits cq05-todo-cleanup
  g-cd01-korczewski-secret-drift g-cq02-any-types-batch1 g-cq03-eslint-website
  g-cq05-todo-cleanup g-cq08-knip-dead-code g-dep02-major-deps-website
  g-doc03-readme-index g-doc04-architecture-adrs g-dora03-cfr-policy
  g-fe01-a11y-axe-violations g-fe02-bundle-budget g-fe03-structured-logger
  g-img01-image-pinning g-k8s03-security-context g-size01-freeze-warning-band
  g-size02-large-files-gate g-size03-website-db-split g-test01-bats-debt-skips
  g-test05-vitest-coverage mcp-server-capabilities mentolder-homepage-hifi-redesign
  pocket-id-client-seed-auth-header pocket-id-client-seed-timeout size04-loc-velocity
  t001331-mishap-bundle t001352-seed-invoice-counter-conflict t001353-mishap-bundle-ci-tickets
  t001358-sec05-health-goals t001359-size03-website-db t001360-dep02-major-deps
  t001361-fe01-a11y t001362-mishap-bundle-2 t001363-mishap-bundle
  t001408-mishap-bundle t001415-mishap-bundle ticket-verlauf-anhaenge
  t1224-lockfile-drift
)
for s in "${ONE_OFFS[@]}"; do git mv "openspec/specs/$s.md" "openspec/specs/archive/$s.md"; done
```

- [ ] **Step 2: Verify count and that no top-level one-off slug remains.**

```bash
ls openspec/specs/archive/*.md | wc -l   # expected: 39
ls openspec/specs/*.md | xargs -n1 basename | sed 's/\.md$//' \
  | grep -E '^(t[0-9]{6}|g-[a-z0-9]+[0-9]{2}|ci01-|cq05-|size04-|pocket-id-)' \
  && echo "LEAK" || echo "CLEAN"   # expected: CLEAN
```

- [ ] **Step 3: Stage.**

```bash
git add openspec/specs
```

---

### Task 8: Fix placeholder Purpose on the 8 remaining canonical specs + run the atomic GREEN gate

The following canonical specs still carry the `SSOT spec.` placeholder Purpose
(they are NOT in the archive set). Replace each `SSOT spec.` line with a real
one-sentence German Purpose describing that component. This is also the point
where Tasks 3-7 are verified together against the real repo.

**Files (Modify `## Purpose` only):**
- `openspec/specs/agent-push-notifications.md`
- `openspec/specs/agent-skills.md`
- `openspec/specs/agentic-tooling-quality-goals.md`
- `openspec/specs/ai-ticket-auto-triage.md`
- `openspec/specs/coaching-sessions-polish-guide.md`
- `openspec/specs/divergence-guard.md`
- `openspec/specs/openspec-upstream-cli.md`
- `openspec/specs/rustdesk-server.md`

- [ ] **Step 1: Replace each placeholder** with a concise German Purpose (one sentence, no `TODO` token), e.g. for `divergence-guard.md`: `Dieser Spec beschreibt den Divergence-Guard, der Abweichungen zwischen deklariertem Soll-Zustand und Ist-Zustand im Repo erkennt und meldet.` Derive each sentence from the component's own Requirements section.

- [ ] **Step 2: Confirm no canonical spec still has the placeholder.**

```bash
grep -rl '^SSOT spec\.\s*$' openspec/specs/*.md || echo "NO-PLACEHOLDER"   # expected: NO-PLACEHOLDER
```

- [ ] **Step 3: Run the real-repo validator gate (the atomicity checkpoint).**

```bash
bash scripts/openspec.sh validate                 # expected: "openspec validate: OK"
npx vitest run scripts/openspec-validate.test.ts scripts/openspec-merge.test.ts   # expected: PASS (incl. validateTree real-repo test)
```

- [ ] **Step 4: Stage + single implementation commit** (folds Tasks 3-8 so the real-repo test is green in one commit).

```bash
git add openspec/specs scripts/openspec-validate.ts scripts/openspec-validate.test.ts \
        scripts/openspec-merge.mjs scripts/openspec-merge.test.ts scripts/openspec.sh \
        openspec/config.yaml
git commit -m "refactor(openspec): drop config shadow-state + archive one-off specs [T001452]"
```

---

### Task 9: Remove the T001389 BATS block and turn the RED guards GREEN

**Files:**
- Modify: `tests/spec/openspec-workflow.bats` (delete the `T001389` section, lines 187-235: the `_fake_openspec_root` helper is KEPT because Task 2's new tests reuse it; delete only the three `@test "T001389: …"` cases)

- [ ] **Step 1: Delete the three `@test "T001389: …"` cases** (auto-register / idempotent-register / MODIFIED-untouched). Keep `_fake_openspec_root`.

- [ ] **Step 2: Run the whole suite — the Task 2 guards must now PASS.**

```bash
tests/unit/lib/bats-core/bin/bats tests/spec/openspec-workflow.bats
# expected: PASS (all T001452 guards green; no orphaned T001389 tests)
```

- [ ] **Step 3: Commit.**

```bash
git add tests/spec/openspec-workflow.bats
git commit -m "test(openspec): drop T001389 auto-register tests, keep cleanup guards [T001452]"
```

---

### Task 10: Update the G-RH03 health-goal metric

**Files:**
- Modify: `website/src/lib/goals-data.ts` (the `G-RH03` object, lines 105-112)

**Interfaces:**
- Consumes: the `G-RH03.measurement` command (`SPECS=$(ls openspec/specs/*.md | wc -l); BATS=$(ls tests/spec/*.bats | wc -l); …`) — the top-level `*.md` glob no longer counts the 38 archived specs.

- [ ] **Step 1: Compute the fresh value** with the goal's own measurement command:

```bash
SPECS=$(ls openspec/specs/*.md | wc -l); BATS=$(ls tests/spec/*.bats | wc -l); python3 -c "print(f'{$BATS/$SPECS*100:.0f}')"
# note the printed integer — this is the new `current`
```

- [ ] **Step 2: Set `current:` to that integer and `measured_at:` to the implementation date** (leave `baseline`, `target`, `direction: 'higher'` unchanged). Net-neutral 2-line edit.

- [ ] **Step 3: Commit.**

```bash
git add website/src/lib/goals-data.ts
git commit -m "chore(goals): refresh G-RH03 after openspec archive [T001452]"
```

---

### Task 11: Final verification (mandatory CI-equivalent gates)

The delta `openspec/changes/openspec-tracking-cleanup/specs/openspec-workflow.md`
(REMOVED auto-register requirement + 4 ADDED requirements) is authored alongside
this plan; this task validates the whole change end-to-end.

- [ ] **Step 1: OpenSpec validation must be green (delta + SSOT format).**

```bash
task test:openspec        # or: bash scripts/openspec.sh validate
# expected: PASS / "openspec validate: OK"
```

- [ ] **Step 2: Regenerate the test inventory** (BATS `@test` set changed) **and commit it.**

```bash
task test:inventory
git add website/src/data/test-inventory.json
git commit -m "chore(tests): regenerate inventory after openspec cleanup [T001452]"
```

- [ ] **Step 3: Run the three mandatory CI gates.**

```bash
task test:changed          # targeted vitest --changed + BATS selection + quality (activates test:openspec for openspec/ changes)
task freshness:regenerate  # regenerates openspec-status.json (auto-register now archived), test-inventory, repo-index
task freshness:check       # CI-equivalent: freshness + quality:check (S1-S4 ratchet) + baseline key-count assertion
```

- [ ] **Step 4: Commit any regenerated freshness artifacts.**

```bash
git add website/src/data/openspec-status.json docs/code-quality/ website/src/data/
git commit -m "chore: regenerate freshness artifacts [T001452]" || echo "nothing to regenerate"
```
