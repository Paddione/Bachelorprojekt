---
title: "g-dep01-npm-vuln — npm Vulnerability Fix (js-yaml, @babel/core)"
ticket_id: T001278
domains: [website]
status: planning
---

# g-dep01-npm-vuln — Implementation Plan

Fix two known CVEs reported by `pnpm audit` in the `website/` package by adding
`pnpm.overrides` for `js-yaml` and `@babel/core`, regenerating the lockfile, and
gating the fix with a BATS test that enforces zero vulnerabilities in CI.

## File Structure

Files changed by this PR:

| File | Extension | Current lines | Residual budget |
|---|---|---|---|
| `website/package.json` | `.json` | 85 | ungated |
| `website/pnpm-lock.yaml` | `.yaml` | ~3000+ | ungated |
| `tests/spec/g-dep01-npm-vuln.bats` | `.bash` | 0 (new) | 300 |

All files are either ungated JSON/YAML or the new BATS file is well within the
300-line limit for `.bash` files.

---

## Task 1 — Write failing BATS test (rot)

Goal: have a BATS test that asserts `pnpm audit` exits 0. Currently it exits 1
(2 vulnerabilities) so the test fails — expected: FAIL at this step.

- [ ] 1.1 Create `tests/spec/g-dep01-npm-vuln.bats` with two `@test` entries:
  - `G-DEP01: pnpm audit reports zero vulnerabilities` — runs `pnpm audit --json`
    in the `website/` directory, checks exit code 0 and `.metadata.vulnerabilities.total == 0`
  - `G-DEP01: pnpm-lock.yaml is up-to-date after install` — verifies the lockfile
    is not dirty (no changes after `pnpm install --frozen-lockfile`)
- [ ] 1.2 Run `./tests/runner.sh local G-DEP01` and confirm the audit test **fails**
  with non-zero exit (expected: FAIL before the override is applied)

## Task 2 — Add overrides to website/pnpm-workspace.yaml

Goal: pin the two vulnerable transitive deps to their patched versions using the
idiomatic pnpm mechanism. **pnpm 11+ reads `overrides` from `pnpm-workspace.yaml`,
not from `package.json`** (the `pnpm.overrides` field in `package.json` is ignored
as of v11 and emits a warning).

- [ ] 2.1 In `website/pnpm-workspace.yaml`, add `js-yaml` and `@babel/core` to the
  existing `overrides` block:
  ```yaml
  overrides:
    yaml: "^2.9.0"
    esbuild: "^0.28.1"
    undici: "7.28.0"
    ws: "8.21.0"
    js-yaml: "^4.1.2"        # GHSA-h67p-54hq-rp68 — ReDoS in 4.1.1
    "@babel/core": ">=7.29.1"  # GHSA-4x5r-pxfx-6jf8 — Arbitrary File Read in 7.29.0
  ```
- [ ] 2.2 Verify `pnpm-workspace.yaml` is valid YAML by running `python3 -c "import yaml; yaml.safe_load(open('./website/pnpm-workspace.yaml'))"`.

## Task 3 — Regenerate pnpm-lock.yaml

Goal: apply the overrides to the lockfile so the resolved versions of `js-yaml`
and `@babel/core` change to their safe versions.

- [ ] 3.1 Run `cd website && pnpm install` to regenerate `pnpm-lock.yaml`.
- [ ] 3.2 Confirm `pnpm why js-yaml` shows a version `>=4.1.2` is now resolved.
- [ ] 3.3 Confirm `pnpm why @babel/core` shows a version `>=7.29.1` is now resolved.
- [ ] 3.4 Run `cd website && pnpm audit` and verify it exits 0 with output
  `0 vulnerabilities found`.

## Task 4 — Verify build and tests pass (grün)

Goal: confirm the override does not break the Astro build, Vitest suite, or type
checks.

- [ ] 4.1 Run `task website:build` (or `cd website && pnpm build`) and confirm
  it exits 0 without warnings about `js-yaml` or `@babel/core`.
- [ ] 4.2 Run `task vitest` (or `cd website && pnpm vitest run`) and confirm all
  tests pass.
- [ ] 4.3 Run `./tests/runner.sh local G-DEP01` and confirm the previously failing
  BATS test now passes (grün).

## Task 5 — Final verification and CI gate

- [ ] 5.1 Run `task test:changed` to run the full offline CI gate against changed files.
- [ ] 5.2 Run `task freshness:regenerate` to rebuild generated artifacts
  (repo-index.json, test-inventory.json) that depend on the changed test spec.
- [ ] 5.3 Run `task freshness:check` to assert generated artifacts are up-to-date.
- [ ] 5.4 Run `task test:inventory` and commit the updated `website/src/data/test-inventory.json`
  if the new BATS test appeared in the inventory scan.
- [ ] 5.5 Validate the OpenSpec change: `bash scripts/openspec.sh validate` or
  `task openspec:validate` — must exit 0.
