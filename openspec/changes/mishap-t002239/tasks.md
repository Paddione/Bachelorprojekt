---
title: "mishap-t002239 — Implementation Plan"
ticket_id: T002239
domains: [infra, test, website]
status: in_progress
file_locks: []
shared_changes: false
batch_id: null
parent_feature: null
depends_on_plans: []
---

# mishap-t002239 — Implementation Plan

_Ticket: T002239_

Three tooling mishaps collected during the ticket-ops run on 2026-07-26. All three
share one shape: a generator or install step writes into the **main checkout** and
leaves it in a state the next operation cannot handle. None is a user-facing
behaviour change; all three cost real debugging time, and one silently disabled the
local website test gate.

## File Structure

```
.githooks/post-merge                          # M1 — stop leaving k3d/docs-content-built/ dirty
tests/spec/pre-commit-freshness.bats          # M1 — regression test (file exists, extend it)
website/public/brand/korczewski/kore-app.css  # M2 — resolve generator/test disagreement
tests/spec/website-core.bats                  # M2 — regression test (file exists, extend it)
scripts/worktree-create.sh                    # M3 — guard pnpm install via symlinked node_modules
tests/spec/t002204-mishap-bundle.bats         # M3 — regression test (file exists, extend it)
```

## Verify (RED → GREEN)

- [ ] **Failing-Test-Step (RED).** Add three failing tests, one per mishap, to the
      spec files listed above. Do NOT create new ticket-numbered spec files — the
      BATS convention in CLAUDE.md puts new `@test` entries in the spec file that
      already owns the topic, and all three topics already have one:
      `pre-commit-freshness.bats` holds `T001973: post-merge hook contains a
      guard …`, `website-core.bats` holds `T001433 alias: kore-app.css overrides
      --admin-primary with copper`, and `t002204-mishap-bundle.bats` holds the
      `T002204-M1` worktree node_modules linking tests.

      Assert statically where a real merge or install would be needed — these tests
      must never mutate the checkout or reach a cluster (see T002224, where a test
      that did reach the cluster minted 130 rows in the live ticket database).

```bash
tests/unit/lib/bats-core/bin/bats tests/spec/pre-commit-freshness.bats tests/spec/website-core.bats tests/spec/t002204-mishap-bundle.bats
# expected: FAIL (red — three new assertions, none of the fixes implemented yet)
```

- [ ] **M1 Fix-Step (GREEN) — post-merge hook must not leave the tree dirty.**
      `.githooks/post-merge:16` runs `task freshness:regenerate` after every merge
      and pull. In the main checkout that leaves 219–222 uncommitted files, almost
      all under `k3d/docs-content-built/` plus `docs/mermaid-snapshots/`. Observed
      twice on 2026-07-26.

      The hook's own comment (lines 19–21) asserts the opposite: *"plain `git pull`
      doesn't leave the tree dirty"*. That claim is false, and the consequence is
      that every following `git pull --ff-only` aborts with *"cannot pull with
      rebase: You have unstaged changes"* — breaking the main checkout for the one
      operation CLAUDE.local.md reserves it for.

      Evidence this is chronic rather than a one-off: 12 stale stashes from other
      sessions sit on `main`, several explicitly about regeneration
      (`worktree-create-auto-stash`, `chore: auto-regenerate freshness artifacts`,
      `dev-flow-execute-session temporary stash`). Every session works around it
      individually instead of fixing it.

      Pick one resolution and make the hook honest about it: drop the docs
      regeneration from the hook path (already automated separately via
      `scripts/build-docs.mjs` / `build-docs.yml`, landing on `main` as *"chore:
      auto-regenerate freshness artifacts"*), have the hook commit what it
      regenerates, or leave `k3d/docs-content-built/` untouched. The current middle
      ground — regenerate and abandon — is the worst of the three. Update the
      stale comment either way.

- [ ] **M2 Fix-Step (GREEN) — brand CSS generator vs. the T001433 test.**
      After a `task test:changed` run, three brand CSS files were modified —
      `korczewski/colors_and_type.css`, `korczewski/kore-app.css` (3 lines
      removed) and `mentolder/colors_and_type.css` — and `T001433 alias:
      kore-app.css overrides --admin-primary with copper` went red. The same test
      is green on clean `main`, so it was checking freshly generated content from
      which the copper override had vanished.

      First identify which generator writes these files and whether the override
      belongs in generated output at all. Then decide which side is the source of
      truth: either the generator must emit the override, or the test must not
      expect it in a generated file. Do not simply pin the currently committed
      bytes — that hides the disagreement instead of resolving it.

      Check one independent sighting first: a stash on `main` from another session
      reads *"fremde Brand-CSS-Aenderungen (Google-Fonts-CDN-Reintroduktion) —
      geparkt von dev-flow-execute 2026-07-26"*. There the same regeneration
      reintroduced a Google Fonts CDN reference, which would be a DSGVO regression
      if it ever merged. If that is the same generator, it is the more urgent half
      of this task and should be handled first.

- [ ] **M3 Fix-Step (GREEN) — guard pnpm install inside a worktree.**
      `website/node_modules/.modules.yaml` in the main checkout carried
      `virtualStoreDir: "../../.worktrees/specs-keycloak/website/node_modules/.pnpm"`.
      `scripts/worktree-create.sh` links a worktree's `website/node_modules` as a
      symlink to the main checkout, so `pnpm install` run from inside a worktree
      rewrites the **main checkout's** `.modules.yaml` with a worktree-relative
      virtual store path.

      When that worktree is later removed — ordinary cleanup of a merged branch —
      the path dangles, pnpm refuses any repair short of a full purge
      (`ERR_PNPM_ABORTED_REMOVE_MODULES_DIR_NO_TTY`), and `vitest` becomes
      unresolvable even though it sits in the store. `task test:changed` aborted
      with exit 201 and `Cannot find module …/website/node_modules/vitest/vitest.mjs`
      on clean `main`: the local website test gate was dead and nothing reported it.

      Add a guard that refuses `pnpm install` with an explanatory message naming the
      main checkout when `website/node_modules` (or any linked `node_modules`) is a
      symlink. Without it, every worktree cleanup following an install there
      silently disarms the main checkout's test gate, and the failure surfaces days
      later somewhere unrelated.

      The current tree was already repaired in place via
      `CI=true pnpm install --frozen-lockfile` in `website/`; this task prevents the
      recurrence rather than repairing that instance.

- [ ] **Final Verification.** Run the three mandatory CI gates:

```bash
task test:changed
task freshness:regenerate
task freshness:check
```
