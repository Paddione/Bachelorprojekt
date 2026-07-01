---
title: "openspec-scope-hardening — Implementation Plan"
ticket_id: T001304
domains: [openspec, tooling, ci]
status: active
file_locks: []
shared_changes: false
batch_id: null
parent_feature: null
depends_on_plans: []
---

# openspec-scope-hardening — Implementation Plan

_Ticket: T001304_
_Design: docs/superpowers/specs/2026-06-28-openspec-scope-hardening-design.md_

## File Structure

```
Code (4 files):
  scripts/openspec-merge.mjs          — Hebel 2: --create-new guard + flag parsing
  scripts/openspec.sh                 — Hebel 2/1: archive --create-new passthrough, propose --target-spec
  scripts/openspec-validate.ts        — Hebel 3: checkConfigDrift WARN → FAIL (ok:false)
  scripts/openspec-validate.test.ts   — RED test: unlisted spec ⇒ ok:false

Content — SSOT spec merges (Hebel 4a; +Requirements, then delete source):
  openspec/specs/admin-cockpit.md         ← +cockpit-direct-ticket-links, +cockpit-fullscreen-overview,
                                            +cockpit-sidekick-global, +platform-cockpit-alignment
  openspec/specs/sidekick-assistant.md    ← +sidekick-ai-quality, +sidekick-cleanup-grilling-broadcast
  openspec/specs/portal.md                ← +coaching-studio
  openspec/specs/auth-sso.md              ← +pocket-id-oidc-wiring
  openspec/specs/secret-rotation.md       ← +secret-rotation-guards
  openspec/specs/workspace-deploy.md      ← +korczewski-deploy-parity

Content — SSOT spec deletes (Hebel 4a sources after merge + Hebel 4b archives):
  openspec/specs/{cockpit-direct-ticket-links, cockpit-fullscreen-overview,
    cockpit-sidekick-global, platform-cockpit-alignment, sidekick-ai-quality,
    sidekick-cleanup-grilling-broadcast, coaching-studio, pocket-id-oidc-wiring,
    secret-rotation-guards, korczewski-deploy-parity}.md           (10 merged sources)
  openspec/specs/{korczewski-monolith-keycloak-auth, openspec-ticket-detail-view,
    g-doc02-claude-md-trim, g-spec03-proposal-tickets, g-test03-vitest-skip-todo,
    t001269-mishap-bundle-skills-dev-flow-execute-repo-worktree-state-ticket-mcp,
    t001272-mishap-bundle-ticket-sh-factory-ticket-mcp, fix-coaching-studio-prod-manifest,
    fix-awaiting-deploy-visualization-gaps, antigravity-cli-gh-sandbox, cq02-any-types-200,
    ci-speed, docker-build-speedup, npm-audit-clean, size04-loc-velocity,
    g-dep02-major-deps-website}.md                                 (16 archived)

Registry cleanup (Hebel 4c):
  openspec/config.yaml                — OpenSpec-Komponenten: drop all 26 removed slugs
  openspec/component-map.yaml         — drop any mappings pointing at removed slugs (none today; re-check)

Docs (Hebel 1):
  CLAUDE.md                           — Delta-Spec-Konvention note under OpenSpec section

Change artifacts (already present on branch):
  openspec/changes/openspec-scope-hardening/specs/openspec-workflow.md   — delta → SSOT openspec-workflow
```

## Tasks

### 1. RED — failing test for the drift gate (Hebel 3)

- [ ] In `scripts/openspec-validate.test.ts`, add a `describe('checkConfigDrift — T001304 hard gate')`
      block with a test that builds a tmp `openspec/` root containing a
      `config.yaml` with an `OpenSpec-Komponenten:` block that lists `listed`
      but NOT `orphan`, plus `specs/listed.md` and `specs/orphan.md` (both
      with valid `## Purpose` + `## Requirements` + `### Requirement:` shape).
      Import `checkConfigDrift` (add it to the named imports from
      `./openspec-validate.js`). Assert:
      - `result.ok` is `false`
      - `result.errors.some(e => /orphan/.test(e))` is `true`
- [ ] Run the test and confirm it is RED (the current `checkConfigDrift` pushes
      to `warnings` and always returns `ok: true`, so `expect(ok).toBe(false)`
      fails).

```bash
cd /tmp/wt-openspec-scope-hardening
npm run test:openspec
# expected: FAIL — checkConfigDrift still returns ok:true; the new
#           ok:false assertion is red until task 7 flips WARN → FAIL.
```

### 2. Hebel 2 — `openspec-merge.mjs` `--create-new` guard

- [ ] Parse argv in `main()` to separate the positional `apply <delta> <ssot>`
      from a `--create-new` flag (flag may appear anywhere after `apply`).
      Thread a `createNew` boolean into `applyDelta(deltaPath, ssotPath, today, createNew)`
      (keep `today` defaulted so existing callers/tests stay valid).
- [ ] In `applyDelta`, replace the unconditional auto-create block
      (currently `if (!existsSync(ssotPath)) { mkdirSync…; writeFileSync(…) }`)
      with: if `ssotPath` is absent AND `createNew` is false →
      `fail("Target '<ssotPath>' does not exist. Point the delta at an existing spec, or pass --create-new for a genuinely new component.")`.
      If absent AND `createNew` true → keep the existing create-then-seed behaviour.
- [ ] Manual acceptance (matches design Acceptance Criteria):

```bash
cd /tmp/wt-openspec-scope-hardening
printf '## ADDED Requirements\n\n### Requirement: X\n\nThe system SHALL exist.\n' > /tmp/scope-delta.md
node scripts/openspec-merge.mjs apply /tmp/scope-delta.md /tmp/does-not-exist.md; echo "exit=$?"
# expected: exit=1, error names --create-new, /tmp/does-not-exist.md NOT created
node scripts/openspec-merge.mjs apply /tmp/scope-delta.md /tmp/does-not-exist.md --create-new; echo "exit=$?"
# expected: exit=0, /tmp/does-not-exist.md created
rm -f /tmp/scope-delta.md /tmp/does-not-exist.md
```

### 3. Hebel 2 + Hebel 1 — `openspec.sh` flag wiring

- [ ] `cmd_archive`: accept an optional `--create-new` flag (loop over `$@`
      after the slug). Store it in a `create_new=""` var. In `_merge_delta`,
      append the flag to the `node … openspec-merge.mjs apply` call when set.
      Pass it down through the `for capfile` loop (e.g. `_merge_delta "$capfile" "$ssot" "$create_new"`).
- [ ] `cmd_propose`: accept an optional `--target-spec <existing-slug>` flag in
      the existing `while` option loop. When set, write the seeded delta to
      `"$dir/specs/$target_spec.md"` instead of `"$dir/specs/$slug.md"`.
      Leave every other side effect (proposal.md, tasks.md, .ticket, status)
      unchanged.
- [ ] Manual acceptance:

```bash
cd /tmp/wt-openspec-scope-hardening
TICKET_OFFLINE=1 OPENSPEC_ROOT=/tmp/os-probe bash scripts/openspec.sh propose probe-change --ticket T000000 --target-spec admin-cockpit
ls /tmp/os-probe/changes/probe-change/specs/
# expected: admin-cockpit.md  (NOT probe-change.md)
rm -rf /tmp/os-probe
```

### 4. Hebel 4a — merge 10 thin specs into parents

For each row, copy the source spec's `### Requirement:` blocks into the parent
under the parent's existing `## Requirements` section (parents are SSOT files:
blocks live directly as `### Requirement:` H3 entries — no `## ADDED` wrapper in
SSOT). Preserve each Requirement's Scenarios verbatim. Then `git rm` the source.

- [ ] `cockpit-direct-ticket-links` → `openspec/specs/admin-cockpit.md`
- [ ] `cockpit-fullscreen-overview` → `openspec/specs/admin-cockpit.md`
- [ ] `cockpit-sidekick-global` → `openspec/specs/admin-cockpit.md`
- [ ] `platform-cockpit-alignment` → `openspec/specs/admin-cockpit.md`
- [ ] `sidekick-ai-quality` → `openspec/specs/sidekick-assistant.md`
- [ ] `sidekick-cleanup-grilling-broadcast` → `openspec/specs/sidekick-assistant.md`
- [ ] `coaching-studio` → `openspec/specs/portal.md`
- [ ] `pocket-id-oidc-wiring` → `openspec/specs/auth-sso.md`
- [ ] `secret-rotation-guards` → `openspec/specs/secret-rotation.md` (largest, 395 lines — move all Requirement blocks)
- [ ] `korczewski-deploy-parity` → `openspec/specs/workspace-deploy.md`
- [ ] On any Requirement-name collision between a source and its parent, rename
      the incoming Requirement to a unique, descriptive name (do not silently
      drop or overwrite). Verify each parent still has exactly one `## Purpose`
      and one `## Requirements` H2 (no duplicate headers).
- [ ] `git rm` all 10 source files under `openspec/specs/`.

### 5. Hebel 4b — archive 16 specs (delete, no content transfer)

- [ ] `git rm` the following from `openspec/specs/`:
      `korczewski-monolith-keycloak-auth`, `openspec-ticket-detail-view`,
      `g-doc02-claude-md-trim`, `g-spec03-proposal-tickets`,
      `g-test03-vitest-skip-todo`,
      `t001269-mishap-bundle-skills-dev-flow-execute-repo-worktree-state-ticket-mcp`,
      `t001272-mishap-bundle-ticket-sh-factory-ticket-mcp`,
      `fix-coaching-studio-prod-manifest`, `fix-awaiting-deploy-visualization-gaps`,
      `antigravity-cli-gh-sandbox`, `cq02-any-types-200`, `ci-speed`,
      `docker-build-speedup`, `npm-audit-clean`, `size04-loc-velocity`,
      `g-dep02-major-deps-website` (all `.md`).
- [ ] Record the post-consolidation count: `ls openspec/specs/*.md | wc -l`.
      Starting from 74 and removing 26 leaves 48. The design's "≤42" target
      additionally assumes some empty baselines lapse, but baselines are a
      Non-Goal — do NOT delete them. Document the actual count in the PR and
      treat ≤48 as the gate for this change.

### 6. Hebel 4c — clean the registries

- [ ] `openspec/config.yaml`: remove all 26 removed slugs from the
      `OpenSpec-Komponenten:` block scalar. The remaining list must equal
      exactly the set of `openspec/specs/*.md` slugs (no missing, no extra).
- [ ] `openspec/component-map.yaml`: remove any `spec:` mapping whose target is
      one of the 26 removed slugs. (Current grep finds none, but re-verify
      after the merges — if a removed slug had a mapping, repoint it to the
      parent spec instead of deleting the prefix.)
- [ ] Cross-check: every slug now in `config.yaml` `OpenSpec-Komponenten` has a
      matching file in `openspec/specs/`, and vice versa.

```bash
cd /tmp/wt-openspec-scope-hardening
comm -3 \
  <(ls openspec/specs/*.md | xargs -n1 basename | sed 's/\.md$//' | sort -u) \
  <(sed -n '/OpenSpec-Komponenten:/,/^[[:space:]]*[a-z]*:/p' openspec/config.yaml \
      | grep -oE '[a-z0-9][a-z0-9-]+' | grep -vx 'OpenSpec\|Komponenten' | sort -u)
# expected: empty output (specs/ and config.yaml registry are in perfect sync)
```

### 7. GREEN — Hebel 3: flip `checkConfigDrift` WARN → FAIL

- [ ] In `scripts/openspec-validate.ts` `checkConfigDrift()`: collect an
      `errors` array instead of `warnings`. Push
      `FAIL: ${slug} not listed in config.yaml OpenSpec-Komponenten` into it,
      and return `{ ok: errors.length === 0, errors, warnings: [] }`.
- [ ] In `validateTree()`, merge `driftResult.errors` into `allErrors` (it
      currently only forwards `driftResult.warnings`).
- [ ] Run the suite. The RED test from task 1 (`ok:false` for an orphan spec)
      must now be GREEN, AND the existing `validateTree — repo integration`
      test (`passes the actual openspec/ tree`, expects `ok:true`) must stay
      GREEN — which holds only because tasks 4–6 left every remaining spec
      registered in `config.yaml`.

```bash
cd /tmp/wt-openspec-scope-hardening
npm run test:openspec
# expected: PASS — orphan-spec test green AND real-tree integration test green
bash scripts/openspec.sh validate
# expected: "openspec validate: OK"
```

### 8. Hebel 1 — CLAUDE.md convention note

- [ ] Under the OpenSpec section in `CLAUDE.md` (near the
      "OpenSpec native change workflow" block), add a short
      "Delta-Spec-Konvention" note: delta files in
      `openspec/changes/<slug>/specs/` are named after the **parent SSOT slug**,
      not the change slug; use `--target-spec <parent-slug>` on propose for a
      sub-feature of an existing component, and `--create-new` on archive only
      for a genuinely new component. Keep it to ~4 lines; do not restructure
      surrounding content.

### 9. Finalize the delta spec

- [ ] Confirm `openspec/changes/openspec-scope-hardening/specs/openspec-workflow.md`
      (already authored) still matches the implemented behaviour: merge guard,
      drift hard-gate, `--target-spec`, archive `--create-new`. Adjust any
      Scenario that drifted from the final implementation.
- [ ] `bash scripts/openspec.sh validate` must report OK for the change delta.

### 10. Final Verification

- [ ] Run the three mandatory CI gates and confirm all green:

```bash
cd /tmp/wt-openspec-scope-hardening
task test:changed
task freshness:regenerate
task freshness:check
```

## Notes & Trade-offs

- **Order is load-bearing.** The drift gate (task 7) flips to hard-fail only
  AFTER consolidation (tasks 4–6) updates `config.yaml`; flipping earlier would
  red the `validateTree — repo integration` test against the real tree.
- **TDD on the gate, not the merges.** The RED→GREEN cycle covers Hebel 3
  (validate). Hebel 2 (merge guard, `--target-spec`) is verified by the manual
  acceptance commands lifted from the design's Acceptance Criteria; add inline
  vitest/BATS coverage there too if cheap, but the CLI checks are the contract.
- **ADDED, not MODIFIED, in the delta.** The change delta uses `## ADDED
  Requirements` so the validator's MODIFIED/REMOVED cross-reference check
  (target must pre-exist in SSOT) does not apply to genuinely new behaviour.
- **No LOC budgets.** None of the four code files are in the S1 baseline
  system; moderate growth is acceptable.
- **Baselines untouched.** The auto-generated empty baseline specs stay — they
  are legitimate unfilled placeholders, explicitly a Non-Goal to remove.
```
