---
title: Website CI Deploy `set image` Fix Implementation Plan
ticket_id: T000423
domains: [website, infra, ops, test]
status: active
pr_number: null
---

# Website CI Deploy `set image` Fix Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the two website CI deploy workflows actually repoint the running Deployment to the freshly-built image (`kubectl set image`) instead of only `kubectl rollout restart`, which silently no-ops when the Deployment spec is pinned to an immutable `@sha256` digest.

**Architecture:** Both `build-website.yml` (mentolder) and `build-website-korczewski.yml` (korczewski) already build + push a unique `${IMAGE}:${SHA_TAG}` (plus `:latest`) and export `IMAGE` / `SHA_TAG` into `$GITHUB_ENV`. The deploy step just needs to `kubectl set image deployment/website website="${IMAGE}:${SHA_TAG}"` (a real spec change → deterministic rollout) and keep the existing `rollout status` gate. The regression test (`tests/unit/website-ci-deploy.bats`, already committed RED) asserts this on both files.

**Tech Stack:** GitHub Actions YAML, `kubectl`, BATS (`tests/unit/`), go-task.

---

## Context — Root Cause (verified 2026-06-05)

`task website:deploy` pins the Deployment to a `@sha256` digest on pure-amd64 clusters (`HAS_ARM=0` → `kubectl set image ...@${DIGEST}`). The CI deploy step then only runs `kubectl rollout restart deployment/website`. A rollout-restart of a **digest-pinned** Deployment re-pulls the *same* digest — the freshly-built image never reaches the pods. Result: P1 / PR #1326 was merged but invisible in prod on both brands until the live spec was manually reset to `:latest`. The permanent fix is to make CI authoritative by repointing the spec to the unique built tag on every run. See memory `reference_website_deploy_digest_pin`.

**Not in scope:** changing `task website:deploy`'s amd64 digest-pin. Once CI does `set image` to the unique `sha-...` tag on every `website/**` merge, the spec is a mutable tag and CI is self-correcting — a manual `website:deploy` digest-pin is overwritten on the next merge. Leaving the arch-aware logic untouched avoids the mixed-arch (korczewski) risk it guards against.

## File Structure

- `.github/workflows/build-website.yml` — mentolder build+deploy (deploy step at the `Deploy to mentolder` job step). Modify the deploy commands; add `workflow_dispatch:` so the fix can be validated on demand without a dummy commit.
- `.github/workflows/build-website-korczewski.yml` — korczewski build+deploy. Modify the deploy commands (already has `workflow_dispatch:`).
- `tests/unit/website-ci-deploy.bats` — **already created (RED)**. Asserts both deploy steps use `kubectl set image deployment/website website=` referencing `SHA_TAG`/`IMAGE`, and still `rollout status`.
- `Taskfile.yml` — **already wired**: `test:unit:website-ci-deploy` subtask added and listed under `test:unit` (which `test:all` depends on).

---

### Task 1: mentolder — repoint deploy to the built tag

**Files:**
- Modify: `.github/workflows/build-website.yml` (the `on:` block and the `Deploy to mentolder` run-step)
- Test: `tests/unit/website-ci-deploy.bats`

- [ ] **Step 1: Run the test to confirm the mentolder assertions are RED**

Run: `./tests/unit/lib/bats-core/bin/bats tests/unit/website-ci-deploy.bats`
Expected: tests "mentolder deploy repoints via 'kubectl set image…'" and "mentolder set-image uses the freshly-built tag…" FAIL; "exists" and "rollout status" PASS.

- [ ] **Step 2: Add `workflow_dispatch` to the `on:` trigger**

In `.github/workflows/build-website.yml`, change:

```yaml
on:
  push:
    branches: [main]
    paths:
      - 'website/**'
      - '.github/workflows/build-website.yml'
```

to:

```yaml
on:
  push:
    branches: [main]
    paths:
      - 'website/**'
      - '.github/workflows/build-website.yml'
  workflow_dispatch:
```

- [ ] **Step 3: Replace `rollout restart` with `set image` in the deploy step**

In the `Deploy to mentolder` step, change:

```bash
          kubectl rollout restart deployment/website -n website
          kubectl rollout status deployment/website -n website --timeout=120s
```

to:

```bash
          kubectl set image deployment/website website="${IMAGE}:${SHA_TAG}" -n website
          kubectl rollout status deployment/website -n website --timeout=120s
```

- [ ] **Step 4: Run the test — mentolder assertions now PASS**

Run: `./tests/unit/lib/bats-core/bin/bats tests/unit/website-ci-deploy.bats`
Expected: both mentolder assertions PASS; korczewski assertions still FAIL (fixed in Task 2).

- [ ] **Step 5: Commit**

```bash
git add .github/workflows/build-website.yml
git commit -m "fix(ci): website mentolder deploy set-image to built tag, not rollout-restart [T000423]"
```

---

### Task 2: korczewski — repoint deploy to the built tag

**Files:**
- Modify: `.github/workflows/build-website-korczewski.yml` (the `Deploy to korczewski` run-step; `workflow_dispatch:` already present)
- Test: `tests/unit/website-ci-deploy.bats`

- [ ] **Step 1: Replace `rollout restart` with `set image` in the deploy step**

In the `Deploy to korczewski` step, change:

```bash
          kubectl rollout restart deployment/website -n website-korczewski
          kubectl rollout status deployment/website -n website-korczewski --timeout=120s
```

to:

```bash
          kubectl set image deployment/website website="${IMAGE}:${SHA_TAG}" -n website-korczewski
          kubectl rollout status deployment/website -n website-korczewski --timeout=120s
```

- [ ] **Step 2: Run the test — all 7 assertions PASS**

Run: `./tests/unit/lib/bats-core/bin/bats tests/unit/website-ci-deploy.bats`
Expected: `1..7` all `ok`.

- [ ] **Step 3: Commit**

```bash
git add .github/workflows/build-website-korczewski.yml
git commit -m "fix(ci): website korczewski deploy set-image to built tag, not rollout-restart [T000423]"
```

---

### Task 3: Full offline verification

**Files:** none (verification only)

- [ ] **Step 1: Run the full offline suite**

Run: `task test:all`
Expected: green, including `test:unit:website-ci-deploy` (7/7).

- [ ] **Step 2: Validate the workflows still parse (no YAML breakage)**

Run: `python3 -c "import yaml,sys; [yaml.safe_load(open(f)) for f in ['.github/workflows/build-website.yml','.github/workflows/build-website-korczewski.yml']]; print('yaml ok')"`
Expected: `yaml ok`.

---

## Post-Merge Validation (record in the PR / ticket T000423)

After the PR merges, the fix takes effect on the next `website/**` push. To validate end-to-end without waiting for a content change:

1. Trigger a manual run per brand:
   - `gh workflow run build-website.yml` (mentolder — needs the `workflow_dispatch` added in Task 1)
   - `gh workflow run build-website-korczewski.yml` (korczewski)
2. After each run, confirm the running pod adopted the new sha tag:
   - `kubectl --context fleet -n website get deploy website -o jsonpath='{.spec.template.spec.containers[0].image}{"\n"}'` → ends with `:sha-<...>` (not `@sha256:` or `:latest`).
   - `kubectl --context fleet -n website-korczewski get deploy website -o jsonpath='{.spec.template.spec.containers[0].image}{"\n"}'` likewise.

(If a brand's GHCR image-ref differs from `ghcr.io/paddione/<brand>-website`, this fix is unaffected — it reuses the `IMAGE`/`SHA_TAG` already computed in the build step.)
