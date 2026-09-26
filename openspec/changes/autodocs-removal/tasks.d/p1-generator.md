---
title: "autodocs-removal p1-generator — Implementation Plan"
ticket_id: T900452
domains: [docs, cleanup]
status: active
---

# autodocs-removal p1-generator — Implementation Plan

_Ticket: T900452. Scope: generator deletion + `systembrett-html.mjs`
relocation (design E1) + promote/hooks/ignore cleanups + root
`package.json` scripts. Disjoint from p2 (Taskfile/k3d/docs) and p-tests
(tests/ + STRUCT2)._

Measurement: `bash scripts/plan-intel-filter.sh autodocs-removal …`
reports `intel.json not found`, so every reference below was verified by
direct grep fallback. S1 thresholds come from `docs/code-quality/gates.yaml`
(`.mjs`/`.sh` 800, `.ts` 900); all `jq` baseline lookups returned
nicht-baselined, so the effective threshold equals the static limit and
each claimed number equals `residual_budget` output. Line counts are live
`wc -l`.

## File Structure

| File | Change | S1 |
|------|--------|----|
| `scripts/docs-gen/systembrett-html.mjs` | move source via git mv (byte-identical, 221 lines) | Budget 579, Ist 221, Limit 800 (.mjs) |
| `scripts/systembrett-html.mjs` | move target (planned-new, Ist 221 after mv) | planned-new, Limit 800 (.mjs) |
| `scripts/systembrett-generate.mjs` | edit: 1-line import rewire, net 0 | Budget 537, Ist 263, Limit 800 (.mjs) |
| `scripts/feature-promote.sh` | edit: docs service removal, net -9 (Ist 124 after) | Budget 667, Ist 133, Limit 800 (.sh) |
| `scripts/lib/promote-phases.sh` | edit: 4 docs arms removal, net -8 (Ist 200 after) | Budget 592, Ist 208, Limit 800 (.sh) |
| `scripts/index-repo.ts` | edit: IGNORE_DIRS reflow, net -1 (Ist 446 after) | Budget 453, Ist 447, Limit 900 (.ts) |
| `scripts/build-graph.mjs` | edit: exclusion + comments, net 0 | Budget 469, Ist 331, Limit 800 (.mjs) |
| `scripts/code-quality/scan.test.mjs` | edit: drop 1 assert, net -1 (Ist 38 after) | Budget 761, Ist 39, Limit 800 (.mjs) |
| `.githooks/pre-commit` | edit: drop auto-stage entry, net -1 (Ist 258 after) | Ist 259, S1 n/a (no extension) |
| `.githooks/post-merge` | edit: drop checkout + reword, net -1 (Ist 50 after) | Ist 51, S1 n/a (no extension) |
| `.github/workflows/codeql.yml` | edit: drop paths-ignore entry, net -1 (Ist 105 after) | Ist 106, S1 n/a (.yml ungated) |
| `package.json` | edit: drop 2 scripts, net -2 (Ist 49 after) | Ist 51, S1 n/a (.json ungated) |
| `commitlint.config.cjs` | edit: drop docs-gen scope, net 0 (Ist 116) | Budget 284, Ist 116, Limit 400 (.cjs) |
| `scripts/worktree-create.sh` | edit: reword comment, net 0 (Ist 620) | Budget 180, Ist 620, Limit 800 (.sh) |
| `.gitignore` | edit: drop 2 lines, net -2 (Ist 257 after) | Ist 259, S1 n/a (no extension) |
| `scripts/devflow-post-merge-deploy.sh` | edit: drop DEPLOY_DOCS path, net -5 (Ist 129 after) | Budget 666, Ist 134, Limit 800 (.sh) |
| `.github/workflows/build-docs.yml` | delete via git rm | S1 n/a (removed) |
| `scripts/docs.Dockerfile` | delete via git rm | S1 n/a (removed) |
| `scripts/build-docs.mjs` | delete via git rm | S1 n/a (removed) |
| `scripts/docs-gen/` | delete dir via git rm -r (33 tracked files, all .mjs) | S1 n/a (removed) |

S4: deletions remove their references — no new manifest or script is
added except the relocated module, which stays reachable through the
rewired import in `scripts/systembrett-generate.mjs`.

## Task 1: Relocate systembrett-html.mjs and rewire its caller

Move the only foreign docs-gen module back to `scripts/` (design E1),
then rewire its single caller. The module is pure (no imports, 18
exports, no fs/exec calls) and its header comment stays true, so the
move itself is byte-identical.

Steps:

```bash
git mv scripts/docs-gen/systembrett-html.mjs scripts/systembrett-html.mjs
```

In `scripts/systembrett-generate.mjs`, rewire the import (anchor:
`grep -n 'docs-gen/systembrett-html' scripts/systembrett-generate.mjs`
hits line 28). Before:

```js
} from "./docs-gen/systembrett-html.mjs";
```

After:

```js
} from "./systembrett-html.mjs";
```

Verify (narrowest safe form — `workspace:systembrett-setup` has no
dry-run; it uploads via `systembrett-setup.sh`, and running the
generator would dirty the whiteboard artifact):

```bash
node --check scripts/systembrett-html.mjs
node --check scripts/systembrett-generate.mjs
node --input-type=module -e "import('./scripts/systembrett-html.mjs').then(m => console.log('exports:', Object.keys(m).length))"
test -z "$(grep -rn 'docs-gen/systembrett-html' scripts/ || true)"
```

The import check prints `exports: 18`; the grep returns zero hits.

## Task 2: Delete the generator

Remove the workflow, Dockerfile, build script and the whole docs-gen
dir. Verified before deletion: all three files exist per `ls`;
`git ls-files scripts/docs-gen/ | wc -l` returns 33 (the brief said 32 —
actual count is 33, all `.mjs`, no subdirs). Task 1 already moved one
file out, so `git rm -r` takes the remaining 32.

Steps:

```bash
git ls-files scripts/docs-gen/ | wc -l   # expect 32 after Task 1
git rm .github/workflows/build-docs.yml scripts/docs.Dockerfile scripts/build-docs.mjs
git rm -r scripts/docs-gen
```

Verify:

```bash
test ! -e scripts/docs-gen && test ! -e scripts/build-docs.mjs
test ! -e scripts/docs.Dockerfile && test ! -e .github/workflows/build-docs.yml
test -z "$(grep -rln 'from ".\/docs-gen\/' scripts/ || true)"
```

No live import of the deleted dir may remain under `scripts/`.

## Task 3: Promote, hooks and ignore cleanups

Apply each hunk below; everything else in these files stays
byte-identical. Anchors are given per hunk for relocation.

`scripts/feature-promote.sh` (net -9):

- Line 9 header enum (anchor `grep -n 'SERVICE.*website | brett'`):
  `#   SERVICE             website | brett | docs` becomes
  `#   SERVICE             website | brett`
- Line 35 (anchor `grep -n 'currently the case'`):
  `#    Empty pattern → smoke skipped (currently the case for \`docs\`).`
  becomes `#    Empty pattern → smoke skipped.`
- Lines 46-48 (anchor `grep -n 'Per-service quirks'`): delete the whole
  block, docs is the sole quirk:

```sh
# ── Per-service quirks ───────────────────────────────────────────────────────
#   - docs:  no dev stage; image deploys straight to both prods via set-image
#            on both clusters. TARGET=both is implied.
```

  leaving a single blank line before `set -euo pipefail`.
- Line 72 (anchor `grep -n 'share one image'`):
  `# website builds per-brand; brett/docs share one image across clusters.`
  becomes `# website builds per-brand; brett uses one shared image across clusters.`
- Lines 87-113 (anchor `grep -n 'skip for docs'`): unwrap the
  skip-dev branch — delete the `if` line 88, the `else` block
  lines 110-113 and reword line 87 to `# Phase 2 — dev rollout.`;
  lines 89-109 stay in place, dedented by 2 spaces. Deleted lines:

```sh
if [[ "$SERVICE" != "docs" ]]; then
else
  echo ""
  echo "▶ Phase 2-3/4 — skipped (docs has no dev stage)"
fi
```

- Line 119 (anchor `grep -n 'docs always both'`): delete verbatim
  (quoted exactly; the names below are deleted, not added):

```sh
[[ "$SERVICE" == "docs" ]] && PROD_CLUSTERS=(mentolder korczewski)   # docs always both
```

`scripts/lib/promote-phases.sh` (net -8): delete the 4 docs arms
(anchor `grep -n 'docs)' scripts/lib/promote-phases.sh`):

```sh
    docs)  echo "ghcr.io/paddione/workspace-docs" ;;
    docs)    echo "docs" ;;
    docs)    echo '' ;;
    docs)
      run node "${REPO}/scripts/build-docs.mjs" >&2
      run docker build -t "$full" -f "${REPO}/scripts/docs.Dockerfile" "${REPO}" >&2
      ;;
```

plus the now-stray blank line 23 above the first arm.

`.githooks/pre-commit` (net -1): delete line 134 inside
`_FRESHNESS_FILES` (anchor `grep -n 'docs-content-built'
.githooks/pre-commit`):

```sh
  k3d/docs-content-built/
```

`.githooks/post-merge` (net -1): delete line 28 and reword lines 24/26
(anchor `grep -n 'docs-content-built\|build-docs' .githooks/post-merge`).
Line 24 drops the first path:

```sh
# The mermaid-snapshots, test-inventory and repo-index paths are generated during
```

Line 26 drops the deleted workflow (the keeper stays):

```sh
# lives in CI (freshness-regen.yml) — restore them to HEAD
```

Line 28 deleted:

```sh
git -C "$repo_root" checkout -- k3d/docs-content-built/ 2>/dev/null || true
```

`scripts/index-repo.ts` (net -1): reflow IGNORE_DIRS lines 26-27
(anchor `grep -n 'docs-content-built' scripts/index-repo.ts`). Before:

```ts
  'node_modules', 'dist', '.git', 'docs-content-built',
  'k3d/docs-content-built', '.svelte-kit', '.astro', 'build',
```

After:

```ts
  'node_modules', 'dist', '.git', '.svelte-kit', '.astro', 'build',
```

Keeper verdict: line 309 mentions two docs-gen files inside a dated
incident comment (2026-07-27 NUL-bytes); it records history, same class
as the ADR/history keepers, and stays.

`.github/workflows/codeql.yml` (net -1): delete line 89 (anchor
`grep -n 'docs-content-built' .github/workflows/codeql.yml`):

```yaml
              - 'k3d/docs-content-built/**'
```

`scripts/build-graph.mjs` (net 0): line 5 header drops the suffix
`(excluding docs-content-built)`; line 56 drops the same suffix;
line 61 drops the third arg (`globYaml` defaults it to `[]`).
Before line 61:

```js
    const files = globYaml(full, ROOT, ['k3d/docs-content-built']);
```

After:

```js
    const files = globYaml(full, ROOT);
```

`scripts/code-quality/scan.test.mjs` (net -1): delete line 17 (anchor
`grep -n 'docs-content-built' scripts/code-quality/scan.test.mjs`):

```js
  assert.ok(!files.some((f) => f.startsWith('k3d/docs-content-built/')));
```

Read verdict: SHRINK, not block delete — the enclosing test asserts six
further ignore/scope facts (seed data, fixtures, task.sh, .github,
subsystems.yaml, website files), so only this assert goes.

`commitlint.config.cjs` (net 0): drop `'docs-gen'` from the `ci` scope
list line 51 (anchor `grep -n "docs-gen" commitlint.config.cjs` → exactly
1 hit; the `'docs'` commit *type* at line 21 stays — only the scope goes):

```js
  ci: ['quality', 'goals', 'cqg', 'docs-gen'],
```

becomes:

```js
  ci: ['quality', 'goals', 'cqg'],
```

`scripts/worktree-create.sh` (net 0): reword the comment line 508
(anchor `grep -n 'test:docs-gen' scripts/worktree-create.sh`):

```sh
#    and several `task test:all` subtasks (test:docs-gen, test:agent-guide) import
```

becomes:

```sh
#    and several `task test:all` subtasks (test:agent-guide) import
```

`.gitignore` (net -2): delete lines 162-163 (anchor
`grep -n 'docs-content-built' .gitignore`):

```text
# docs-content-built HTML is committed; search-index.json is generated (build-docs.mjs:231)
k3d/docs-content-built/search-index.json
```

`scripts/devflow-post-merge-deploy.sh` (net -5): remove the DEPLOY_DOCS
path (no docs build exists anymore; anchor
`grep -n 'DEPLOY_DOCS' scripts/devflow-post-merge-deploy.sh` → exactly
4 hits at L80/84/89/110). Four spots, everything else byte-identical:

```bash
python3 - <<'PY'
p = 'scripts/devflow-post-merge-deploy.sh'
lines = open(p).read().split('\n')
# 1. init line + 2. trigger line (exact matches, unique by anchor)
lines = [l for l in lines if l not in (
  'DEPLOY_DOCS=false',
  'echo "$CHANGED" | grep -qE \'^docs/\' && DEPLOY_DOCS=true',
)]
s = '\n'.join(lines)
# 3. early-exit condition clause
old_cond = '      && "$DEPLOY_K8S" == false && "$DEPLOY_DOCS" == false ]]; then'
new_cond = '      && "$DEPLOY_K8S" == false ]]; then'
assert s.count(old_cond) == 1, "condition clause exactly once"
s = s.replace(old_cond, new_cond)
# 4. info block
old_block = ('if [[ "$DEPLOY_DOCS" == true ]]; then\n'
             '  echo "ℹ Docs-Image: .github/workflows/build-docs.yml baut — kein lokaler Build."\n'
             'fi\n')
assert s.count(old_block) == 1, "info block exactly once"
s = s.replace(old_block, '')
open(p, 'w').write(s)
print("DEPLOY_DOCS path removed")
PY
test -z "$(grep -n 'DEPLOY_DOCS\|build-docs' scripts/devflow-post-merge-deploy.sh || true)"
bash -n scripts/devflow-post-merge-deploy.sh && echo "OK: Syntax"
```

Verify Task 3:

```bash
bash -n scripts/feature-promote.sh && bash -n scripts/lib/promote-phases.sh
bash -n .githooks/pre-commit && bash -n .githooks/post-merge
node --check scripts/build-graph.mjs && node --check scripts/code-quality/scan.test.mjs
yq eval '.' .github/workflows/codeql.yml > /dev/null
test -z "$(grep -n 'docs' scripts/feature-promote.sh || true)"
test -z "$(grep -n 'docs' scripts/lib/promote-phases.sh || true)"
for f in .githooks/pre-commit .githooks/post-merge scripts/index-repo.ts .github/workflows/codeql.yml scripts/build-graph.mjs scripts/code-quality/scan.test.mjs; do test -z "$(grep -n 'docs-content-built' "$f" || true)"; done
test -z "$(grep -n 'docs-gen' commitlint.config.cjs scripts/worktree-create.sh || true)"
test -z "$(grep -n 'docs-content-built' .gitignore || true)"
node --check commitlint.config.cjs && bash -n scripts/worktree-create.sh
```

## Task 4: Remove root package.json docs scripts

Delete lines 8-9 of the ROOT `package.json` (anchor
`grep -n 'docs' package.json`). Before:

```json
    "test:docs-gen": "node --test scripts/docs-gen/*.test.mjs",
    "build:docs": "node scripts/build-docs.mjs",
```

Surrounding comma shape stays valid (line 7 keeps its trailing comma).
Verified 2026-09-26: a repo-wide `--include='package.json'` grep over
all 25 manifests finds docs scripts only in the root file, so no other
manifest changes.

Verify:

```bash
jq empty package.json
jq -r '.scripts | keys[]' package.json
test -z "$(grep -n 'docs-gen\|build-docs\|build:docs\|test:docs' package.json || true)"
```

## Task 5: Gate verification

Run the three mandatory gates from the worktree root:

```bash
task test:changed
task freshness:regenerate
task freshness:check
```

Boundary (not touched here): all Taskfile/taskfiles edits, all k3d/
files, all tests/ files, all docs/ files, the freshness-regen.yml
keeper. Sibling scope: the Taskfile `feature:promote` desc, the
datamodel-workflow task + `workflow-map.yaml` comment belong to p2;
the alleged `vda oracle note` and `connectivity check entry` verified
as 0-hit absent (no such references exist), p2 re-asserts the 0-hits.
