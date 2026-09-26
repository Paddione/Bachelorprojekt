---
title: "autodocs-removal p-tests — Implementation Plan"
ticket_id: T900452
domains: [docs, tests]
status: active
---

# autodocs-removal p-tests — Implementation Plan

_Ticket: T900452. Scope: absence guard (new) + stale-test removal +
guard shrinks in tests/ (design E6, R1–R2). Disjoint from p1
(generator, scripts, workflows, hooks) and p2 (Taskfile, k3d/,
environments, docs/): this partial touches no file outside tests/
— the playwright.config.ts edit lives in tests/e2e/ and is the
single e2e exception. The guard asserts exactly the 7 spec deltas._

Measurement: `bash scripts/plan-intel-filter.sh autodocs-removal …`
reports `intel.json not found`, so every reference below was verified
by direct grep fallback. S1 per file: live `wc -l`; every `jq`
baseline lookup returned nicht-baselined. `.bats` is ungated
(verified: `s1.limits` in `docs/code-quality/gates.yaml`, lines
61–75, carries no `.bats` entry; the `tests/**/*.bats` line 222 is
an S4 reference source, not a limit). The executor relocates every
hunk by its anchor grep. No baseline additions.

## File Structure

| File | Change | S1 |
|------|--------|----|
| `tests/spec/autodocs-removal-guard.bats` | new absence guard, 6 @test blocks, ≤130 lines | planned-new, S1 n/a (.bats ungated) |
| `tests/spec/ci-cd/docs-content-guards.bats` | delete via git rm (Ist 102) | S1 n/a (removed) |
| `tests/e2e/specs/fa-13-docs.spec.ts` | delete via git rm (Ist 61) | S1 n/a (removed) |
| `tests/e2e/playwright.config.ts` | edit: drop fa-13 testMatch L152, net -1 (Ist 305 after) | Budget 594, Ist 306, Limit 900 (.ts) |
| `tests/spec/pre-commit-freshness.bats` | edit: drop T002239-M1 docs-content-built test, net -7 (Ist 272 after) | Ist 279, S1 n/a (.bats ungated) |
| `tests/spec/devflow-selection-archive-hardening.bats` | edit: shrink L89 regex, net 0 (Ist 187) | Ist 187, S1 n/a (.bats ungated) |
| `tests/unit/test-tasks-node-deps.bats` | edit: drop test:docs-gen test + reword header, net -10 (Ist 73 after) | Ist 83, S1 n/a (.bats ungated) |
| `tests/spec/local-dev-mesh/no-k3d-context.bats` | edit: drop docs-content-built exclusion L14, net -1 (Ist 41 after) | Ist 42, S1 n/a (.bats ungated) |
| `tests/unit/.coverage-allowlist` | edit: drop stale T003142 comment L18-21, net -4 (Ist 58 after) | Ist 62, S1 n/a (no extension) |

S4: no manifest or script is added; the new guard is referenced by
`task test:changed` selection like every tests/ file.

## Task 1: New absence guard with red proof (STRUCT2)

Create `tests/spec/autodocs-removal-guard.bats` with exactly this
content (6 blocks a–f; the keeper block is the positive anchor, so
the negative asserts cannot pass vacuously on a wrong root):

```bats
#!/usr/bin/env bats
# tests/spec/autodocs-removal-guard.bats
#
# SSOT: openspec/changes/autodocs-removal/specs/ci-cd.md
#   (Requirement: Keine Auto-Docs-Maschinerie mehr)
# Ticket: T900452
#
# Absence guard: the auto reading-docs machinery is gone — generator,
# serving path, serving tasks, env keys and site-only docs. The keeper
# block (f) is the positive anchor.

setup() {
  REPO_ROOT="$(cd "$BATS_TEST_DIRNAME/../.." && pwd)"
}

@test "(a) generator gone: workflow, Dockerfile, build script, docs-gen dir" {
  [ ! -e "$REPO_ROOT/.github/workflows/build-docs.yml" ]
  [ ! -e "$REPO_ROOT/scripts/docs.Dockerfile" ]
  [ ! -e "$REPO_ROOT/scripts/build-docs.mjs" ]
  [ ! -e "$REPO_ROOT/scripts/docs-gen" ]
}

@test "(b) serving path gone: manifests, built tree and rule refs" {
  [ ! -e "$REPO_ROOT/k3d/docs.yaml" ]
  [ ! -e "$REPO_ROOT/k3d/oauth2-proxy-docs.yaml" ]
  [ ! -e "$REPO_ROOT/k3d/docs-content-built" ]
  local hits
  hits="$(grep -n 'docs\.localhost\|oauth2-proxy-docs\|docs\.yaml' \
    "$REPO_ROOT/k3d/ingress.yaml" "$REPO_ROOT/k3d/kustomization.yaml" || true)"
  [ -z "$hits" ] || { echo "stale serving refs: $hits"; return 1; }
}

@test "(c) tasks gone: no docs:build/docs:deploy/test:docs-gen definitions" {
  local hits
  hits="$(grep -nE '^  (docs:build|docs:deploy|test:docs-gen):' "$REPO_ROOT/Taskfile.yml" || true)"
  [ -z "$hits" ] || { echo "stale task definitions: $hits"; return 1; }
}

@test "(d) env keys gone: no DOCS_URL/DOCS_IMAGE in environments" {
  local hits
  hits="$(grep -n 'DOCS_URL\|DOCS_IMAGE' \
    "$REPO_ROOT/environments/mentolder.yaml" \
    "$REPO_ROOT/environments/korczewski.yaml" \
    "$REPO_ROOT/environments/fleet-mentolder.yaml" \
    "$REPO_ROOT/environments/fleet-korczewski.yaml" \
    "$REPO_ROOT/environments/staging.yaml" \
    "$REPO_ROOT/environments/dev.yaml" \
    "$REPO_ROOT/environments/schema.yaml" || true)"
  [ -z "$hits" ] || { echo "stale env keys: $hits"; return 1; }
}

@test "(e) docs sweep done: site-only docs absent" {
  [ ! -e "$REPO_ROOT/docs/brain/k4-brain-wiki.md" ]
  [ ! -e "$REPO_ROOT/docs/DOCS-DESIGN-STANDARDS.md" ]
}

@test "(f) keepers present: regen workflow, graph task, legacy-html, templates" {
  [ -f "$REPO_ROOT/.github/workflows/freshness-regen.yml" ]
  grep -qE '^  graph:build-docs:' "$REPO_ROOT/Taskfile.yml"
  [ -d "$REPO_ROOT/docs/legacy-html" ]
  [ -d "$REPO_ROOT/templates/brain" ]
}
```

Pattern notes (verified against current tree): block (b) matches the
docs rule (`docs.localhost`, `oauth2-proxy-docs`) but not the kept
ingress header wording (`Interne Tools (Docs, Brett —
oauth2-proxy-protected)`); block (c) `docs:build` prefix also covers
`docs:build:import`, while kept `docs:refresh-diagrams` and
`graph:build-docs` do not match the anchored definitions.

Red proof — run immediately after creating the file, before any p1/p2
deletion lands:

```bash
bats tests/spec/autodocs-removal-guard.bats; echo "bats-exit=$?"
```

At this point the machinery still exists, so blocks (a)–(e) fail —
expected: FAIL with bats-exit=1. Task 4 re-runs the same command for
the green proof (bats-exit=0).

Then regenerate the inventory (a new test file requires it):

```bash
task test:inventory
```

E2E registry finding: no separate registry step exists for the
fa-13 deletion. Evidence: the only fa-13 reference outside the spec
itself is the `playwright.config.ts:152` services testMatch (Task 3
removes that line); `scripts/build-test-inventory.sh` line 84 globs
`tests/e2e/specs/*.spec.ts`, so `task test:inventory` drops the
deleted spec automatically. Remaining `fa-13-docs` hits are regen-owned
(`test-inventory.json`, `repo-index.json` — covered by inventory +
`freshness:regenerate`) or history/SSOT prose (audit doc, archived
change tasks, `software-factory.md` — out of scope, merged at archive).

## Task 2: Delete the two stale test files

Both files exist per `ls` (102 + 61 lines). Delete:

```bash
git rm tests/spec/ci-cd/docs-content-guards.bats tests/e2e/specs/fa-13-docs.spec.ts
```

Rationale: `docs-content-guards.bats` lints the built tree p2 deletes
(its REMOVED requirements live in the ci-cd delta); `fa-13-docs.spec.ts`
tests the docs service p2 un-deploys (design E6; FA-13 prose goes with
p2's `systemtest-fragebogen.md` edit). Then regenerate + verify:

```bash
task test:inventory
test ! -e tests/spec/ci-cd/docs-content-guards.bats
test ! -e tests/e2e/specs/fa-13-docs.spec.ts
test -z "$(grep -n 'fa-13-docs' components/website/src/data/test-inventory.json || true)"
grep -n 'autodocs-removal-guard' components/website/src/data/test-inventory.json
```

The last grep must hit (new guard registered); the fa-13 grep must be
empty.

## Task 3: Shrink six guards; record read-only verdicts

Apply each hunk below; everything else stays byte-identical.

`tests/e2e/playwright.config.ts` (net -1): delete L152 in the
services project only (anchor
`grep -n '\*\*/fa-13-' tests/e2e/playwright.config.ts` → exactly 1
hit; this anchor excludes the `nfa-13` keeper line):

```ts
        '**/fa-13-*.spec.ts',    // Dokumentations-Service (Docsify)
```

Keepers in this file: `nfa-13` (L186, shifts to L185 — verify by
anchor `grep -n 'nfa-13'`, never by number), `nfa-infra-health-sweep`
and all other match lines. Verify:
`test -z "$(grep -n '\*\*/fa-13-' tests/e2e/playwright.config.ts || true)"`
plus `npx tsc --noEmit -p tests/e2e/tsconfig.json` green.

`tests/spec/pre-commit-freshness.bats` (net -7): delete the single
test L175–180 plus trailing blank L181 (anchor
`grep -n 'restores k3d/docs-content-built' tests/spec/pre-commit-freshness.bats`):

```bats
@test "T002239-M1: post-merge hook restores k3d/docs-content-built/ after regen" {
  setup_t002239_m1
  [ -f "$POST_MERGE" ] || { echo "MISSING hook: $POST_MERGE"; return 1; }
  grep -qE 'checkout.*docs-content-built' "$POST_MERGE" \
    || { echo "MISSING 'checkout -- k3d/docs-content-built/' in $POST_MERGE"; return 1; }
}

```

Kept: the mermaid-snapshots test, the freshness:regenerate control
test, T002284, T001973 — p1 removes the hook line this test asserts.

`tests/spec/devflow-selection-archive-hardening.bats` (net 0): shrink
the L89 regex (anchor `grep -n 'build-docs' …` → exactly 1 hit).
Before:

```bats
  run grep -nE 'build-website\.yml|build-brett\.yml|build-docs\.yml' "$POST_MERGE"
```

After:

```bats
  run grep -nE 'build-website\.yml|build-brett\.yml' "$POST_MERGE"
```

Kept: the L84 negative assert (still passes; documents the
no-image-build contract) and all other tests. Note: p1 removes the
whole `DEPLOY_DOCS` path from `scripts/devflow-post-merge-deploy.sh`
(init + trigger + condition clause + info block), so the shrunk test
stays green via the website/brett alternatives.

`tests/unit/test-tasks-node-deps.bats` (net -10): delete the test
L68–76 plus trailing blank L77 (anchor
`grep -n 'test:docs-gen' tests/unit/test-tasks-node-deps.bats`):

```bats
@test "T000427: test:docs-gen lazily installs node deps before any node call (defensive)" {
  block="$(task_block test:docs-gen)"
  echo "$block" | grep -qE -- "$GUARD_RE"
  guard_ln="$(echo "$block" | first_match_line "$GUARD_RE")"
  node_ln="$(echo "$block" | first_match_line "$NODE_RE")"
  [ -n "$guard_ln" ]
  [ -n "$node_ln" ]
  [ "$guard_ln" -lt "$node_ln" ]
}

```

and reword the L19 header (p2 deletes the task it names):
`# RED until Taskfile.yml guards test:agent-guide (+ defensively test:docs-gen);`
becomes `# RED until Taskfile.yml guards test:agent-guide;`.
Kept with verdict: the count test (`-ge 5`) stays green — measured 19
guards now, p2 removes exactly 1 (no other p2 edit touches a guarded
line), so 18 still clears the threshold.

`tests/spec/local-dev-mesh/no-k3d-context.bats` (net -1): delete L14
(anchor `grep -n 'docs-content-built' …`):

```bats
    ':!k3d/docs-content-built'
```

This matches the local-dev-mesh delta, which drops that exclusion.

`tests/unit/.coverage-allowlist` (net -4): delete L18–21. Finding:
the stale comment spans 4 lines, not 2, and carries no basename entry
beneath it (the test it describes is already gone; Task 2 deletes its
successor guard). Anchor `grep -n 'T003142' tests/unit/.coverage-allowlist`:

```text
# --- Currently FAILS offline: referenziert tote Pfade (k3d/docs-content/ existiert
# --- nicht mehr → k3d/docs-content-built/; docs-site/index.html existiert nicht).
# --- Die ersten 4 Assertions laufen vacuously gruen (grep || true auf fehlendes
# --- Verzeichnis), 7 von 12 schlagen fehl. [T003142]
```

Verify Task 3:

```bash
bats tests/spec/pre-commit-freshness.bats
bats tests/spec/devflow-selection-archive-hardening.bats
bats tests/unit/test-tasks-node-deps.bats
bats tests/spec/local-dev-mesh/no-k3d-context.bats
test -z "$(grep -rn 'docs-content-built\|build-docs\|test:docs-gen' tests/spec/pre-commit-freshness.bats tests/spec/devflow-selection-archive-hardening.bats tests/unit/test-tasks-node-deps.bats tests/spec/local-dev-mesh/no-k3d-context.bats tests/unit/.coverage-allowlist || true)"
```

Read-only verdicts (verified, not edited): the three regen guards are
keepers — `freshness-regen-rebase-guard.bats` (16 freshness hits),
`branch-reaper-freshness-regen.bats` (35), `pre-push-artifact-guard.bats`
(11), each with 0 reading-docs hits (`build-docs`, `docs-gen`,
`docs-content-built`, `docs.yaml`, `fa-13`, `DOCS_URL`) — pure
process/plumbing asserts. Cosmetic comment lines stay untouched:
`skip-ci-marker-guard.bats:118` (living `freshness-regen.yml`
loop-protection rationale), `batch-git-worktree-integrity.bats:32`
(points at the keeper rebase-guard doc),
`health-goals.bats:490` (living-workflow atomicity rationale),
`tests/unit/worktree-create.bats:144` (T000526 history naming
test:docs-gen — pure history; note the file lives in tests/unit/, no
tests/spec/worktree-create.bats exists). Each verified by reading the
cited line.

## Task 4: Gate verification and green proof (STRUCT3)

Run the three mandatory gates from the worktree root:

```bash
task test:changed
task freshness:regenerate
task freshness:check
```

Then the red→green proof for the guard from Task 1 — after p1/p2 plus
Tasks 2–3 the same command must now pass:

```bash
bats tests/spec/autodocs-removal-guard.bats; echo "bats-exit=$?"
```

Expected now: bats-exit=0 (all 6 blocks green). Boundary (not touched
here): p1-owned scripts/workflows/hooks/package.json, p2-owned
Taskfile/k3d/environments/docs, `freshness-regen.yml`, `legacy-html`,
history mentions, SSOT spec prose (merged at archive time).
