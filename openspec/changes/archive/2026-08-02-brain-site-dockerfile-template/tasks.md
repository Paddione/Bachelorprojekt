---
title: "brain-site-dockerfile-template — Implementation Plan"
ticket_id: T001578
domains: [brain, templates, tests]
status: active
file_locks: []
shared_changes: false
batch_id: null
parent_feature: null
depends_on_plans: []
---

# brain-site-dockerfile-template — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

## File Structure

```
templates/brain/site.Dockerfile                       # MODIFY — replace broken build with proven Quartz-v4.5.2 clone build from Paddione/brain
templates/brain/.github/workflows/build-site.yml      # CREATE — GH-Actions workflow that builds & pushes ghcr.io/paddione/brain-site:latest
tests/spec/brain-foundation.bats                      # ALREADY COMMITTED (RED) — 5 T001578 @test blocks at end of file; no edit needed
website/src/data/test-inventory.json                  # REGENERATE — tests were added; CI inventory check compares against committed version
```

_Ticket: T001578 (bug). Design-Spec: `docs/superpowers/specs/2026-07-03-brain-site-dockerfile-template-design.md`._

**Goal:** Make `templates/brain/site.Dockerfile` buildable again by porting the live-verified version from the external `Paddione/brain` repo back into the template, and add the matching `build-site.yml` workflow template so every future bootstrap seed ships a working build pipeline.

**Architecture:** Two-stage Dockerfile — builder clones Quartz pinned at tag `v4.5.2` (its own `package.json` lives in the clone, so `npm ci` works without a template-side Node manifest), swaps in the wiki content, runs `npx quartz build`; runtime stage is the official `ghcr.io/static-web-server/static-web-server:2-alpine` serving `/public`. No `EXPOSE`/`CMD`: `k3d/brain.yaml` sets `SERVER_PORT=8787` as env var, which static-web-server reads (verified, `k3d/brain.yaml` lines 43–48). `scripts/brain-bootstrap.sh` stays untouched — its 1:1 copy (`cp -R "$TEMPLATE_DIR/." "$dest/"`) seeds both files automatically.

**Tech Stack:** Dockerfile (multi-stage), GitHub Actions YAML, BATS.

## Global Constraints

- Quartz pin verbatim: `--branch v4.5.2` (clone of `https://github.com/jackyzha0/quartz`).
- Runtime image verbatim: `ghcr.io/static-web-server/static-web-server:2-alpine`.
- Image tag pushed by the workflow verbatim: `ghcr.io/paddione/brain-site:latest`.
- The Dockerfile MUST NOT contain `COPY package` or `--only=production` (the RED tests assert their absence).
- `scripts/brain-bootstrap.sh` stays UNCHANGED.
- Scope: template + tests only. The external repo `Paddione/brain` is already correct and is not touched. No deploy step (image build runs in the external repo). No manifest change → no `workspace:validate` delta expected.
- `:latest` in the workflow tag is intentional and matches the existing external pipeline; the CI image-pin scan is advisory and the file lives under `templates/`, not `k3d/`.

**S1 ratchet notes (per file, checked against `docs/code-quality/baseline.json` — no `templates/brain/*` keys exist):**
- `templates/brain/site.Dockerfile`: currently 11 lines → target 11 lines. `.Dockerfile` has no S1 extension limit; not baselined. No budget concern.
- `templates/brain/.github/workflows/build-site.yml`: new, ~25 lines. `.yml` has no S1 extension limit; not baselined. No budget concern.
- `tests/spec/brain-foundation.bats`: 119 lines, already committed on this branch (RED tests included); `.bats` has no S1 extension limit; not baselined. Not modified by this plan.

<!-- vitest: kein neuer Test nötig, weil keine website/src-Datei berührt wird — Abdeckung erfolgt vollständig über die bereits committeten BATS-Tests in tests/spec/brain-foundation.bats. -->

---

### Task 1: Verify the RED baseline (failing tests exist and fail)

**Files:**
- Test: `tests/spec/brain-foundation.bats` (already committed — the 5 `@test` blocks after the comment `# --- T001578: site.Dockerfile template must be buildable`)

**Interfaces:**
- Consumes: nothing (first task).
- Produces: verified RED state — Tasks 2 and 3 turn exactly these 5 tests green. Test names: `site.Dockerfile pins quartz v4.5.2 via tagged clone`, `site.Dockerfile runtime stage uses the official static-web-server image`, `site.Dockerfile has no npm ci against a nonexistent package.json`, `build-site.yml workflow template exists and pushes brain-site:latest`, `bootstrap seed contains site.Dockerfile and build-site.yml`.

The failing tests are ALREADY written and committed on this branch (rot verifiziert). Do NOT write new tests; this task only re-confirms the RED state before touching the implementation.

- [ ] **Step 1: Run the committed T001578 tests and confirm they fail**

Run:
```bash
cd /tmp/wt-brain-site-dockerfile-template
bats tests/spec/brain-foundation.bats
```

expected: FAIL — exactly these 4 of the 5 new T001578 tests are red on the current branch:
- `site.Dockerfile pins quartz v4.5.2 via tagged clone` (no `--branch v4.5.2` in the current file)
- `site.Dockerfile runtime stage uses the official static-web-server image` (current runtime is `ghcr.io/paddione/workspace-static-server:latest`)
- `site.Dockerfile has no npm ci against a nonexistent package.json` (current file contains both `COPY package*.json` and `--only=production`)
- `build-site.yml workflow template exists and pushes brain-site:latest` (file does not exist yet)

The 5th test (`bootstrap seed contains site.Dockerfile and build-site.yml`) also fails because the seed cannot contain a `build-site.yml` that does not exist in the template. All pre-existing brain-foundation tests (Karpathy layout, idempotency, linters) must stay green. If any pre-existing test is red, stop and investigate before proceeding.

- [ ] **Step 2: No commit** — nothing changed; this step only pins the RED baseline for the rot→grün cycle.

---

### Task 2: Replace `templates/brain/site.Dockerfile` with the proven Quartz-v4.5.2 build

**Files:**
- Modify: `templates/brain/site.Dockerfile` (full replacement, 11 lines → 11 lines)
- Test: `tests/spec/brain-foundation.bats` (existing, not edited)

**Interfaces:**
- Consumes: RED baseline from Task 1.
- Produces: a buildable Dockerfile whose exact strings the BATS greps match: `--branch v4.5.2`, `ghcr.io/static-web-server/static-web-server:2-alpine`, and the absence of `COPY package` / `--only=production`. Task 3's workflow stages content and builds with exactly this file (it does `COPY content /q/content`, so the workflow must place the wiki files under a `content/` dir in the build context).

- [ ] **Step 1: Replace the entire file content**

Write `templates/brain/site.Dockerfile` with exactly this content (verbatim from `Paddione/brain`, live verified — image `ghcr.io/paddione/brain-site:latest` built and deployed on fleet):

```dockerfile
FROM node:22-slim AS builder
RUN apt-get update -qq && apt-get install -y -qq git ca-certificates >/dev/null
RUN git clone --depth 1 --branch v4.5.2 https://github.com/jackyzha0/quartz /q
WORKDIR /q
RUN npm ci
RUN rm -rf /q/content
COPY content /q/content
RUN npx quartz build
FROM ghcr.io/static-web-server/static-web-server:2-alpine
COPY --from=builder /q/public /public
```

Deliberately NO `EXPOSE`/`CMD`: `k3d/brain.yaml` sets `SERVER_PORT=8787` as env var and static-web-server reads it, so the container port 8787 asserted in `tests/spec/brain-quartz-deploy.bats` stays satisfied.

- [ ] **Step 2: Run the three Dockerfile tests to verify they pass**

Run:
```bash
cd /tmp/wt-brain-site-dockerfile-template
bats tests/spec/brain-foundation.bats \
  -f 'site.Dockerfile'
```

Expected: PASS — all 3 `site.Dockerfile*` tests green (`--branch v4.5.2` present, `ghcr.io/static-web-server/static-web-server:2-alpine` present, no `COPY package` / `--only=production`).

- [ ] **Step 3: Commit**

```bash
cd /tmp/wt-brain-site-dockerfile-template
git add templates/brain/site.Dockerfile
git commit -m "fix(brain): replace broken site.Dockerfile template with proven quartz v4.5.2 build [T001578]"
```

---

### Task 3: Add `templates/brain/.github/workflows/build-site.yml` workflow template

**Files:**
- Create: `templates/brain/.github/workflows/build-site.yml` (~25 lines; directory `templates/brain/.github/workflows/` already exists and contains `ci.yml`)
- Test: `tests/spec/brain-foundation.bats` (existing, not edited)

**Interfaces:**
- Consumes: the Dockerfile from Task 2 — the staging step copies it as `Dockerfile` into the build context and stages the wiki content under `content/`, matching the Dockerfile's `COPY content /q/content` line.
- Produces: workflow file whose strings match the BATS greps `ghcr.io/paddione/brain-site:latest` and `site.Dockerfile`; together with Task 2 this completes the template set the bootstrap-seed test asserts.

- [ ] **Step 1: Create the workflow file**

Write `templates/brain/.github/workflows/build-site.yml` with exactly this content (copy of the working workflow in `Paddione/brain`):

```yaml
name: Build & Push Quartz Site

on:
  push:
    branches: [main]
  workflow_dispatch:

permissions:
  contents: read
  packages: write

jobs:
  build:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - name: Stage build context
        run: |
          mkdir -p /tmp/build/content
          cp -R index.md log.md SCHEMA.md wiki raw /tmp/build/content/
          cp site.Dockerfile /tmp/build/Dockerfile
      - uses: docker/login-action@v3
        with:
          registry: ghcr.io
          username: ${{ github.actor }}
          password: ${{ secrets.GITHUB_TOKEN }}
      - uses: docker/build-push-action@v6
        with:
          context: /tmp/build
          push: true
          tags: ghcr.io/paddione/brain-site:latest
```

- [ ] **Step 2: Run the full brain-foundation suite to verify everything passes**

Run:
```bash
cd /tmp/wt-brain-site-dockerfile-template
bats tests/spec/brain-foundation.bats
```

Expected: PASS — all tests green, including `build-site.yml workflow template exists and pushes brain-site:latest` (file exists, greps for `ghcr.io/paddione/brain-site:latest` and `site.Dockerfile` hit) and `bootstrap seed contains site.Dockerfile and build-site.yml` (the unchanged `scripts/brain-bootstrap.sh` 1:1 copy now seeds both files into a temp-dir local-mode seed).

- [ ] **Step 3: Commit**

```bash
cd /tmp/wt-brain-site-dockerfile-template
git add templates/brain/.github/workflows/build-site.yml
git commit -m "fix(brain): add build-site.yml workflow to brain template [T001578]"
```

---

### Task 4: Final verification — CI gates, test inventory, OpenSpec validate

**Files:**
- Modify: `website/src/data/test-inventory.json` (regenerated — tests changed on this branch, CI inventory check compares against the committed version)

**Interfaces:**
- Consumes: green suite from Tasks 2–3.
- Produces: branch ready for PR — all mandatory CI gates green, inventory committed, OpenSpec change valid.

- [ ] **Step 1: Run the mandatory verify commands**

```bash
cd /tmp/wt-brain-site-dockerfile-template
task test:changed
task freshness:regenerate
task freshness:check
```

Expected: all three exit 0. `freshness:check` includes the S1–S4 quality ratchet; no `templates/brain/*` baseline keys exist and neither file type has an S1 limit, so no ratchet delta is expected.

- [ ] **Step 2: Regenerate and commit the test inventory**

The 5 T001578 tests were added to `tests/spec/brain-foundation.bats` on this branch, so the committed inventory must be regenerated or CI fails the inventory check:

```bash
cd /tmp/wt-brain-site-dockerfile-template
task test:inventory
git add website/src/data/test-inventory.json
git diff --cached --quiet || git commit -m "chore(tests): regenerate test inventory for T001578 brain-foundation tests"
```

Expected: inventory regenerated; commit only happens if the file actually changed.

- [ ] **Step 3: Validate the OpenSpec change**

```bash
cd /tmp/wt-brain-site-dockerfile-template
bash scripts/openspec.sh validate
```

Expected: exit 0 — change `brain-site-dockerfile-template` valid (delta `specs/brain-foundation.md` named after the parent SSOT per T001304 convention).

- [ ] **Step 4: Re-run the full spec suite once more as a final sanity check**

```bash
cd /tmp/wt-brain-site-dockerfile-template
bats tests/spec/brain-foundation.bats
```

Expected: PASS — full file green (pre-existing foundation tests plus all 5 T001578 tests).
