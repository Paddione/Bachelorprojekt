---
title: Code-Quality Gates — Slice A (Gates & Ratchet) Implementation Plan
ticket_id: T000431
domains: [infra, test]
status: active
pr_number: null
---

# Code-Quality Gates — Slice A (Gates & Ratchet) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Stand up the read-only half of the code-quality backbone: a curated subsystem registry (`subsystems.yaml`) + gate config (`gates.yaml`), a deterministic `repo-index.json` generator with a C4 ownership cross-check, four structural gates (S1 file-size, S2 import cycles, S3 hardcoded hostnames, S4 orphan manifests/scripts), and a baseline-ratchet checker that only fails CI on **new** or **worsened** violations. No ticket-enqueue loop and no cron in this slice — those land in Slice B. This whole slice must be provably green as one squash-merge PR (emit does not throw over real HEAD; `quality:check` passes against the frozen baseline).

**Architecture:** All gate scripts emit one JSON object on stdout with a stable `key` (identity for baseline-diffing) and a numeric `metric` (severity for worsening-diffing). `check.mjs` loads `baseline.json`, runs every `gates/*.mjs`, and fails only when `(current_keys ∉ baseline) ∪ (keys in both where current.metric > baseline.metric)` is non-empty. `emit-index.mjs` scans a single **scan-universe** (`git ls-files ∩ code_roots − ignore_globs`) and throws if any tracked file in it is owned by ≠1 subsystem (C4). `repo-index.json` is byte-deterministic with **no timestamp**; CI fails on `git diff` drift (L2), exactly like the existing `test-inventory.json` step. Config and generated data live under `docs/code-quality/`; scripts under `scripts/code-quality/` mirror the `scripts/agent-guide/` pattern.

**Tech Stack:** Node.js ≥22.13 (ESM, `node:test` runner, `node:fs`, `node:child_process`), the `yaml` package (already a root devDependency), `madge` (added here as a root devDependency for S2), `task` (go-task) targets in `Taskfile.yml`, GitHub Actions (`.github/workflows/ci.yml` `offline-tests` job). No new runtime deps beyond `madge`.

**Spec:** `docs/superpowers/specs/2026-06-05-codequality-gates-design.md` (honor B1 scan-universe, B2 metric contract, B3 per-gate keys, the Slice A/B split).

---

## Pinned decisions (verified against real HEAD on branch `feature/codequality-gates`)

These values were measured against the live tree; they make `emit` not throw and the freeze finite. Do **not** re-derive — use them verbatim.

**Branch:** `feature/codequality-gates` (already checked out in `/tmp/wt-codequality-gates`).

**`code_roots`** (top-level prefixes that form the scan-universe; every one is fully subsystem-owned):
`website`, `tests`, `scripts`, `brett`, `arena-server`, `assets`, `art-library`, `k3d`, `prod`, `prod-fleet`, `prod-mentolder`, `prod-korczewski`, `environments`, `k3s`, `deploy`, `wireguard`, `docker`, `mcp-browser`, `claude-code`, `openclaw`, `pentest-dashboard`.
(Deliberately excluded so they raise no C4 throw: `.astro/`, `.github/`, `.claude/`, `.agents/`, `docs/` prose, root-level loose files like `task.sh`, `commitlint.config.cjs`, `.puppeteerrc.cjs` — none are under a `code_roots` prefix.)

**`ignore_globs`** (subtracted from the scan-universe — generated trees, the seed file, and the synthetic gate-test fixtures):
`k3d/docs-content-built/**`, `website/src/lib/system-test-seed-data.ts`, `scripts/code-quality/fixtures/**`.
Verified: with these three ignores and the directory-glob subsystems below, the scan-universe is **≈2886 files** with **0 orphans** and **0 unresolved multi-owners** (multi-matches resolved by ordered first-match). The `scripts/code-quality/fixtures/**` ignore keeps the Task 9–10 fixtures out of the scan-universe so they never perturb `repo-index.json` or any gate baseline; the exact final file count is whatever a fresh `emit-index.mjs` over the post-Task-13 tree produces (it must be > 1000 and `emit` must not throw — the count is **not** asserted exactly, only that the committed index has no drift).

**Subsystem ownership** (ordered list; **first matching subsystem wins**) — covers every scan-universe file:

| order | subsystem | `paths[]` (globs, file-level) | `owner_agent` |
|------:|-----------|-------------------------------|---------------|
| 1 | tests | `tests/**`, `website/test/**`, `website/tests/**` | `bachelorprojekt-test` |
| 2 | scripts-db | `scripts/migrations/**`, `scripts/datamodel/**` | `bachelorprojekt-db` |
| 3 | website | `website/**` | `bachelorprojekt-website` |
| 4 | infra-manifests | `k3d/**`, `prod/**`, `prod-fleet/**`, `prod-mentolder/**`, `prod-korczewski/**`, `environments/**`, `k3s/**`, `deploy/**`, `wireguard/**`, `docker/**`, `mcp-browser/**`, `claude-code/**` | `bachelorprojekt-infra` |
| 5 | scripts-infra | `scripts/**` | `bachelorprojekt-infra` |
| 6 | brett | `brett/**` | `bachelorprojekt-website` |
| 7 | arena-server | `arena-server/**` | `bachelorprojekt-infra` |
| 8 | openclaw | `openclaw/**` | `bachelorprojekt-infra` |
| 9 | assets | `assets/**`, `art-library/**` | `bachelorprojekt-website` |
| 10 | pentest | `pentest-dashboard/**` | `bachelorprojekt-security` |

**scripts/ db-vs-infra split (verified):** scripts-db = **only** `scripts/migrations/**` + `scripts/datamodel/**`. Everything else in `scripts/` (including the deliberately-not-db files the spec flags — `scripts/migrate-docs-style.mjs`, `scripts/db-schema-diagram.py`, `scripts/dev-db-refresh.sh`, `scripts/migrate.sh`, the other `scripts/migrate-*.mjs`) is scripts-infra by the order-5 `scripts/**` catch-all. Ordering scripts-db before scripts-infra is what routes `scripts/datamodel/**` correctly; the website-vs-tests overlap is resolved by ordering tests before website.

**The 6 valid `owner_agent` values** (anything else → `validate.mjs` fails closed):
`bachelorprojekt-website`, `bachelorprojekt-infra`, `bachelorprojekt-test`, `bachelorprojekt-db`, `bachelorprojekt-ops`, `bachelorprojekt-security`. (`claude-code/` runs under `bachelorprojekt-infra`, not a pseudo-owner.)

**S1 per-extension line limits** (verified to produce a finite freeze):

| ext | limit | files over limit (frozen) |
|-----|------:|--------------------------:|
| `.astro` | 400 | 12 |
| `.ts` | 600 | 6 |
| `.svelte` | 500 | 9 |
| `.sh` | 500 | 2 |
| `.mjs` | 500 | 2 |
| `.mts` | 500 | 0 |
| `.py` | 600 | 2 |
| `.js` | 600 | 4 |
| `.jsx` | 600 | 0 |
| `.tsx` | 400 | 0 |
| `.cjs` | 200 | 0 |
| `.bash` | 300 | 0 |
| `.java` | 400 | 0 |
| `.php` | 400 | 0 |

S1 **ignore list** (seed/vendored, un-actionable — never counted): `website/src/lib/system-test-seed-data.ts` (1195-line generated seed). All other over-limit files (e.g. `website/src/lib/website-db.ts` 4452, `brett/server.js` 1690, `brett/public/lib/GLTFLoader.js` 3629) are **frozen into baseline**, not ignored — the ratchet shrinks them over time. Total S1 freeze ≈ **37** violations.

**S2 graphs (madge `--circular`):** exactly three TS projects — `website` (`website/tsconfig.json`), `arena-server` (`arena-server/tsconfig.json`), `tests/e2e` (`tests/e2e/tsconfig.json`). `brett` is `"type": "commonjs"` plain JS → **not** an S2 graph. If a graph reports no cycles, the gate contributes no violations (status `pass`). Whatever cycles exist today are frozen into baseline. The S2 `key` is `S2:<graph>:<canon>` where `canon` is the cycle's member set sorted lexicographically and joined by `|` (order- and rotation-invariant; a sorted array is already its own smallest rotation). A structurally different cycle (changed membership) is intentionally a **new** key — it blocks as NEW, not as a worsened metric; the numeric `metric` (member count) is carried only for contract uniformity / human triage, since a membership change already changes the key and so never reaches the metric-worsening branch.

**S3 scope dirs:** `k3d/`, `prod/`, `prod-fleet/`, `prod-mentolder/`, `prod-korczewski/`, `website/src/`. **Not** scanned: `docs/`, `tests/`, any `*-content-built/`, `*.md`. (Note: `environments/` is **not** an S3 scope dir, so nothing under it is scanned or frozen.) "Hardcoded hostname" = a string literal matching `[a-z0-9-]+\.(mentolder|korczewski)\.de` **not** inside a comment (lines whose first non-space char is `#` or `//` are skipped; the `*.localhost` dev names in `k3d/configmap-domains.yaml` are the SSOT and that file is allowlisted). The hardcoded prod domains that legitimately appear in the scoped manifests and `website/src/` are not "fixed" — the S3 freeze is finite (tens of violations across a handful of files), all frozen into baseline so the ratchet only blocks *new* hardcoded hosts.

**S4 decision (scope stated explicitly):** S4 covers **`k3d/*.yaml` manifests** and **`scripts/*.sh` + `scripts/*.mjs` scripts** (top-level of each dir, not the curated subtrees). A file is an orphan if its **basename** appears in **no** reference source after resolving references. Reference sources: `Taskfile*.yml`, every `**/kustomization.yaml`/`**/kustomization.yml`, `docs/**/*.md`, `.github/workflows/*.yml`, **and** every other `scripts/**/*.sh` + `scripts/**/*.mjs` (so a helper `source`d transitively — e.g. `scripts/lib/scan.sh` pulled in by `scripts/migrate.sh` — is not a false orphan). Self-references don't count. Allowlist seed for deliberately-separately-deployed / bootstrap manifests: `k3d/office-stack/**`, `k3d/coturn-stack/**`, `k3d/sealed-secrets-controller.yaml`, `k3d/backup-secrets.yaml`. Verified S4 freeze is finite (≈3 manifest + ≈6 script orphans before allowlist). This scope is intentionally narrow (top-level `k3d`/`scripts` only) to keep the baseline small and actionable; broader S4 coverage is out of scope for Slice A.

---

## File Structure

Every file this plan creates or modifies, with its single responsibility.

**Created — config & generated data (`docs/code-quality/`):**

| Path | Responsibility |
|------|----------------|
| `docs/code-quality/subsystems.yaml` | Curated ordered registry: one entry per subsystem `{id, name, paths[], owner_agent, test_location, purpose}`. SSOT for C4 ownership. |
| `docs/code-quality/gates.yaml` | Gate config: `scan.code_roots[]` + `scan.ignore_globs[]`; `s1.limits{ext:int}` + `s1.ignore[]`; `s2.graphs[]`; `s3.scope_dirs[]` + `s3.allowlist_files[]`; `s4.manifest_globs[]` + `s4.script_globs[]` + `s4.reference_sources[]` + `s4.allowlist_globs[]`. |
| `docs/code-quality/baseline.json` | GENERATED by `quality:baseline:freeze`. Map `key → {gate, path, metric, detail, frozen_at}`. Committed. |
| `docs/code-quality/repo-index.json` | GENERATED by `quality:index`. Compact, grepable, byte-deterministic, **no timestamp**. Committed; CI fails on drift. |

**Created — scripts (`scripts/code-quality/`):**

| Path | Responsibility |
|------|----------------|
| `scripts/code-quality/load.mjs` | YAML loader wrapper (mirrors `scripts/agent-guide/load.mjs`). Exports `loadSubsystems(dir)`, `loadGates(dir)`. |
| `scripts/code-quality/glob.mjs` | Self-contained glob→RegExp matcher (`matchGlob(path, glob)`) supporting `*` and `**`. No external dep. |
| `scripts/code-quality/scan.mjs` | Builds the scan-universe (`scanUniverse(repoRoot, gates)`) and resolves a file to its owning subsystem (`ownerOf(file, subsystems)`, first-match). Shared by emit + gates. |
| `scripts/code-quality/validate.mjs` | Fail-closed validator: owner ∈ 6 agents, no duplicate path-glob string, every glob resolves to ≥1 tracked file, `gates.yaml` shape valid. Exports `validateRegistry(dir, repoRoot)`. |
| `scripts/code-quality/emit-index.mjs` | Scans the scan-universe, throws if any file is owned by ≠1 subsystem (C4), writes `repo-index.json` deterministically. Exports `buildIndex(...)`, `writeIndex(...)`. |
| `scripts/code-quality/gates/s1-filesize.mjs` | Tracked files over the per-ext limit. `key=S1:<path>`, `metric=lines`. Exports `runS1(repoRoot, gates)`. |
| `scripts/code-quality/gates/s2-cycles.mjs` | `madge --circular` per TS graph. `key=S2:<graph>:<canon>`, `metric=cycle member count`. Exports `runS2(repoRoot, gates)`. |
| `scripts/code-quality/gates/s3-hostnames.mjs` | Hardcoded hostnames in scope dirs (string literal, not comment). `key=S3:<path>:<host>`, `metric=1`. Exports `runS3(repoRoot, gates)`. |
| `scripts/code-quality/gates/s4-orphans.mjs` | Orphan manifests/scripts with no reference (incl. transitive script sources). `key=S4:<path>`, `metric=1`. Exports `runS4(repoRoot, gates)`. |
| `scripts/code-quality/check.mjs` | Loads baseline, runs all gates, computes CI-blocking set = new ∪ worsened, exits ≠0 iff non-empty. Exports `aggregate(...)`, `blockingSet(...)`. |
| `scripts/code-quality/freeze.mjs` | Runs all gates, writes every current violation into `baseline.json` (`frozen_at` = git HEAD short SHA, deterministic). Exports `freeze(...)`. |

**Created — tests (`scripts/code-quality/*.test.mjs`):**

| Path | Responsibility |
|------|----------------|
| `scripts/code-quality/glob.test.mjs` | `matchGlob` unit tests. |
| `scripts/code-quality/validate.test.mjs` | Fail-closed cases on fixtures. |
| `scripts/code-quality/emit-index.test.mjs` | Determinism, C4 throw, **does not throw over real HEAD**. |
| `scripts/code-quality/gates/s1-filesize.test.mjs` | Detection + JSON contract on fixtures. |
| `scripts/code-quality/gates/s2-cycles.test.mjs` | Canonical key invariance + pass-when-no-cycles. |
| `scripts/code-quality/gates/s3-hostnames.test.mjs` | Literal-vs-comment + allowlist on fixtures. |
| `scripts/code-quality/gates/s4-orphans.test.mjs` | Orphan detection + transitive-source + allowlist on fixtures. |
| `scripts/code-quality/check.test.mjs` | Ratchet: new fails, known passes, worsened fails. |

**Created — test fixtures (`scripts/code-quality/fixtures/`):** small synthetic files used by the unit tests (enumerated inside the tasks that create them).

**Modified:**

| Path | Change |
|------|--------|
| `package.json` (root) | Add `madge` to `devDependencies`; add `test:code-quality` npm script. |
| `package-lock.json` (root) | Regenerated by `npm install madge` (committed). |
| `Taskfile.yml` | Add `quality:index`, `quality:check`, `quality:baseline:freeze`, `test:code-quality`; add `test:code-quality` to `test:all` deps. |
| `.github/workflows/ci.yml` | Add two steps to `offline-tests`: (1) `task quality:index` + `git diff --exit-code docs/code-quality/repo-index.json`; (2) `task quality:check`. |

---

## Pre-flight (do once before Task 1)

- [ ] **P0: Confirm branch, worktree, node, clean tree**

```bash
cd /tmp/wt-codequality-gates
git rev-parse --abbrev-ref HEAD          # → feature/codequality-gates
node --version                            # → v22.x (>=22.13)
git status --porcelain                    # → empty (clean)
```

Expected: branch `feature/codequality-gates`, node ≥22.13, clean tree. If the tree is dirty, stop and resolve before starting.

- [x] **P1: Pull latest main into the branch**

```bash
cd /tmp/wt-codequality-gates
git fetch origin main && git rebase origin/main
```

Expected: rebase succeeds (or "up to date"). If conflicts, resolve and continue.

- [x] **P2: Create the two new directories**

```bash
cd /tmp/wt-codequality-gates
mkdir -p docs/code-quality scripts/code-quality/gates scripts/code-quality/fixtures
ls -d docs/code-quality scripts/code-quality/gates scripts/code-quality/fixtures
```

Expected: all three directories listed, no error.

---

## Tasks

### Task 1: Add `madge` devDependency + npm test script

**Files:**
- Modify: `/tmp/wt-codequality-gates/package.json`
- Modify (generated): `/tmp/wt-codequality-gates/package-lock.json`

- [x] **1.1 — Install madge as a root devDependency (writes package.json + lockfile)**

```bash
cd /tmp/wt-codequality-gates
npm install --save-dev madge@^8.0.0
```

Expected: `added N packages`, no error. `package.json` `devDependencies` now contains `"madge": "^8.0.0"`; `package-lock.json` updated.

- [x] **1.2 — Verify madge binary is present and runnable offline**

```bash
cd /tmp/wt-codequality-gates
./node_modules/.bin/madge --version
```

Expected: prints a version like `8.0.0`.

- [x] **1.3 — Add the `test:code-quality` npm script**

Edit `package.json`. Inside the `"scripts"` object, add this line after the existing `"test:agent-guide"` entry (keep the trailing comma on the line above):

```json
    "test:code-quality": "node --test scripts/code-quality/*.test.mjs scripts/code-quality/gates/*.test.mjs"
```

The resulting `"scripts"` block must be:

```json
  "scripts": {
    "test:track-pr": "node --test scripts/track-pr.test.mjs",
    "test:docs-gen": "node --test scripts/docs-gen/*.test.mjs",
    "build:docs": "node scripts/build-docs.mjs",
    "test:agent-guide": "node --test scripts/agent-guide/*.test.mjs",
    "test:code-quality": "node --test scripts/code-quality/*.test.mjs scripts/code-quality/gates/*.test.mjs"
  },
```

- [x] **1.4 — Verify package.json parses**

```bash
cd /tmp/wt-codequality-gates
node -e "const p=require('./package.json'); console.log(p.devDependencies.madge, !!p.scripts['test:code-quality'])"
```

Expected: `^8.0.0 true`.

- [x] **1.5 — Commit**

```bash
cd /tmp/wt-codequality-gates
git add package.json package-lock.json
git commit -m "chore(code-quality): add madge devDependency + test:code-quality npm script

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

### Task 2: `glob.mjs` — self-contained glob matcher (+ test)

The matcher is shared by every later module. `**` matches across `/`; `*` matches within a path segment. Anchored full-path.

**Files:**
- Create: `/tmp/wt-codequality-gates/scripts/code-quality/glob.test.mjs`
- Create: `/tmp/wt-codequality-gates/scripts/code-quality/glob.mjs`

- [x] **2.1 — Write the failing test**

Create `scripts/code-quality/glob.test.mjs`:

```js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { matchGlob } from './glob.mjs';

test('matchGlob: ** matches across slashes', () => {
  assert.equal(matchGlob('website/src/lib/db.ts', 'website/**'), true);
  assert.equal(matchGlob('website/src/lib/db.ts', 'website/src/**'), true);
  assert.equal(matchGlob('scripts/datamodel/db.py', 'scripts/datamodel/**'), true);
});

test('matchGlob: * does not cross a slash', () => {
  assert.equal(matchGlob('k3d/foo.yaml', 'k3d/*.yaml'), true);
  assert.equal(matchGlob('k3d/sub/foo.yaml', 'k3d/*.yaml'), false);
});

test('matchGlob: exact single-file glob', () => {
  assert.equal(matchGlob('website/src/lib/system-test-seed-data.ts',
    'website/src/lib/system-test-seed-data.ts'), true);
  assert.equal(matchGlob('website/src/lib/other.ts',
    'website/src/lib/system-test-seed-data.ts'), false);
});

test('matchGlob: non-match outside the prefix', () => {
  assert.equal(matchGlob('docs/readme.md', 'website/**'), false);
});

test('matchGlob: regex metacharacters in path are literal', () => {
  assert.equal(matchGlob('website/src/pages/admin/projekte/[id].astro',
    'website/**'), true);
});
```

- [x] **2.2 — Run the test, expect FAIL (module missing)**

```bash
cd /tmp/wt-codequality-gates
node --test scripts/code-quality/glob.test.mjs
```

Expected: FAIL — `Cannot find module '.../glob.mjs'` (or `ERR_MODULE_NOT_FOUND`).

- [x] **2.3 — Write the implementation**

Create `scripts/code-quality/glob.mjs`:

```js
// scripts/code-quality/glob.mjs
// Minimal glob → RegExp, anchored full-path. Supports `*` (within a segment)
// and `**` (across segments). No external dependency.

/** Compile a glob to an anchored RegExp. */
function globToRe(glob) {
  let re = '^';
  for (let i = 0; i < glob.length; i++) {
    const c = glob[i];
    if (c === '*') {
      if (glob[i + 1] === '*') {
        i++;
        if (glob[i + 1] === '/') { i++; re += '(?:.*/)?'; }
        else re += '.*';
      } else {
        re += '[^/]*';
      }
    } else if ('.+^${}()|[]\\'.includes(c)) {
      re += '\\' + c;
    } else {
      re += c;
    }
  }
  return new RegExp(re + '$');
}

const _cache = new Map();

/** True iff `path` matches `glob`. */
export function matchGlob(path, glob) {
  let re = _cache.get(glob);
  if (!re) { re = globToRe(glob); _cache.set(glob, re); }
  return re.test(path);
}
```

- [x] **2.4 — Run the test, expect PASS**

```bash
cd /tmp/wt-codequality-gates
node --test scripts/code-quality/glob.test.mjs
```

Expected: `# pass 5`, `# fail 0`.

- [x] **2.5 — Commit**

```bash
cd /tmp/wt-codequality-gates
git add scripts/code-quality/glob.mjs scripts/code-quality/glob.test.mjs
git commit -m "feat(code-quality): self-contained glob matcher (glob.mjs)

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

### Task 3: `subsystems.yaml` + `gates.yaml` — the config SSOT

No test in this task; the config is exercised by Tasks 4–6. Use the pinned values verbatim.

**Files:**
- Create: `/tmp/wt-codequality-gates/docs/code-quality/subsystems.yaml`
- Create: `/tmp/wt-codequality-gates/docs/code-quality/gates.yaml`

- [x] **3.1 — Write `subsystems.yaml`** (ordered — first match wins)

Create `docs/code-quality/subsystems.yaml`:

```yaml
# docs/code-quality/subsystems.yaml
# Curated subsystem registry (C4 ownership SSOT). ORDERED: the first subsystem
# whose paths[] glob matches a file owns that file. Owner_agent MUST be one of the
# six routing agents. Do not edit repo-index.json by hand — run `task quality:index`.
- id: tests
  name: Test suites (BATS + Playwright + vitest)
  paths: ["tests/**", "website/test/**", "website/tests/**"]
  owner_agent: bachelorprojekt-test
  test_location: tests/
  purpose: Offline + E2E + unit test harness and fixtures.
- id: scripts-db
  name: Database scripts (migrations + datamodel)
  paths: ["scripts/migrations/**", "scripts/datamodel/**"]
  owner_agent: bachelorprojekt-db
  test_location: scripts/datamodel/tests/
  purpose: SQL migrations and the datamodel/ERD generator.
- id: website
  name: Astro + Svelte website
  paths: ["website/**"]
  owner_agent: bachelorprojekt-website
  test_location: website/test/
  purpose: Public site, admin portal, chat, billing, content hub.
- id: infra-manifests
  name: Kubernetes manifests, overlays, env registry
  paths:
    - "k3d/**"
    - "prod/**"
    - "prod-fleet/**"
    - "prod-mentolder/**"
    - "prod-korczewski/**"
    - "environments/**"
    - "k3s/**"
    - "deploy/**"
    - "wireguard/**"
    - "docker/**"
    - "mcp-browser/**"
    - "claude-code/**"
  owner_agent: bachelorprojekt-infra
  test_location: tests/manifests/
  purpose: Kustomize bases/overlays, sealed secrets, sidecar images, MCP config.
- id: scripts-infra
  name: Operational + build scripts
  paths: ["scripts/**"]
  owner_agent: bachelorprojekt-infra
  test_location: scripts/tests/
  purpose: Deploy/migration/build helpers (everything in scripts/ that is not DB).
- id: brett
  name: Brett 3D board (CommonJS)
  paths: ["brett/**"]
  owner_agent: bachelorprojekt-website
  test_location: brett/
  purpose: Node.js 3D systemic-constellation board + mayhem game.
- id: arena-server
  name: Arena WebSocket game server (TS)
  paths: ["arena-server/**"]
  owner_agent: bachelorprojekt-infra
  test_location: arena-server/src/
  purpose: Korczewski-only authoritative game server.
- id: openclaw
  name: OpenClaw WSL gateway config
  paths: ["openclaw/**"]
  owner_agent: bachelorprojekt-infra
  test_location: openclaw/
  purpose: Local LLM gateway bootstrap config.
- id: assets
  name: Design + art-library assets
  paths: ["assets/**", "art-library/**"]
  owner_agent: bachelorprojekt-website
  test_location: art-library/_tooling/
  purpose: Design overviews, game art, art-library tooling.
- id: pentest
  name: Pentest dashboard
  paths: ["pentest-dashboard/**"]
  owner_agent: bachelorprojekt-security
  test_location: pentest-dashboard/
  purpose: Security tooling dashboard.
```

- [x] **3.2 — Write `gates.yaml`** (scan-universe + all four gate configs)

Create `docs/code-quality/gates.yaml`:

```yaml
# docs/code-quality/gates.yaml
# Gate configuration. scan.* defines the universe for emit + every gate.
scan:
  code_roots:
    - website
    - tests
    - scripts
    - brett
    - arena-server
    - assets
    - art-library
    - k3d
    - prod
    - prod-fleet
    - prod-mentolder
    - prod-korczewski
    - environments
    - k3s
    - deploy
    - wireguard
    - docker
    - mcp-browser
    - claude-code
    - openclaw
    - pentest-dashboard
  ignore_globs:
    - "k3d/docs-content-built/**"
    - "website/src/lib/system-test-seed-data.ts"
    # Synthetic gate-test fixtures live under scripts/** (scripts-infra) but must
    # never enter the scan-universe — otherwise they perturb repo-index.json and
    # could be mistaken for orphans/over-limit files. Ignoring them keeps the
    # index and every gate baseline stable as fixtures are added (Finding-3 fix).
    - "scripts/code-quality/fixtures/**"

s1:
  limits:
    .astro: 400
    .ts: 600
    .svelte: 500
    .sh: 500
    .mjs: 500
    .mts: 500
    .py: 600
    .js: 600
    .jsx: 600
    .tsx: 400
    .cjs: 200
    .bash: 300
    .java: 400
    .php: 400
  ignore:
    - "website/src/lib/system-test-seed-data.ts"

s2:
  graphs:
    - id: website
      tsconfig: website/tsconfig.json
    - id: arena-server
      tsconfig: arena-server/tsconfig.json
    - id: e2e
      tsconfig: tests/e2e/tsconfig.json

s3:
  scope_dirs:
    - k3d/
    - prod/
    - prod-fleet/
    - prod-mentolder/
    - prod-korczewski/
    - website/src/
  # configmap-domains.yaml is the *.localhost dev SSOT — never a violation.
  allowlist_files:
    - k3d/configmap-domains.yaml

s4:
  manifest_globs:
    - "k3d/*.yaml"
  script_globs:
    - "scripts/*.sh"
    - "scripts/*.mjs"
  reference_sources:
    - "Taskfile*.yml"
    - "**/kustomization.yaml"
    - "**/kustomization.yml"
    - "docs/**/*.md"
    - ".github/workflows/*.yml"
    - "scripts/**/*.sh"
    - "scripts/**/*.mjs"
  allowlist_globs:
    - "k3d/office-stack/**"
    - "k3d/coturn-stack/**"
    - "k3d/sealed-secrets-controller.yaml"
    - "k3d/backup-secrets.yaml"
```

- [x] **3.3 — Verify both files parse as YAML**

```bash
cd /tmp/wt-codequality-gates
node -e "import('yaml').then(({parse})=>{const fs=require('fs');const s=parse(fs.readFileSync('docs/code-quality/subsystems.yaml','utf8'));const g=parse(fs.readFileSync('docs/code-quality/gates.yaml','utf8'));console.log('subsystems:',s.length,'gates s1 limits:',Object.keys(g.s1.limits).length,'graphs:',g.s2.graphs.length);})"
```

Expected: `subsystems: 10 gates s1 limits: 14 graphs: 3`.

- [x] **3.4 — Commit**

```bash
cd /tmp/wt-codequality-gates
git add docs/code-quality/subsystems.yaml docs/code-quality/gates.yaml
git commit -m "feat(code-quality): subsystems.yaml + gates.yaml config SSOT

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

### Task 4: `load.mjs` + `scan.mjs` — loaders and scan-universe

**Files:**
- Create: `/tmp/wt-codequality-gates/scripts/code-quality/load.mjs`
- Create: `/tmp/wt-codequality-gates/scripts/code-quality/scan.test.mjs`
- Create: `/tmp/wt-codequality-gates/scripts/code-quality/scan.mjs`

- [x] **4.1 — Write `load.mjs`** (no separate test — exercised by scan.test.mjs)

Create `scripts/code-quality/load.mjs`:

```js
// scripts/code-quality/load.mjs
// YAML loader wrappers (mirrors scripts/agent-guide/load.mjs).
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { parse as parseYaml } from 'yaml';

/** Load the ordered subsystem registry. Always returns an array. */
export function loadSubsystems(dir) {
  const parsed = parseYaml(readFileSync(join(dir, 'subsystems.yaml'), 'utf8'));
  return Array.isArray(parsed) ? parsed : [];
}

/** Load gates.yaml. Always returns an object. */
export function loadGates(dir) {
  const parsed = parseYaml(readFileSync(join(dir, 'gates.yaml'), 'utf8'));
  return parsed && typeof parsed === 'object' ? parsed : {};
}
```

- [x] **4.2 — Write the failing test for `scan.mjs`**

Create `scripts/code-quality/scan.test.mjs`:

```js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { scanUniverse, ownerOf } from './scan.mjs';
import { loadSubsystems, loadGates } from './load.mjs';

const repoRoot = join(fileURLToPath(import.meta.url), '..', '..', '..');
const cfgDir = join(repoRoot, 'docs', 'code-quality');

test('scanUniverse returns tracked files under code_roots minus ignores', () => {
  const gates = loadGates(cfgDir);
  const files = scanUniverse(repoRoot, gates);
  assert.ok(files.length > 1000, `expected a large scan set, got ${files.length}`);
  // ignore_globs honoured:
  assert.ok(!files.includes('website/src/lib/system-test-seed-data.ts'));
  assert.ok(!files.some((f) => f.startsWith('k3d/docs-content-built/')));
  // gate-test fixtures are ignored (Finding-3 fix): they never perturb the index.
  assert.ok(!files.some((f) => f.startsWith('scripts/code-quality/fixtures/')));
  // outside code_roots excluded:
  assert.ok(!files.includes('task.sh'));
  assert.ok(!files.some((f) => f.startsWith('.github/')));
  // a real in-scope file present:
  assert.ok(files.includes('docs/code-quality/subsystems.yaml') === false);
  assert.ok(files.some((f) => f.startsWith('website/src/')));
});

test('ownerOf resolves by first-match order', () => {
  const subs = loadSubsystems(cfgDir);
  // tests beats website
  assert.equal(ownerOf('website/test/foo.ts', subs)?.id, 'tests');
  // scripts-db beats scripts-infra
  assert.equal(ownerOf('scripts/datamodel/db.py', subs)?.id, 'scripts-db');
  assert.equal(ownerOf('scripts/migrate.sh', subs)?.id, 'scripts-infra');
  // plain website
  assert.equal(ownerOf('website/src/lib/db.ts', subs)?.id, 'website');
  // unowned
  assert.equal(ownerOf('docs/readme.md', subs), undefined);
});
```

- [x] **4.3 — Run the test, expect FAIL (scan.mjs missing)**

```bash
cd /tmp/wt-codequality-gates
node --test scripts/code-quality/scan.test.mjs
```

Expected: FAIL — `Cannot find module '.../scan.mjs'`.

- [x] **4.4 — Write `scan.mjs`**

Create `scripts/code-quality/scan.mjs`:

```js
// scripts/code-quality/scan.mjs
// The single scan-universe (git ls-files ∩ code_roots − ignore_globs) and the
// first-match subsystem owner resolver. Shared by emit-index + every gate.
import { execFileSync } from 'node:child_process';
import { matchGlob } from './glob.mjs';

/** All git-tracked files at repoRoot, sorted, POSIX-separated. */
export function trackedFiles(repoRoot) {
  const out = execFileSync('git', ['ls-files'], { cwd: repoRoot, encoding: 'utf8' });
  return out.split('\n').map((l) => l.trim()).filter(Boolean).sort();
}

/** True iff `file` is under one of the code_roots prefixes. */
function underRoots(file, roots) {
  return roots.some((r) => file === r || file.startsWith(r + '/'));
}

/** The scan-universe: tracked ∩ code_roots − ignore_globs, sorted. */
export function scanUniverse(repoRoot, gates) {
  const roots = gates?.scan?.code_roots ?? [];
  const ignore = gates?.scan?.ignore_globs ?? [];
  return trackedFiles(repoRoot).filter(
    (f) => underRoots(f, roots) && !ignore.some((g) => matchGlob(f, g)),
  );
}

/** The first subsystem (in file order) whose paths[] glob matches, or undefined. */
export function ownerOf(file, subsystems) {
  for (const sub of subsystems) {
    if ((sub.paths ?? []).some((g) => matchGlob(file, g))) return sub;
  }
  return undefined;
}
```

- [x] **4.5 — Run the test, expect PASS**

```bash
cd /tmp/wt-codequality-gates
node --test scripts/code-quality/scan.test.mjs
```

Expected: `# pass 2`, `# fail 0`.

- [x] **4.6 — Commit**

```bash
cd /tmp/wt-codequality-gates
git add scripts/code-quality/load.mjs scripts/code-quality/scan.mjs scripts/code-quality/scan.test.mjs
git commit -m "feat(code-quality): YAML loaders + scan-universe resolver

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

### Task 5: `validate.mjs` — fail-closed registry validation

Rules: (a) every `owner_agent` ∈ the six routing agents; (b) no two subsystem entries declare the **identical** path-glob string (config sanity — overlap by order is allowed, exact duplicate is not); (c) every path-glob matches ≥1 tracked file (no dead globs); (d) `gates.yaml` has the required shape, **fail-closed on every key consumed downstream** so a malformed config cannot pass validate and misbehave later: `scan.code_roots[]` (non-empty array), `scan.ignore_globs[]` (array), `s1.limits` (object whose every value is a number — consumed by Task 7), `s2.graphs[]` (non-empty array; **each entry** has a string `id` and a string `tsconfig` — consumed by Task 8), `s3.scope_dirs[]` (non-empty array), `s3.allowlist_files[]` (array — consumed by Task 9), `s4.manifest_globs[]` (array), `s4.script_globs[]` (array — consumed by Task 10), `s4.reference_sources[]` (non-empty array), `s4.allowlist_globs[]` (array — consumed by Task 10).

**Files:**
- Create: `/tmp/wt-codequality-gates/scripts/code-quality/fixtures/bad-owner/subsystems.yaml`
- Create: `/tmp/wt-codequality-gates/scripts/code-quality/fixtures/bad-owner/gates.yaml`
- Create: `/tmp/wt-codequality-gates/scripts/code-quality/fixtures/dup-glob/subsystems.yaml`
- Create: `/tmp/wt-codequality-gates/scripts/code-quality/fixtures/dup-glob/gates.yaml`
- Create: `/tmp/wt-codequality-gates/scripts/code-quality/fixtures/bad-gates/subsystems.yaml`
- Create: `/tmp/wt-codequality-gates/scripts/code-quality/fixtures/bad-gates/gates.yaml`
- Create: `/tmp/wt-codequality-gates/scripts/code-quality/validate.test.mjs`
- Create: `/tmp/wt-codequality-gates/scripts/code-quality/validate.mjs`

- [x] **5.1 — Write the three fixture configs**

Create `scripts/code-quality/fixtures/bad-owner/subsystems.yaml`:

```yaml
- id: bogus
  name: Bogus
  paths: ["website/**"]
  owner_agent: bachelorprojekt-bogus
  test_location: website/
  purpose: invalid owner test.
```

Create `scripts/code-quality/fixtures/bad-owner/gates.yaml`:

```yaml
scan:
  code_roots: [website]
  ignore_globs: []
s1: { limits: { .ts: 600 }, ignore: [] }
s2: { graphs: [{ id: website, tsconfig: website/tsconfig.json }] }
s3: { scope_dirs: [website/src/], allowlist_files: [] }
s4: { manifest_globs: ["k3d/*.yaml"], script_globs: ["scripts/*.sh"], reference_sources: ["Taskfile*.yml"], allowlist_globs: [] }
```

Create `scripts/code-quality/fixtures/dup-glob/subsystems.yaml`:

```yaml
- id: a
  name: A
  paths: ["website/**"]
  owner_agent: bachelorprojekt-website
  test_location: website/
  purpose: dup test a.
- id: b
  name: B
  paths: ["website/**"]
  owner_agent: bachelorprojekt-infra
  test_location: website/
  purpose: dup test b.
```

Create `scripts/code-quality/fixtures/dup-glob/gates.yaml` — identical content to the `bad-owner/gates.yaml` above:

```yaml
scan:
  code_roots: [website]
  ignore_globs: []
s1: { limits: { .ts: 600 }, ignore: [] }
s2: { graphs: [{ id: website, tsconfig: website/tsconfig.json }] }
s3: { scope_dirs: [website/src/], allowlist_files: [] }
s4: { manifest_globs: ["k3d/*.yaml"], script_globs: ["scripts/*.sh"], reference_sources: ["Taskfile*.yml"], allowlist_globs: [] }
```

Create `scripts/code-quality/fixtures/bad-gates/subsystems.yaml` — a **valid** registry (so the failure can only come from gates.yaml shape, not from the registry rules):

```yaml
- id: website
  name: Astro + Svelte website
  paths: ["website/**"]
  owner_agent: bachelorprojekt-website
  test_location: website/test/
  purpose: valid registry for the bad-gates shape test.
```

Create `scripts/code-quality/fixtures/bad-gates/gates.yaml` — well-formed everywhere **except** that its single `s2.graphs` entry is missing the required string `tsconfig` (a downstream-consumed key). This must fail the new fail-closed Finding-4 assertion:

```yaml
scan:
  code_roots: [website]
  ignore_globs: []
s1: { limits: { .ts: 600 }, ignore: [] }
s2: { graphs: [{ id: website }] }
s3: { scope_dirs: [website/src/], allowlist_files: [] }
s4: { manifest_globs: ["k3d/*.yaml"], script_globs: ["scripts/*.sh"], reference_sources: ["Taskfile*.yml"], allowlist_globs: [] }
```

- [x] **5.2 — Write the failing test**

Create `scripts/code-quality/validate.test.mjs`:

```js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { validateRegistry } from './validate.mjs';

const here = join(fileURLToPath(import.meta.url), '..');
const repoRoot = join(here, '..', '..');
const realCfg = join(repoRoot, 'docs', 'code-quality');
const fx = (name) => join(here, 'fixtures', name);

test('real registry is valid', () => {
  const res = validateRegistry(realCfg, repoRoot);
  assert.equal(res.ok, true, JSON.stringify(res.errors));
});

test('rejects an owner outside the six routing agents', () => {
  const res = validateRegistry(fx('bad-owner'), repoRoot);
  assert.equal(res.ok, false);
  assert.ok(res.errors.some((e) => /owner_agent/.test(e) && /bogus/.test(e)));
});

test('rejects an identical duplicate path glob', () => {
  const res = validateRegistry(fx('dup-glob'), repoRoot);
  assert.equal(res.ok, false);
  assert.ok(res.errors.some((e) => /duplicate path glob/.test(e)));
});

test('fails closed when a gates.yaml key consumed downstream is missing (Finding-4)', () => {
  // bad-gates has a valid registry but an s2.graphs entry without `tsconfig`.
  const res = validateRegistry(fx('bad-gates'), repoRoot);
  assert.equal(res.ok, false);
  assert.ok(res.errors.some((e) => /s2\.graphs/.test(e) && /tsconfig/.test(e)));
});
```

- [x] **5.3 — Run the test, expect FAIL (validate.mjs missing)**

```bash
cd /tmp/wt-codequality-gates
node --test scripts/code-quality/validate.test.mjs
```

Expected: FAIL — `Cannot find module '.../validate.mjs'`.

- [x] **5.4 — Write `validate.mjs`**

Create `scripts/code-quality/validate.mjs`:

```js
// scripts/code-quality/validate.mjs
// Fail-closed validation of subsystems.yaml + gates.yaml.
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadSubsystems, loadGates } from './load.mjs';
import { trackedFiles } from './scan.mjs';
import { matchGlob } from './glob.mjs';

export const ROUTING_AGENTS = new Set([
  'bachelorprojekt-website',
  'bachelorprojekt-infra',
  'bachelorprojekt-test',
  'bachelorprojekt-db',
  'bachelorprojekt-ops',
  'bachelorprojekt-security',
]);

/** Validate the registry+gates at cfgDir against the tracked tree at repoRoot. */
export function validateRegistry(cfgDir, repoRoot) {
  const errors = [];
  const req = (cond, msg) => { if (!cond) errors.push(msg); };

  const subs = loadSubsystems(cfgDir);
  const gates = loadGates(cfgDir);
  const tracked = trackedFiles(repoRoot);

  req(subs.length > 0, 'subsystems.yaml is empty');

  const seenGlobs = new Map(); // glob string -> first owner id
  for (const s of subs) {
    for (const k of ['id', 'name', 'owner_agent', 'test_location', 'purpose'])
      req(s?.[k], `subsystem[${s?.id}]: missing '${k}'`);
    req(Array.isArray(s?.paths) && s.paths.length > 0,
      `subsystem[${s?.id}]: 'paths' must be a non-empty array`);
    req(ROUTING_AGENTS.has(s?.owner_agent),
      `subsystem[${s?.id}]: owner_agent '${s?.owner_agent}' not one of the six routing agents`);
    for (const g of s?.paths ?? []) {
      if (seenGlobs.has(g))
        errors.push(`subsystem[${s?.id}]: duplicate path glob '${g}' (also in '${seenGlobs.get(g)}')`);
      else seenGlobs.set(g, s?.id);
      req(tracked.some((f) => matchGlob(f, g)),
        `subsystem[${s?.id}]: path glob '${g}' matches no tracked file`);
    }
  }

  // gates.yaml shape — fail closed on every key consumed downstream so a
  // malformed config cannot pass validate and misbehave in a later gate.
  req(Array.isArray(gates?.scan?.code_roots) && gates.scan.code_roots.length > 0,
    'gates.yaml: scan.code_roots must be a non-empty array');
  req(Array.isArray(gates?.scan?.ignore_globs),
    'gates.yaml: scan.ignore_globs must be an array');
  req(gates?.s1?.limits && typeof gates.s1.limits === 'object',
    'gates.yaml: s1.limits must be an object');
  // S1: every limit value must be a number (Task 7 compares lines > limit).
  if (gates?.s1?.limits && typeof gates.s1.limits === 'object') {
    for (const [ext, lim] of Object.entries(gates.s1.limits))
      req(typeof lim === 'number',
        `gates.yaml: s1.limits['${ext}'] must be a number`);
  }
  req(Array.isArray(gates?.s2?.graphs) && gates.s2.graphs.length > 0,
    'gates.yaml: s2.graphs must be a non-empty array');
  // S2: every graph entry must carry a string id and a string tsconfig (Task 8).
  for (const g of gates?.s2?.graphs ?? []) {
    req(typeof g?.id === 'string' && g.id.length > 0,
      `gates.yaml: s2.graphs entry missing string 'id' (got ${JSON.stringify(g?.id)})`);
    req(typeof g?.tsconfig === 'string' && g.tsconfig.length > 0,
      `gates.yaml: s2.graphs[${g?.id}] missing string 'tsconfig'`);
  }
  req(Array.isArray(gates?.s3?.scope_dirs) && gates.s3.scope_dirs.length > 0,
    'gates.yaml: s3.scope_dirs must be a non-empty array');
  req(Array.isArray(gates?.s3?.allowlist_files),
    'gates.yaml: s3.allowlist_files must be an array');
  req(Array.isArray(gates?.s4?.manifest_globs),
    'gates.yaml: s4.manifest_globs must be an array');
  req(Array.isArray(gates?.s4?.script_globs),
    'gates.yaml: s4.script_globs must be an array');
  req(Array.isArray(gates?.s4?.reference_sources) && gates.s4.reference_sources.length > 0,
    'gates.yaml: s4.reference_sources must be a non-empty array');
  req(Array.isArray(gates?.s4?.allowlist_globs),
    'gates.yaml: s4.allowlist_globs must be an array');

  return { ok: errors.length === 0, errors };
}

// CLI: validate the real registry, exit non-zero on failure.
const __filename = fileURLToPath(import.meta.url);
if (process.argv[1] === __filename) {
  const repoRoot = join(dirname(__filename), '..', '..');
  const cfgDir = join(repoRoot, 'docs', 'code-quality');
  const res = validateRegistry(cfgDir, repoRoot);
  if (!res.ok) { for (const e of res.errors) console.error('✗', e); process.exit(1); }
  console.log('✓ code-quality registry valid');
}
```

- [x] **5.5 — Run the test, expect PASS**

```bash
cd /tmp/wt-codequality-gates
node --test scripts/code-quality/validate.test.mjs
```

Expected: `# pass 4`, `# fail 0`. (The `real registry is valid` case proves the Task-3 config is well-formed; the `fails closed ... (Finding-4)` case proves a malformed gates.yaml is rejected.)

- [x] **5.6 — Commit**

```bash
cd /tmp/wt-codequality-gates
git add scripts/code-quality/validate.mjs scripts/code-quality/validate.test.mjs scripts/code-quality/fixtures/bad-owner scripts/code-quality/fixtures/dup-glob scripts/code-quality/fixtures/bad-gates
git commit -m "feat(code-quality): fail-closed registry validation (validate.mjs)

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

### Task 6: `emit-index.mjs` — C4 cross-check + deterministic repo-index.json

The index is `{ generated_by, subsystems: [{id, name, owner_agent, file_count, files:[...]}] }`. **No timestamp.** Files within a subsystem are sorted; subsystems are in registry order. The C4 cross-check throws if any scan-universe file is owned by 0 subsystems (orphan) — multi-owner is impossible because `ownerOf` returns the first match, so the only failure mode is an orphan.

> **Ordering note (Finding-1 fix):** This task builds and tests the `emit-index.mjs` **generator** but does **not** emit or commit the real `docs/code-quality/repo-index.json` yet. Tasks 7–13 add ~16 more tracked source files under `scripts/code-quality/**` (`gates/*.mjs`, `*.test.mjs`, `check.mjs`, `freeze.mjs`) — those are real `scripts-infra` files that enter the scan-universe (unlike the Task 9–10 fixtures, which are ignored via `scripts/code-quality/fixtures/**`). So a `repo-index.json` committed here would go stale the moment Task 7 lands, breaking the Task 12.4 / CI Task 13.1 drift guard. The real index is generated and committed **once, at the end**, in Task 13b (after every code-quality source file exists). Here we only prove the generator is deterministic, throws on C4 orphans, and does not throw over real HEAD.

**Files:**
- Create: `/tmp/wt-codequality-gates/scripts/code-quality/emit-index.test.mjs`
- Create: `/tmp/wt-codequality-gates/scripts/code-quality/emit-index.mjs`
- (the real `docs/code-quality/repo-index.json` is generated + committed later, in Task 13b)

- [x] **6.1 — Write the failing test**

Create `scripts/code-quality/emit-index.test.mjs`:

```js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildIndex } from './emit-index.mjs';
import { loadSubsystems, loadGates } from './load.mjs';

const repoRoot = join(fileURLToPath(import.meta.url), '..', '..', '..');
const cfgDir = join(repoRoot, 'docs', 'code-quality');

test('buildIndex does not throw over real HEAD (C4: full coverage)', () => {
  const subs = loadSubsystems(cfgDir);
  const gates = loadGates(cfgDir);
  assert.doesNotThrow(() => buildIndex(repoRoot, subs, gates));
});

test('buildIndex is byte-deterministic and has no timestamp', () => {
  const subs = loadSubsystems(cfgDir);
  const gates = loadGates(cfgDir);
  const a = JSON.stringify(buildIndex(repoRoot, subs, gates));
  const b = JSON.stringify(buildIndex(repoRoot, subs, gates));
  assert.equal(a, b);
  assert.ok(!/\d{4}-\d{2}-\d{2}T/.test(a), 'index must not contain an ISO timestamp');
  assert.ok(!/generated_at/.test(a), 'index must not contain generated_at');
});

test('buildIndex throws on an orphan file (no owning subsystem)', () => {
  // a registry with a hole: only owns website/**, but scan-universe has more.
  const holed = [{
    id: 'only-web', name: 'x', paths: ['website/**'],
    owner_agent: 'bachelorprojekt-website', test_location: 'website/', purpose: 'x',
  }];
  const gates = loadGates(cfgDir);
  assert.throws(() => buildIndex(repoRoot, holed, gates), /orphan/i);
});
```

- [x] **6.2 — Run the test, expect FAIL (emit-index.mjs missing)**

```bash
cd /tmp/wt-codequality-gates
node --test scripts/code-quality/emit-index.test.mjs
```

Expected: FAIL — `Cannot find module '.../emit-index.mjs'`.

- [x] **6.3 — Write `emit-index.mjs`**

Create `scripts/code-quality/emit-index.mjs`:

```js
// scripts/code-quality/emit-index.mjs
// Scans the scan-universe, enforces C4 (every file owned by exactly one
// subsystem), and writes a byte-deterministic repo-index.json (NO timestamp).
import { writeFileSync, mkdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadSubsystems, loadGates } from './load.mjs';
import { scanUniverse, ownerOf } from './scan.mjs';

/**
 * Build the index object. Throws on the first orphan (file under the
 * scan-universe with no owning subsystem) — that is the C4 enforcement.
 */
export function buildIndex(repoRoot, subsystems, gates) {
  const files = scanUniverse(repoRoot, gates);
  const buckets = new Map(subsystems.map((s) => [s.id, []]));
  for (const f of files) {
    const owner = ownerOf(f, subsystems);
    if (!owner) throw new Error(`C4 orphan: '${f}' is owned by no subsystem`);
    buckets.get(owner.id).push(f);
  }
  return {
    generated_by: 'scripts/code-quality/emit-index.mjs',
    subsystems: subsystems.map((s) => ({
      id: s.id,
      name: s.name,
      owner_agent: s.owner_agent,
      file_count: buckets.get(s.id).length,
      files: buckets.get(s.id).slice().sort(),
    })),
  };
}

/** Serialize deterministically (2-space, trailing newline) and write to outPath. */
export function writeIndex(outPath, index) {
  mkdirSync(dirname(outPath), { recursive: true });
  writeFileSync(outPath, JSON.stringify(index, null, 2) + '\n', 'utf8');
}

// CLI: validate-first, then emit to docs/code-quality/repo-index.json.
const __filename = fileURLToPath(import.meta.url);
if (process.argv[1] === __filename) {
  const repoRoot = join(dirname(__filename), '..', '..');
  const cfgDir = join(repoRoot, 'docs', 'code-quality');
  const { validateRegistry } = await import('./validate.mjs');
  const v = validateRegistry(cfgDir, repoRoot);
  if (!v.ok) { for (const e of v.errors) console.error('✗', e); process.exit(1); }
  try {
    const index = buildIndex(repoRoot, loadSubsystems(cfgDir), loadGates(cfgDir));
    writeIndex(join(cfgDir, 'repo-index.json'), index);
    console.log(`✓ wrote docs/code-quality/repo-index.json (${index.subsystems.reduce((n, s) => n + s.file_count, 0)} files)`);
  } catch (err) {
    console.error('✗', err.message);
    process.exit(1);
  }
}
```

- [x] **6.4 — Run the test, expect PASS**

```bash
cd /tmp/wt-codequality-gates
node --test scripts/code-quality/emit-index.test.mjs
```

Expected: `# pass 3`, `# fail 0`.

- [x] **6.5 — Verify determinism over real HEAD (to a throwaway path — do NOT commit yet)**

The C4-throw and does-not-throw-over-HEAD cases are already proven by the unit test (6.1/6.4). Here, sanity-check byte-determinism by emitting to a temp file **twice** and diffing — without writing to the committed `docs/code-quality/repo-index.json`, which is generated only in Task 13b once all source files exist (Finding-1 fix).

```bash
cd /tmp/wt-codequality-gates
node -e "import('./scripts/code-quality/emit-index.mjs').then(async (m)=>{const {loadSubsystems,loadGates}=await import('./scripts/code-quality/load.mjs');const cfg='docs/code-quality';const a=m.buildIndex(process.cwd(),loadSubsystems(cfg),loadGates(cfg));const b=m.buildIndex(process.cwd(),loadSubsystems(cfg),loadGates(cfg));const fs=await import('node:fs');const A=JSON.stringify(a,null,2),B=JSON.stringify(b,null,2);console.log('determinism:',A===B?'OK':'DRIFT','| total files:',a.subsystems.reduce((n,s)=>n+s.file_count,0));})"
```

Expected: `determinism: OK | total files: <N>` with `N > 1000` and no error. **Do not create or `git add docs/code-quality/repo-index.json` in this task** — committing it here would go stale as soon as Task 7 adds new `scripts/code-quality/**` source files.

- [x] **6.6 — Confirm no repo-index.json is staged**

```bash
cd /tmp/wt-codequality-gates
test ! -f docs/code-quality/repo-index.json && echo "INDEX DEFERRED OK (none committed yet)"
git status --porcelain docs/code-quality/repo-index.json   # → empty
```

Expected: `INDEX DEFERRED OK (none committed yet)` and an empty `git status` line for that path.

- [x] **6.7 — Commit (generator + test only — NO repo-index.json)**

```bash
cd /tmp/wt-codequality-gates
git add scripts/code-quality/emit-index.mjs scripts/code-quality/emit-index.test.mjs
git commit -m "feat(code-quality): deterministic repo-index emit + C4 cross-check

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

### Task 7: Gate S1 — file size

Contract: `{ gate:'S1', status, violations:[{ key:'S1:<path>', path, metric:<lines>, detail }] }`. A file violates if `lineCount > limits[ext]` and it is not in `s1.ignore` and not under `scan.ignore_globs`. Only files in the scan-universe are considered. `metric` = line count.

**Files:**
- Create: `/tmp/wt-codequality-gates/scripts/code-quality/gates/s1-filesize.test.mjs`
- Create: `/tmp/wt-codequality-gates/scripts/code-quality/gates/s1-filesize.mjs`

- [x] **7.1 — Write the failing test**

Create `scripts/code-quality/gates/s1-filesize.test.mjs`:

```js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { lineCount, evalFile, runS1 } from './s1-filesize.mjs';
import { loadGates } from '../load.mjs';

const repoRoot = join(fileURLToPath(import.meta.url), '..', '..', '..', '..');
const cfgDir = join(repoRoot, 'docs', 'code-quality');

test('lineCount counts newlines + a final partial line', () => {
  assert.equal(lineCount('a\nb\nc'), 3);
  assert.equal(lineCount('a\nb\n'), 2);
  assert.equal(lineCount(''), 0);
});

test('evalFile flags an over-limit file and shapes a violation', () => {
  const limits = { '.ts': 100 };
  const v = evalFile('website/src/big.ts', 150, limits, []);
  assert.deepEqual(v, {
    key: 'S1:website/src/big.ts',
    path: 'website/src/big.ts',
    metric: 150,
    detail: '150 lines > 100 limit (.ts)',
  });
});

test('evalFile returns null for an under-limit file', () => {
  assert.equal(evalFile('website/src/ok.ts', 80, { '.ts': 100 }, []), null);
});

test('evalFile returns null for an ignored file', () => {
  assert.equal(evalFile('seed.ts', 9999, { '.ts': 100 }, ['seed.ts']), null);
});

test('evalFile returns null for an extension with no limit', () => {
  assert.equal(evalFile('a.md', 9999, { '.ts': 100 }, []), null);
});

test('runS1 over the real repo returns the documented contract shape', () => {
  const res = runS1(repoRoot, loadGates(cfgDir));
  assert.equal(res.gate, 'S1');
  assert.ok(['pass', 'fail'].includes(res.status));
  for (const v of res.violations) {
    assert.ok(v.key.startsWith('S1:'));
    assert.equal(typeof v.metric, 'number');
    assert.equal(v.key, `S1:${v.path}`);
  }
  // the known over-limit DB file is present; the ignored seed file is not.
  const keys = new Set(res.violations.map((v) => v.key));
  assert.ok(keys.has('S1:website/src/lib/website-db.ts'));
  assert.ok(!keys.has('S1:website/src/lib/system-test-seed-data.ts'));
});
```

- [x] **7.2 — Run the test, expect FAIL (s1-filesize.mjs missing)**

```bash
cd /tmp/wt-codequality-gates
node --test scripts/code-quality/gates/s1-filesize.test.mjs
```

Expected: FAIL — `Cannot find module '.../s1-filesize.mjs'`.

- [x] **7.3 — Write `s1-filesize.mjs`**

Create `scripts/code-quality/gates/s1-filesize.mjs`:

```js
// scripts/code-quality/gates/s1-filesize.mjs
// S1: tracked files over a per-extension line limit. key=S1:<path>, metric=lines.
import { readFileSync } from 'node:fs';
import { join, extname } from 'node:path';
import { scanUniverse } from '../scan.mjs';
import { matchGlob } from '../glob.mjs';

/** Number of lines: newline count, plus one if the last line has no newline. */
export function lineCount(text) {
  if (text.length === 0) return 0;
  let n = 0;
  for (let i = 0; i < text.length; i++) if (text[i] === '\n') n++;
  if (text[text.length - 1] !== '\n') n++;
  return n;
}

/** Build a violation for `file` (lines/limits/ignore), or null if it passes. */
export function evalFile(file, lines, limits, ignore) {
  if (ignore.some((g) => matchGlob(file, g))) return null;
  const ext = extname(file);
  const limit = limits[ext];
  if (limit === undefined) return null;
  if (lines <= limit) return null;
  return {
    key: `S1:${file}`,
    path: file,
    metric: lines,
    detail: `${lines} lines > ${limit} limit (${ext})`,
  };
}

/** Run S1 over the scan-universe. Returns the gate contract object. */
export function runS1(repoRoot, gates) {
  const limits = gates?.s1?.limits ?? {};
  const ignore = gates?.s1?.ignore ?? [];
  const violations = [];
  for (const file of scanUniverse(repoRoot, gates)) {
    if (extname(file) in limits === false) continue;
    let text;
    try { text = readFileSync(join(repoRoot, file), 'utf8'); } catch { continue; }
    const v = evalFile(file, lineCount(text), limits, ignore);
    if (v) violations.push(v);
  }
  violations.sort((a, b) => a.key.localeCompare(b.key));
  return { gate: 'S1', status: violations.length ? 'fail' : 'pass', violations };
}
```

- [x] **7.4 — Run the test, expect PASS**

```bash
cd /tmp/wt-codequality-gates
node --test scripts/code-quality/gates/s1-filesize.test.mjs
```

Expected: `# pass 6`, `# fail 0`.

- [x] **7.5 — Sanity: inspect the S1 violation count**

```bash
cd /tmp/wt-codequality-gates
node -e "import('./scripts/code-quality/gates/s1-filesize.mjs').then(async m=>{const {loadGates}=await import('./scripts/code-quality/load.mjs');const r=m.runS1(process.cwd(),loadGates('docs/code-quality'));console.log('S1 violations:',r.violations.length);})"
```

Expected: a small finite number around `37` (exact value frozen into baseline in Task 11).

- [x] **7.6 — Commit**

```bash
cd /tmp/wt-codequality-gates
git add scripts/code-quality/gates/s1-filesize.mjs scripts/code-quality/gates/s1-filesize.test.mjs
git commit -m "feat(code-quality): S1 file-size gate

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

### Task 8: Gate S2 — import cycles (madge)

Contract: `{ gate:'S2', status, violations:[{ key:'S2:<graph>:<canon>', path, metric:<members>, detail }] }`. For each graph, run `madge --circular --json --extensions ts,tsx .` **with madge's `cwd` set to the scanned dir** (`join(repoRoot, dirname(tsconfig))`) and passing `.` as the scan target — this forces madge to emit **graph-relative** member paths (e.g. `lib/a.ts`), never repo-rooted or machine-absolute ones, so the key is identical on the freeze machine and the CI runner. `canon` = the cycle's member set sorted lexicographically and joined with `|`. This is order- and rotation-invariant because a sorted array is already its own lexicographically smallest rotation, so there is **no** explicit rotation step (and no need for one). A structurally different cycle — one whose membership changed (gained or lost a member) — is **intentionally a new key**, so it surfaces as a NEW violation (blocking), not a worsened metric of the old key. S2's numeric `metric` (member count) is carried only for contract uniformity with S1 and for human triage: because a membership change already changes the key, S2 never actually triggers the metric-worsening branch of the ratchet. `path` = the graph's source dir (for human context). If a graph has no cycles, it contributes nothing. If madge errors (e.g. tsconfig missing), the graph contributes nothing and a warning is printed to stderr — the gate never crashes the pipeline.

> **Why cwd-relative is load-bearing (Finding-2 fix):** `baseline.json` is frozen **locally** (Task 11.6) and committed; CI runs `task quality:check` against that committed baseline (Task 13) and does **not** re-freeze. If madge emitted absolute or repo-rooted member paths, the `S2:<graph>:<canon>` key would embed a machine-specific prefix, so every baselined cycle would read as a NEW key on the CI runner → CI red. Running madge with `cwd` at the scanned dir and target `.` makes member paths machine-independent. The test below pins this (no canon member starts with `/` or contains `repoRoot`), and Task 11.7b asserts a re-freeze is byte-identical.

**Files:**
- Create: `/tmp/wt-codequality-gates/scripts/code-quality/gates/s2-cycles.test.mjs`
- Create: `/tmp/wt-codequality-gates/scripts/code-quality/gates/s2-cycles.mjs`

- [x] **8.1 — Write the failing test** (pure-function tests; madge invocation is exercised separately)

Create `scripts/code-quality/gates/s2-cycles.test.mjs`:

```js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { canonCycle, cyclesToViolations, runS2 } from './s2-cycles.mjs';
import { loadGates } from '../load.mjs';

const repoRoot = join(fileURLToPath(import.meta.url), '..', '..', '..', '..');
const cfgDir = join(repoRoot, 'docs', 'code-quality');

test('canonCycle is rotation- and order-invariant', () => {
  const a = canonCycle(['b.ts', 'c.ts', 'a.ts']);
  const b = canonCycle(['c.ts', 'a.ts', 'b.ts']);
  const c = canonCycle(['a.ts', 'b.ts', 'c.ts']);
  assert.equal(a, b);
  assert.equal(b, c);
  assert.equal(a, 'a.ts|b.ts|c.ts');
});

test('cyclesToviolations shapes keys and metrics per graph', () => {
  const vs = cyclesToViolations('website', 'website/src', [
    ['b.ts', 'a.ts'],
    ['x.ts', 'y.ts', 'z.ts'],
  ]);
  assert.deepEqual(vs.map((v) => v.key), [
    'S2:website:a.ts|b.ts',
    'S2:website:x.ts|y.ts|z.ts',
  ]);
  assert.deepEqual(vs.map((v) => v.metric), [2, 3]);
  assert.equal(vs[0].path, 'website/src');
});

test('runS2 returns the documented contract shape and never throws', () => {
  const res = runS2(repoRoot, loadGates(cfgDir));
  assert.equal(res.gate, 'S2');
  assert.ok(['pass', 'fail'].includes(res.status));
  for (const v of res.violations) {
    assert.ok(v.key.startsWith('S2:'));
    assert.equal(typeof v.metric, 'number');
  }
});

test('S2 keys are machine-independent: no canon member is absolute or contains repoRoot', () => {
  // Finding-2 guard: freeze-machine and CI-runner must produce identical keys.
  const res = runS2(repoRoot, loadGates(cfgDir));
  for (const v of res.violations) {
    // key shape is S2:<graph>:<a|b|c> — split off the canon and check each member.
    const canon = v.key.slice(v.key.indexOf(':', 3) + 1);
    for (const member of canon.split('|')) {
      assert.ok(!member.startsWith('/'),
        `S2 canon member must be graph-relative, got absolute: ${member}`);
      assert.ok(!member.includes(repoRoot),
        `S2 canon member must not embed repoRoot: ${member}`);
    }
  }
});
```

- [x] **8.2 — Run the test, expect FAIL (s2-cycles.mjs missing)**

```bash
cd /tmp/wt-codequality-gates
node --test scripts/code-quality/gates/s2-cycles.test.mjs
```

Expected: FAIL — `Cannot find module '.../s2-cycles.mjs'`.

- [x] **8.3 — Write `s2-cycles.mjs`**

Create `scripts/code-quality/gates/s2-cycles.mjs`:

```js
// scripts/code-quality/gates/s2-cycles.mjs
// S2: import cycles per TS graph via `madge --circular --json`.
// key=S2:<graph>:<canon>, metric=cycle member count.
import { execFileSync } from 'node:child_process';
import { join, dirname } from 'node:path';

/** Canonical key for a cycle: its member set sorted lexicographically, joined
 *  by '|'. A sorted array is already its own lexicographically smallest
 *  rotation, so this is order- and rotation-invariant with no explicit rotation
 *  step. A cycle whose membership changes (gains/loses a member) yields a new
 *  sorted join → a NEW key (intentional: it surfaces as a new violation, not a
 *  worsened metric). Members MUST be graph-relative (madge is run with cwd at
 *  the scanned dir) so the key is identical on the freeze machine and the CI
 *  runner (Finding-2 fix). */
export function canonCycle(members) {
  const sorted = members.slice().sort();
  return sorted.join('|');
}

/** Map madge cycle arrays for one graph to gate violations. */
export function cyclesToViolations(graphId, graphPath, cycles) {
  return cycles.map((members) => {
    const canon = canonCycle(members);
    return {
      key: `S2:${graphId}:${canon}`,
      path: graphPath,
      metric: members.length,
      detail: `cycle in ${graphId}: ${members.join(' → ')}`,
    };
  });
}

/** Run madge for one graph; returns an array of cycle member-arrays (or []).
 *  madge is run with cwd at the scanned dir and target '.', so the member
 *  paths it reports are GRAPH-RELATIVE (e.g. 'lib/a.ts'), never absolute or
 *  repo-rooted. That keeps the S2 key machine-independent between the freeze
 *  machine and the CI runner (Finding-2 fix). */
function madgeCycles(repoRoot, tsconfig) {
  const dir = join(repoRoot, dirname(tsconfig));
  try {
    const out = execFileSync(
      join(repoRoot, 'node_modules', '.bin', 'madge'),
      ['--circular', '--json', '--extensions', 'ts,tsx', '.'],
      { cwd: dir, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] },
    );
    const parsed = JSON.parse(out || '[]');
    return Array.isArray(parsed) ? parsed : [];
  } catch (err) {
    // madge exits non-zero WHEN it finds cycles — its JSON is still on stdout.
    if (err && typeof err.stdout === 'string' && err.stdout.trim()) {
      try {
        const parsed = JSON.parse(err.stdout);
        return Array.isArray(parsed) ? parsed : [];
      } catch { /* fall through */ }
    }
    process.stderr.write(`S2: madge failed for ${tsconfig} (skipping): ${err?.message}\n`);
    return [];
  }
}

/** Run S2 across all configured graphs. Never throws. */
export function runS2(repoRoot, gates) {
  const graphs = gates?.s2?.graphs ?? [];
  const violations = [];
  for (const g of graphs) {
    const cycles = madgeCycles(repoRoot, g.tsconfig);
    violations.push(...cyclesToViolations(g.id, dirname(g.tsconfig), cycles));
  }
  violations.sort((a, b) => a.key.localeCompare(b.key));
  return { gate: 'S2', status: violations.length ? 'fail' : 'pass', violations };
}
```

> **Note on madge exit codes:** `madge --circular` exits non-zero when cycles exist; the cycle JSON is still emitted on stdout, which the `catch` block recovers. With `--json`, madge prints `[]` and exits 0 when there are none.

- [x] **8.4 — Run the unit test, expect PASS**

```bash
cd /tmp/wt-codequality-gates
node --test scripts/code-quality/gates/s2-cycles.test.mjs
```

Expected: `# pass 4`, `# fail 0`. (If the repo has zero cycles today, the machine-independence test passes vacuously — it asserts over whatever cycles exist; the freeze↔check byte-identity proof in Task 11.7b is the cross-run guard.)

- [x] **8.5 — Smoke-run madge end-to-end on the smallest graph**

```bash
cd /tmp/wt-codequality-gates
node -e "import('./scripts/code-quality/gates/s2-cycles.mjs').then(async m=>{const {loadGates}=await import('./scripts/code-quality/load.mjs');const r=m.runS2(process.cwd(),loadGates('docs/code-quality'));console.log('S2 status:',r.status,'cycles:',r.violations.length);r.violations.slice(0,5).forEach(v=>console.log(' ',v.key,'metric',v.metric));})"
```

Expected: prints `S2 status: ...` with a finite cycle count and no crash. (Whatever count appears is what the baseline will freeze in Task 11. If `0`, status is `pass`.)

- [x] **8.6 — Commit**

```bash
cd /tmp/wt-codequality-gates
git add scripts/code-quality/gates/s2-cycles.mjs scripts/code-quality/gates/s2-cycles.test.mjs
git commit -m "feat(code-quality): S2 import-cycle gate (madge per TS graph)

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

### Task 9: Gate S3 — hardcoded hostnames

Contract: `{ gate:'S3', status, violations:[{ key:'S3:<path>:<host>', path, metric:1, detail }] }`. Scan every tracked file under a `s3.scope_dirs` prefix (excluding `s3.allowlist_files` and any `*-content-built/` path and `*.md`). On each line, skip comment-only lines (first non-space char is `#` or `//`), then match `[a-z0-9-]+\.(mentolder|korczewski)\.de`. One violation per (file, distinct host). `metric` = 1.

**Files:**
- Create: `/tmp/wt-codequality-gates/scripts/code-quality/fixtures/s3/clean.yaml`
- Create: `/tmp/wt-codequality-gates/scripts/code-quality/fixtures/s3/dirty.yaml`
- Create: `/tmp/wt-codequality-gates/scripts/code-quality/gates/s3-hostnames.test.mjs`
- Create: `/tmp/wt-codequality-gates/scripts/code-quality/gates/s3-hostnames.mjs`

- [x] **9.1 — Write the fixtures**

Create `scripts/code-quality/fixtures/s3/clean.yaml`:

```yaml
# this comment mentions auth.mentolder.de but it is a comment, not a literal
host: "{{ .PROD_DOMAIN }}"
note: see auth.localhost for dev
```

Create `scripts/code-quality/fixtures/s3/dirty.yaml`:

```yaml
host: "files.mentolder.de"
extra: "web.korczewski.de"
# auth.mentolder.de here is commented and must NOT count
```

- [x] **9.2 — Write the failing test**

Create `scripts/code-quality/gates/s3-hostnames.test.mjs` — a single, ESM-pure test
file. The `read` helper uses `readFileSync` from `node:fs` (ESM `.mjs` has no
`require`); do **not** introduce `require` anywhere. The `runS3` contract test asserts
the S3 key↔detail coupling: each violation's `detail` embeds exactly the host that its
`key` encodes (`key = 'S3:' + path + ':' + host`, `detail = 'hardcoded host: ' + host`).

```js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { readFileSync } from 'node:fs';
import { hostsInText, runS3 } from './s3-hostnames.mjs';
import { loadGates } from '../load.mjs';

const here = join(fileURLToPath(import.meta.url), '..');
const repoRoot = join(here, '..', '..', '..');
const cfgDir = join(repoRoot, 'docs', 'code-quality');
const read = (p) => readFileSync(join(here, '..', 'fixtures', 's3', p), 'utf8');

test('hostsInText finds literal hosts and skips comment lines', () => {
  const hosts = hostsInText(read('dirty.yaml'));
  assert.deepEqual([...hosts].sort(), ['files.mentolder.de', 'web.korczewski.de']);
});

test('hostsInText returns empty for a clean file', () => {
  assert.deepEqual([...hostsInText(read('clean.yaml'))], []);
});

test('runS3 over real repo returns documented contract shape', () => {
  const res = runS3(repoRoot, loadGates(cfgDir));
  assert.equal(res.gate, 'S3');
  assert.ok(['pass', 'fail'].includes(res.status));
  for (const v of res.violations) {
    assert.ok(v.key.startsWith('S3:'));
    assert.equal(v.metric, 1);
    // key↔detail coupling: detail embeds exactly the host the key encodes.
    // key = `S3:${path}:${host}` so the host is the key suffix after `S3:<path>:`.
    assert.equal(v.detail, 'hardcoded host: ' + v.key.slice(('S3:' + v.path + ':').length));
  }
  // configmap-domains.yaml is allowlisted → never appears.
  assert.ok(!res.violations.some((v) => v.path === 'k3d/configmap-domains.yaml'));
});
```

- [x] **9.3 — Run the test, expect FAIL (s3-hostnames.mjs missing)**

```bash
cd /tmp/wt-codequality-gates
node --test scripts/code-quality/gates/s3-hostnames.test.mjs
```

Expected: FAIL — `Cannot find module '.../s3-hostnames.mjs'`.

- [x] **9.4 — Write `s3-hostnames.mjs`**

Create `scripts/code-quality/gates/s3-hostnames.mjs`:

```js
// scripts/code-quality/gates/s3-hostnames.mjs
// S3: hardcoded prod hostnames (string literal, not comment) in scoped dirs.
// key=S3:<path>:<host>, metric=1.
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { trackedFiles } from '../scan.mjs';
import { matchGlob } from '../glob.mjs';

const HOST_RE = /[a-z0-9-]+\.(?:mentolder|korczewski)\.de/g;

/** True iff the line is a comment-only line (# or //). */
function isCommentLine(line) {
  const t = line.trimStart();
  return t.startsWith('#') || t.startsWith('//');
}

/** Set of distinct hostnames in `text`, ignoring comment-only lines. */
export function hostsInText(text) {
  const hosts = new Set();
  for (const line of text.split('\n')) {
    if (isCommentLine(line)) continue;
    for (const m of line.matchAll(HOST_RE)) hosts.add(m[0]);
  }
  return hosts;
}

/** A file is in S3 scope if under a scope_dir, not allowlisted, not md/built. */
function inScope(file, scopeDirs, allowlist) {
  if (!scopeDirs.some((d) => file.startsWith(d))) return false;
  if (allowlist.includes(file)) return false;
  if (file.endsWith('.md')) return false;
  if (file.includes('-content-built/')) return false;
  return true;
}

/** Run S3 over the tracked tree. Returns the gate contract object. */
export function runS3(repoRoot, gates) {
  const scopeDirs = gates?.s3?.scope_dirs ?? [];
  const allowlist = gates?.s3?.allowlist_files ?? [];
  const violations = [];
  for (const file of trackedFiles(repoRoot)) {
    if (!inScope(file, scopeDirs, allowlist)) continue;
    let text;
    try { text = readFileSync(join(repoRoot, file), 'utf8'); } catch { continue; }
    for (const host of [...hostsInText(text)].sort()) {
      violations.push({
        key: `S3:${file}:${host}`,
        path: file,
        metric: 1,
        detail: `hardcoded host: ${host}`,
      });
    }
  }
  violations.sort((a, b) => a.key.localeCompare(b.key));
  return { gate: 'S3', status: violations.length ? 'fail' : 'pass', violations };
}
```

- [x] **9.5 — Run the test, expect PASS**

```bash
cd /tmp/wt-codequality-gates
node --test scripts/code-quality/gates/s3-hostnames.test.mjs
```

Expected: `# pass 3`, `# fail 0`.

- [x] **9.6 — Sanity: inspect S3 count**

```bash
cd /tmp/wt-codequality-gates
node -e "import('./scripts/code-quality/gates/s3-hostnames.mjs').then(async m=>{const {loadGates}=await import('./scripts/code-quality/load.mjs');const r=m.runS3(process.cwd(),loadGates('docs/code-quality'));console.log('S3 violations:',r.violations.length);})"
```

Expected: a finite count (tens), frozen in Task 11.

- [x] **9.7 — Commit**

```bash
cd /tmp/wt-codequality-gates
git add scripts/code-quality/gates/s3-hostnames.mjs scripts/code-quality/gates/s3-hostnames.test.mjs scripts/code-quality/fixtures/s3
git commit -m "feat(code-quality): S3 hardcoded-hostname gate

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

### Task 10: Gate S4 — orphan manifests/scripts

Contract: `{ gate:'S4', status, violations:[{ key:'S4:<path>', path, metric:1, detail }] }`. Candidate set = tracked files matching `s4.manifest_globs` ∪ `s4.script_globs`, minus `s4.allowlist_globs`. Reference corpus = the concatenated text of every tracked file matching `s4.reference_sources`. A candidate is an orphan if its **basename** does not appear (as a literal substring) anywhere in the reference corpus **other than inside the candidate file itself**. (The `scripts/**/*.sh` + `scripts/**/*.mjs` reference sources give transitive `source`/`bash` resolution: a helper sourced by another script is referenced.) `metric` = 1.

**Files:**
- Create: `/tmp/wt-codequality-gates/scripts/code-quality/fixtures/s4/referenced.sh`
- Create: `/tmp/wt-codequality-gates/scripts/code-quality/fixtures/s4/orphan.sh`
- Create: `/tmp/wt-codequality-gates/scripts/code-quality/fixtures/s4/Taskfile.fixture.yml`
- Create: `/tmp/wt-codequality-gates/scripts/code-quality/gates/s4-orphans.test.mjs`
- Create: `/tmp/wt-codequality-gates/scripts/code-quality/gates/s4-orphans.mjs`

- [x] **10.1 — Write the fixtures**

Create `scripts/code-quality/fixtures/s4/referenced.sh`:

```bash
#!/usr/bin/env bash
echo "I am referenced by the fixture Taskfile"
```

Create `scripts/code-quality/fixtures/s4/orphan.sh`:

```bash
#!/usr/bin/env bash
echo "nobody references me"
```

Create `scripts/code-quality/fixtures/s4/Taskfile.fixture.yml`:

```yaml
version: '3'
tasks:
  run:
    cmds:
      - bash scripts/code-quality/fixtures/s4/referenced.sh
```

- [x] **10.2 — Write the failing test**

Create `scripts/code-quality/gates/s4-orphans.test.mjs`:

```js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { findOrphans, runS4 } from './s4-orphans.mjs';
import { loadGates } from '../load.mjs';

const repoRoot = join(fileURLToPath(import.meta.url), '..', '..', '..', '..');
const cfgDir = join(repoRoot, 'docs', 'code-quality');

test('findOrphans flags a candidate whose basename is in no source', () => {
  const candidates = ['a/referenced.sh', 'a/orphan.sh'];
  const corpus = 'cmds:\n  - bash a/referenced.sh\n';
  const orphans = findOrphans(candidates, corpus);
  assert.deepEqual(orphans, ['a/orphan.sh']);
});

test('findOrphans is basename-based (path may differ in the reference)', () => {
  const candidates = ['scripts/foo.sh'];
  const corpus = 'source "${DIR}/foo.sh"';
  assert.deepEqual(findOrphans(candidates, corpus), []);
});

test('runS4 over real repo returns documented contract shape', () => {
  const res = runS4(repoRoot, loadGates(cfgDir));
  assert.equal(res.gate, 'S4');
  assert.ok(['pass', 'fail'].includes(res.status));
  for (const v of res.violations) {
    assert.ok(v.key.startsWith('S4:'));
    assert.equal(v.metric, 1);
    assert.equal(v.key, `S4:${v.path}`);
  }
  // allowlisted bootstrap manifests never appear:
  assert.ok(!res.violations.some((v) => v.path === 'k3d/sealed-secrets-controller.yaml'));
  assert.ok(!res.violations.some((v) => v.path.startsWith('k3d/office-stack/')));
});
```

- [x] **10.3 — Run the test, expect FAIL (s4-orphans.mjs missing)**

```bash
cd /tmp/wt-codequality-gates
node --test scripts/code-quality/gates/s4-orphans.test.mjs
```

Expected: FAIL — `Cannot find module '.../s4-orphans.mjs'`.

- [x] **10.4 — Write `s4-orphans.mjs`**

Create `scripts/code-quality/gates/s4-orphans.mjs`:

```js
// scripts/code-quality/gates/s4-orphans.mjs
// S4: manifests/scripts with no reference in the configured sources (incl.
// transitive script sources). key=S4:<path>, metric=1.
import { readFileSync } from 'node:fs';
import { join, basename } from 'node:path';
import { trackedFiles } from '../scan.mjs';
import { matchGlob } from '../glob.mjs';

/** Candidate basenames absent from `corpus` → returned as orphan paths. */
export function findOrphans(candidates, corpus) {
  const orphans = [];
  for (const c of candidates) {
    const base = basename(c);
    if (!corpus.includes(base)) orphans.push(c);
  }
  return orphans;
}

/** Concatenate the text of every source file, excluding the candidate itself. */
function corpusExcluding(repoRoot, sourceFiles, candidate) {
  const parts = [];
  for (const f of sourceFiles) {
    if (f === candidate) continue;
    try { parts.push(readFileSync(join(repoRoot, f), 'utf8')); } catch { /* skip */ }
  }
  return parts.join('\n');
}

/** Run S4 over the tracked tree. Returns the gate contract object. */
export function runS4(repoRoot, gates) {
  const s4 = gates?.s4 ?? {};
  const candGlobs = [...(s4.manifest_globs ?? []), ...(s4.script_globs ?? [])];
  const allow = s4.allowlist_globs ?? [];
  const srcGlobs = s4.reference_sources ?? [];
  const tracked = trackedFiles(repoRoot);

  const candidates = tracked.filter(
    (f) => candGlobs.some((g) => matchGlob(f, g)) && !allow.some((g) => matchGlob(f, g)),
  );
  const sourceFiles = tracked.filter((f) => srcGlobs.some((g) => matchGlob(f, g)));

  const violations = [];
  for (const c of candidates) {
    const corpus = corpusExcluding(repoRoot, sourceFiles, c);
    if (!corpus.includes(basename(c))) {
      violations.push({
        key: `S4:${c}`,
        path: c,
        metric: 1,
        detail: `no reference to '${basename(c)}' in any configured source`,
      });
    }
  }
  violations.sort((a, b) => a.key.localeCompare(b.key));
  return { gate: 'S4', status: violations.length ? 'fail' : 'pass', violations };
}
```

- [x] **10.5 — Run the test, expect PASS**

```bash
cd /tmp/wt-codequality-gates
node --test scripts/code-quality/gates/s4-orphans.test.mjs
```

Expected: `# pass 3`, `# fail 0`.

- [x] **10.6 — Sanity: inspect S4 orphans**

```bash
cd /tmp/wt-codequality-gates
node -e "import('./scripts/code-quality/gates/s4-orphans.mjs').then(async m=>{const {loadGates}=await import('./scripts/code-quality/load.mjs');const r=m.runS4(process.cwd(),loadGates('docs/code-quality'));console.log('S4 orphans:',r.violations.length);r.violations.forEach(v=>console.log(' ',v.path));})"
```

Expected: a small finite list (≈9 before allowlist; fewer after). All frozen in Task 11.

> **Note:** the S4 fixtures live under `scripts/code-quality/fixtures/s4/` which is in the `scripts-infra` subsystem and would normally be candidate `scripts/*.sh` matches — but the candidate globs are `scripts/*.sh` (top-level only, no `**`), so the fixtures (two levels deep) are **not** candidates and add nothing to the real-repo S4 result. They only feed the unit test's `findOrphans` pure-function checks.

- [x] **10.7 — Commit**

```bash
cd /tmp/wt-codequality-gates
git add scripts/code-quality/gates/s4-orphans.mjs scripts/code-quality/gates/s4-orphans.test.mjs scripts/code-quality/fixtures/s4
git commit -m "feat(code-quality): S4 orphan-manifest/script gate

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

### Task 11: `check.mjs` + `freeze.mjs` — aggregation, ratchet, baseline freeze

`aggregate(repoRoot, gates)` runs S1–S4 and returns `{ violations: [...all], byKey: Map }`. `blockingSet(current, baseline)` = `(current keys ∉ baseline) ∪ (keys in both with current.metric > baseline.metric)`. `check.mjs` CLI exits ≠0 iff the blocking set is non-empty. `freeze.mjs` writes every current violation into `baseline.json` with `frozen_at` = the git HEAD short SHA (deterministic — same SHA every run on the same commit).

**Files:**
- Create: `/tmp/wt-codequality-gates/scripts/code-quality/check.test.mjs`
- Create: `/tmp/wt-codequality-gates/scripts/code-quality/check.mjs`
- Create: `/tmp/wt-codequality-gates/scripts/code-quality/freeze.mjs`
- Create (generated): `/tmp/wt-codequality-gates/docs/code-quality/baseline.json`

- [x] **11.1 — Write the failing test** (pure ratchet logic)

Create `scripts/code-quality/check.test.mjs`:

```js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { blockingSet } from './check.mjs';

const baseline = {
  'S1:a.ts': { gate: 'S1', path: 'a.ts', metric: 612, detail: 'x', frozen_at: 'abc' },
  'S3:b.yaml:files.mentolder.de': { gate: 'S3', path: 'b.yaml', metric: 1, detail: 'x', frozen_at: 'abc' },
};

test('a brand-new violation is blocking', () => {
  const current = [
    { key: 'S1:a.ts', metric: 612 },
    { key: 'S1:new.ts', metric: 700 },
  ];
  const blk = blockingSet(current, baseline);
  assert.deepEqual(blk.map((v) => v.key), ['S1:new.ts']);
});

test('a known baseline violation at the same metric is NOT blocking', () => {
  const current = [{ key: 'S1:a.ts', metric: 612 }];
  assert.deepEqual(blockingSet(current, baseline), []);
});

test('a worsened known violation (metric up) is blocking', () => {
  const current = [{ key: 'S1:a.ts', metric: 650 }];
  assert.deepEqual(blockingSet(current, baseline).map((v) => v.key), ['S1:a.ts']);
});

test('an improved known violation (metric down) is NOT blocking', () => {
  const current = [{ key: 'S1:a.ts', metric: 500 }];
  assert.deepEqual(blockingSet(current, baseline), []);
});

test('a binary (metric=1) known violation cannot worsen', () => {
  const current = [{ key: 'S3:b.yaml:files.mentolder.de', metric: 1 }];
  assert.deepEqual(blockingSet(current, baseline), []);
});
```

- [x] **11.2 — Run the test, expect FAIL (check.mjs missing)**

```bash
cd /tmp/wt-codequality-gates
node --test scripts/code-quality/check.test.mjs
```

Expected: FAIL — `Cannot find module '.../check.mjs'`.

- [x] **11.3 — Write `check.mjs`**

Create `scripts/code-quality/check.mjs`:

```js
// scripts/code-quality/check.mjs
// Aggregate all gates, ratchet against baseline.json. Exit !=0 only on the
// CI-blocking set = (new) ∪ (worsened).
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadGates } from './load.mjs';
import { runS1 } from './gates/s1-filesize.mjs';
import { runS2 } from './gates/s2-cycles.mjs';
import { runS3 } from './gates/s3-hostnames.mjs';
import { runS4 } from './gates/s4-orphans.mjs';

/** Run every gate; returns the flat violation list. */
export function aggregate(repoRoot, gates) {
  return [
    runS1(repoRoot, gates),
    runS2(repoRoot, gates),
    runS3(repoRoot, gates),
    runS4(repoRoot, gates),
  ].flatMap((g) => g.violations);
}

/** CI-blocking set: new keys, plus known keys whose metric rose. */
export function blockingSet(current, baseline) {
  const out = [];
  for (const v of current) {
    const base = baseline[v.key];
    if (!base) { out.push(v); continue; }
    if (typeof v.metric === 'number' && typeof base.metric === 'number'
        && v.metric > base.metric) out.push(v);
  }
  return out;
}

// CLI: load baseline, run gates, print + exit on the blocking set.
const __filename = fileURLToPath(import.meta.url);
if (process.argv[1] === __filename) {
  const repoRoot = join(dirname(__filename), '..', '..');
  const cfgDir = join(repoRoot, 'docs', 'code-quality');
  let baseline = {};
  try { baseline = JSON.parse(readFileSync(join(cfgDir, 'baseline.json'), 'utf8')); }
  catch { baseline = {}; }
  const current = aggregate(repoRoot, loadGates(cfgDir));
  const blocking = blockingSet(current, baseline);
  console.log(`quality:check — ${current.length} current violation(s), ${Object.keys(baseline).length} baselined, ${blocking.length} blocking`);
  if (blocking.length) {
    for (const v of blocking) {
      const base = baseline[v.key];
      const why = base ? `worsened ${base.metric}→${v.metric}` : 'NEW';
      console.error(`✗ ${why}: ${v.key} — ${v.detail}`);
    }
    process.exit(1);
  }
  console.log('✓ no new or worsened violations');
}
```

- [x] **11.4 — Run the test, expect PASS**

```bash
cd /tmp/wt-codequality-gates
node --test scripts/code-quality/check.test.mjs
```

Expected: `# pass 5`, `# fail 0`.

- [x] **11.5 — Write `freeze.mjs`**

Create `scripts/code-quality/freeze.mjs`:

```js
// scripts/code-quality/freeze.mjs
// Freeze the current violation set into baseline.json (one-time + on a Slice-B
// refresh later). frozen_at = git HEAD short SHA (deterministic per commit).
import { writeFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadGates } from './load.mjs';
import { aggregate } from './check.mjs';

/** Build the baseline map from the current violation list. */
export function freeze(repoRoot, gates, frozenAt) {
  const map = {};
  for (const v of aggregate(repoRoot, gates)) {
    map[v.key] = {
      gate: v.key.split(':')[0],
      path: v.path,
      metric: v.metric,
      detail: v.detail,
      frozen_at: frozenAt,
    };
  }
  // sort keys so the JSON is deterministic
  const sorted = {};
  for (const k of Object.keys(map).sort()) sorted[k] = map[k];
  return sorted;
}

// CLI: freeze against HEAD, write docs/code-quality/baseline.json.
const __filename = fileURLToPath(import.meta.url);
if (process.argv[1] === __filename) {
  const repoRoot = join(dirname(__filename), '..', '..');
  const cfgDir = join(repoRoot, 'docs', 'code-quality');
  const sha = execFileSync('git', ['rev-parse', '--short', 'HEAD'],
    { cwd: repoRoot, encoding: 'utf8' }).trim();
  const map = freeze(repoRoot, loadGates(cfgDir), sha);
  writeFileSync(join(cfgDir, 'baseline.json'), JSON.stringify(map, null, 2) + '\n', 'utf8');
  console.log(`✓ froze ${Object.keys(map).length} violation(s) into baseline.json @ ${sha}`);
}
```

- [x] **11.6 — Freeze the baseline**

```bash
cd /tmp/wt-codequality-gates
node scripts/code-quality/freeze.mjs
```

Expected: `✓ froze N violation(s) into baseline.json @ <sha>` where N is finite (≈37 S1 + S2 cycles + S3 hosts + S4 orphans).

- [x] **11.7 — Prove the ratchet is green against its own freeze (same run)**

```bash
cd /tmp/wt-codequality-gates
node scripts/code-quality/check.mjs; echo "exit=$?"
```

Expected: `✓ no new or worsened violations` and `exit=0`. **This is the slice's core acceptance gate** — if it is non-zero, a gate is non-deterministic between freeze and check; debug before continuing (use superpowers:systematic-debugging).

- [x] **11.7b — Prove the freeze is cross-run byte-identical (S2 key stability — Finding-2 fix)**

Task 11.7 only proves `check == green` within one run on one machine. CI freezes nothing — it ratchets the **committed** `baseline.json` against a fresh gate run on a different machine (Task 13). The only key that embeds external tool output is S2 (madge member paths). This step proves a re-freeze produces a **byte-identical** baseline, which is the same-machine proxy for "the committed baseline's S2 keys are reproducible from the source tree alone" (the madge-cwd-relative fix in Task 8 makes them machine-independent).

```bash
cd /tmp/wt-codequality-gates
cp docs/code-quality/baseline.json /tmp/cq-baseline-first.json
node scripts/code-quality/freeze.mjs
diff -u /tmp/cq-baseline-first.json docs/code-quality/baseline.json && echo "FREEZE STABLE"
# also assert no S2 key embeds an absolute path or repoRoot:
node -e "const b=require('./docs/code-quality/baseline.json');const bad=Object.keys(b).filter(k=>k.startsWith('S2:')).filter(k=>{const canon=k.slice(k.indexOf(':',3)+1);return canon.split('|').some(m=>m.startsWith('/')||m.includes(process.cwd()));});if(bad.length){console.error('✗ machine-specific S2 keys:',bad);process.exit(1);}console.log('S2 KEYS RELATIVE OK ('+Object.keys(b).filter(k=>k.startsWith('S2:')).length+' S2 keys)');"
```

Expected: `FREEZE STABLE` (re-freeze byte-identical) and `S2 KEYS RELATIVE OK (...)`. If `FREEZE STABLE` fails, a gate (almost certainly S2) is non-deterministic between runs — debug before committing, because CI will read every baselined key as NEW and go red. If the second assertion fails, the madge-cwd fix in Task 8 was not applied — member paths are leaking an absolute/machine prefix into the key.

- [x] **11.8 — Commit**

```bash
cd /tmp/wt-codequality-gates
git add scripts/code-quality/check.mjs scripts/code-quality/check.test.mjs scripts/code-quality/freeze.mjs docs/code-quality/baseline.json
git commit -m "feat(code-quality): ratchet checker + baseline freeze

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

### Task 12: Taskfile targets

Add `quality:index`, `quality:check`, `quality:baseline:freeze`, `test:code-quality`, and wire `test:code-quality` into `test:all`.

**Files:**
- Modify: `/tmp/wt-codequality-gates/Taskfile.yml`

- [x] **12.1 — Add the `quality:*` and `test:code-quality` tasks**

In `Taskfile.yml`, immediately **after** the `agent-guide:maps:` task block (around the `agent-guide:maps:` definition, before `docs:deploy:`), insert:

```yaml
  quality:index:
    desc: "Validate the code-quality registry and regenerate docs/code-quality/repo-index.json"
    cmds:
      - node scripts/code-quality/validate.mjs
      - node scripts/code-quality/emit-index.mjs

  quality:check:
    desc: "Run all code-quality gates (S1-S4) with the baseline ratchet (fails only on new/worsened)"
    cmds:
      - node scripts/code-quality/check.mjs

  quality:baseline:freeze:
    desc: "One-time: freeze the current code-quality violations into docs/code-quality/baseline.json"
    cmds:
      - node scripts/code-quality/freeze.mjs
```

Then locate the `test:agent-guide:` task block and insert a new task immediately after it:

```yaml
  test:code-quality:
    desc: "Run the code-quality gate + registry unit tests (node:test)"
    cmds:
      # These tests import the bare `yaml` specifier (via load.mjs) and invoke
      # node_modules/.bin/madge. A fresh worktree (scripts/worktree-create.sh)
      # ships no root node_modules, and go-task runs test:all deps concurrently,
      # so install lazily first. No-op in CI / installed trees. [T000427]
      - '[ -d node_modules ] || npm ci'
      - node --test scripts/code-quality/*.test.mjs scripts/code-quality/gates/*.test.mjs
```

- [x] **12.2 — Wire `test:code-quality` into `test:all`**

In the `test:all:` task `deps:` list, add `test:code-quality` after `test:agent-guide`:

```yaml
  test:all:
    desc: "Run all offline tests: unit + manifests + art-library + menu-gate + dry-run + docs-gen"
    deps:
      - test:unit
      - test:manifests
      - test:art-library
      - test:menu-gate
      - test:dry-run
      - test:docs-gen
      - test:agent-guide
      - test:code-quality
```

- [x] **12.3 — Verify the tasks are registered and run**

```bash
cd /tmp/wt-codequality-gates
task --list 2>/dev/null | grep -E 'quality:|test:code-quality'
task quality:check
```

Expected: the four task names appear in the list; `task quality:check` prints `✓ no new or worsened violations` and exits 0.

- [x] **12.4 — Verify `quality:index` runs and validates (index committed later in Task 13b)**

The committed `repo-index.json` does **not** exist yet — it is generated and committed in Task 13b, after every code-quality source file exists (Finding-1 fix). So at this point `quality:index` may *create or modify* an uncommitted `repo-index.json`; that is expected and must **not** be committed here. Just prove the task runs (validate + emit) without error.

```bash
cd /tmp/wt-codequality-gates
task quality:index
test -f docs/code-quality/repo-index.json && echo "INDEX EMITTED (uncommitted — committed in Task 13b)"
# leave it uncommitted; Taskfile.yml is the only thing committed in this task.
git checkout -- docs/code-quality/repo-index.json 2>/dev/null; rm -f docs/code-quality/repo-index.json
```

Expected: `task quality:index` prints `✓ code-quality registry valid` (from `validate.mjs`) and `✓ wrote docs/code-quality/repo-index.json (...)` with no error. The final cleanup line ensures no stray index file is staged with the Taskfile commit.

- [x] **12.5 — Verify the full unit suite runs via task**

```bash
cd /tmp/wt-codequality-gates
task test:code-quality
```

Expected: all `scripts/code-quality/*.test.mjs` + `gates/*.test.mjs` pass (`# fail 0`).

- [x] **12.6 — Commit**

```bash
cd /tmp/wt-codequality-gates
git add Taskfile.yml
git commit -m "feat(code-quality): Taskfile targets (quality:index/check/baseline:freeze + test wiring)

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

### Task 13: CI wiring

Add two steps to the `offline-tests` job: the L2-drift index check (analog to the test-inventory step) and the ratchet check. The unit tests already run via `task test:all` (which now depends on `test:code-quality`).

> **Ordering note (Finding-1 fix):** This task wires + commits `ci.yml` but does **not** yet generate/commit the real `repo-index.json`. `ci.yml` is the **last** tracked source file added under the scan-universe (`.github/**` is excluded from `code_roots`, so it does not itself enter the index — but committing it first means the source tree is now complete). The real index is then generated and committed **once** in Task 13b, after which the local CI-sequence reproduction (Task 13c) and the index-drift guard can pass.

**Files:**
- Modify: `/tmp/wt-codequality-gates/.github/workflows/ci.yml`

- [x] **13.1 — Insert the two new steps**

In `.github/workflows/ci.yml`, in the `offline-tests` job, immediately **after** the `Verify test inventory is up to date` step (the block that runs `task test:inventory` + `git diff --exit-code website/src/data/test-inventory.json`), insert:

```yaml
      - name: Verify code-quality repo index is up to date
        run: |
          task quality:index
          if ! git diff --exit-code docs/code-quality/repo-index.json; then
            echo "ERROR: docs/code-quality/repo-index.json is stale — run 'task quality:index' locally and commit"
            exit 1
          fi

      - name: Run code-quality gates (baseline ratchet)
        run: task quality:check
```

- [x] **13.2 — Validate the workflow YAML parses**

```bash
cd /tmp/wt-codequality-gates
node -e "import('yaml').then(({parse})=>{const fs=require('fs');parse(fs.readFileSync('.github/workflows/ci.yml','utf8'));console.log('ci.yml parses OK');})"
```

Expected: `ci.yml parses OK`.

- [x] **13.3 — Commit `ci.yml`**

```bash
cd /tmp/wt-codequality-gates
git add .github/workflows/ci.yml
git commit -m "ci(code-quality): index-drift guard + ratchet check in offline-tests

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

### Task 13b: Generate + commit the real `repo-index.json` (after all source files exist)

This is the **single, final** emit of the committed `docs/code-quality/repo-index.json` (Finding-1 fix). It runs **after** every code-quality source file — `gates/*.mjs`, `*.test.mjs`, `check.mjs`, `freeze.mjs`, and the Taskfile/CI wiring — is committed, so the index it captures is the complete, post-merge tree. Because the `scripts/code-quality/fixtures/**` ignore (Task 3) keeps the synthetic fixtures out of the scan-universe, the only new index entries since Task 6 are the real `scripts-infra` source files under `scripts/code-quality/**`.

**Files:**
- Create (generated): `/tmp/wt-codequality-gates/docs/code-quality/repo-index.json`

- [x] **13b.1 — Generate the real index**

```bash
cd /tmp/wt-codequality-gates
task quality:index
```

Expected: `✓ code-quality registry valid` then `✓ wrote docs/code-quality/repo-index.json (N files)` where `N > 1000` and the command does not error. (The exact `N` is whatever the post-Task-13 tree produces — it is not asserted, only its drift-freedom below.)

- [x] **13b.2 — Verify determinism (a second emit produces no diff)**

```bash
cd /tmp/wt-codequality-gates
git add docs/code-quality/repo-index.json
task quality:index
git diff --exit-code docs/code-quality/repo-index.json && echo "DETERMINISTIC OK"
```

Expected: `DETERMINISTIC OK` (the freshly re-emitted index is byte-identical to the staged one — proves the L2 drift guard will be green in CI).

- [x] **13b.3 — Commit the index**

```bash
cd /tmp/wt-codequality-gates
git add docs/code-quality/repo-index.json
git commit -m "feat(code-quality): commit generated repo-index.json over the complete tree

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

### Task 13c: Locally reproduce the exact CI sequence

Now that the index is committed (Task 13b) and the source tree is complete, the L2 drift guard, the ratchet, and the unit suite must all be green — exactly as CI will run them.

**Files:** none created/modified — verification only.

- [x] **13c.1 — Run the CI sequence locally**

```bash
cd /tmp/wt-codequality-gates
task quality:index
git diff --exit-code docs/code-quality/repo-index.json && echo "INDEX FRESH"
task quality:check && echo "RATCHET GREEN"
task test:code-quality && echo "UNIT GREEN"
```

Expected: `INDEX FRESH` (committed index matches a fresh emit — no drift), then `✓ no new or worsened violations` + `RATCHET GREEN`, then `UNIT GREEN`. If `INDEX FRESH` does not print, the committed index is stale — re-run Task 13b before continuing.

---

### Task 14: Full-slice verification + PR

**Files:** none created/modified — verification only.

- [x] **14.1 — Run the complete offline suite (mirrors CI `task test:all`)**

```bash
cd /tmp/wt-codequality-gates
task test:all
```

Expected: the entire offline suite passes, including the new `test:code-quality` dep. No `# fail`.

- [x] **14.2 — Re-prove the three CI-critical invariants**

```bash
cd /tmp/wt-codequality-gates
# (1) emit does not throw over real HEAD + index has no drift
task quality:index && git diff --exit-code docs/code-quality/repo-index.json && echo "L2 OK"
# (2) ratchet is green against the frozen baseline
task quality:check && echo "RATCHET OK"
# (3) validate is fail-closed (real config is valid)
node scripts/code-quality/validate.mjs && echo "VALIDATE OK"
```

Expected: `L2 OK`, `RATCHET OK`, `VALIDATE OK`.

- [x] **14.3 — Confirm `repo-index.json` and `baseline.json` carry no timestamp**

> **Plan-defect note (execution, T000431):** the naive `grep '…T'` over the
> whole `repo-index.json` false-positives, because two **tracked** files
> (`environments/{korczewski,mentolder}/scraps/sketch-YYYY-MM-DDThh-mm-ss-*.napkin`)
> legitimately embed an ISO timestamp in their *filename* — that is index *data*,
> not a generation timestamp. The same false positive was fixed in the Task 6.4
> determinism test by scoping the ISO-timestamp guard to the index **metadata**
> (the non-`files` portion, where a wall-clock generation stamp would actually
> appear). The metadata-scoped check below is the correct invariant.

```bash
cd /tmp/wt-codequality-gates
node -e "
const idx=require('./docs/code-quality/repo-index.json');
const meta=JSON.stringify({generated_by:idx.generated_by,subsystems:idx.subsystems.map(s=>({id:s.id,name:s.name,owner_agent:s.owner_agent,file_count:s.file_count}))});
if(/generated_at/.test(JSON.stringify(idx))||/\d{4}-\d{2}-\d{2}T/.test(meta)){console.log('HAS TIMESTAMP (BUG)');process.exit(1);}
console.log('NO TIMESTAMP OK (ISO-T appears only in tracked .napkin filenames, not metadata)');
"
```

Expected: `NO TIMESTAMP OK`. (`baseline.json` may contain a `frozen_at` git SHA, which is fine and deterministic per commit — it is not a wall-clock timestamp.)

- [x] **14.4 — Confirm clean tree and review the diff surface**

```bash
cd /tmp/wt-codequality-gates
git status --porcelain     # → empty
git log --oneline origin/main..HEAD
git diff --stat origin/main..HEAD
```

Expected: clean tree; the log shows the Task 1–13 commits (including the Task 13b `repo-index.json` commit); the stat touches only `docs/code-quality/**`, `scripts/code-quality/**`, `package.json`, `package-lock.json`, `Taskfile.yml`, `.github/workflows/ci.yml`.

- [ ] **14.5 — Push and open the PR** (only when the user has asked to land it)

```bash
cd /tmp/wt-codequality-gates
git push -u origin feature/codequality-gates
gh pr create --base main --title "feat(code-quality): Slice A — gates & ratchet (read-only)" --body "$(cat <<'EOF'
Implements Slice A of the code-quality backbone (spec: docs/superpowers/specs/2026-06-05-codequality-gates-design.md).

Adds the curated subsystem registry + gate config, a deterministic repo-index generator with a C4 ownership cross-check, four structural gates (S1 file-size, S2 import cycles via madge, S3 hardcoded hostnames, S4 orphan manifests/scripts), and a baseline-ratchet checker that only fails CI on new/worsened violations. No ticket-enqueue loop and no cron — those land in Slice B.

CI gains two offline-tests steps: an L2 index-drift guard (analog to test-inventory) and `task quality:check`.

Provably green: emit does not throw over real HEAD; `task quality:check` passes against the frozen baseline; full `task test:all` passes.

🤖 Generated with [Claude Code](https://claude.com/claude-code)
EOF
)"
```

Expected: PR created; CI runs the offline-tests job green.

---

## Follow-up: Slice B (separate plan)

The following are **explicitly out of scope** for Slice A and belong to a later, separately-reviewed plan (the riskier loop/cron half). They are listed here for traceability only — do not implement them in this PR:

- `scripts/code-quality/baseline-refresh.mjs` — removes FIXED entries from `baseline.json` and writes down lowered metrics; mandatory output of every Factory fix-PR so the ratchet shrinks monotonically to 0.
- `scripts/code-quality/loop.sh` — groups the baseline by (Gate × Subsystem), dedups against open `CQ-GATE:` tickets (via a `kubectl exec psql` SELECT, since `ticket.sh` has no `list`), throttles to `MAX_NEW=2`, and enqueues Factory tickets (`ticket.sh create … --description … | cut`, then `ticket.sh enqueue --id`).
- Taskfile targets `quality:baseline:refresh` and `quality:loop`.
- `.github/workflows/quality-loop.yml` — nightly cron (schedule trigger from `dev-smoke.yml`, base64 `FLEET_KUBECONFIG` setup from `build-website.yml`, DB writes delegated to `ticket.sh`).
- The Slice-B CI assertion that a `CQ-GATE:` PR **shrinks** the baseline, never grows it.
