# T-2 — Update Order & Steps (T001360, dep02)

Derived from `specs/audit.md`. Both in-scope upgrades live in the same root
`package.json` / `package-lock.json` and are independent (dev-only tooling with
no runtime coupling), so they are applied together in one `npm install` and
recorded as one self-contained commit — there is no transitive ordering
constraint between them.

## Order

1. **typescript 5.9.3 → 6.0.3** (devDependency).
   - Risk: root `typecheck` script is not CI-gated; brett + astro TS checks use
     their own pinned TS. No runtime impact.
   - Validate: vitest-based tests still compile/run under the new TS toolchain.
2. **vitest 3.2.6 → 4.1.9** (devDependency).
   - Risk: v4 default transformer is oxc (esbuild transform opts ignored, logged).
   - Validate: `npm run test:openspec` (12 tests) green; `test:agent-guide`,
     `test:code-quality` green.

Both bumps are staged in a **single** `npm install --save-dev typescript@6
vitest@4`, producing one coherent lockfile delta → one commit.

## Verification steps

- `npm run test:openspec` → 12 passed.
- `npm run test:agent-guide` → passed.
- `npm run test:code-quality` → passed.
- `task test:changed` → the only failures (`plan-lint` #8, `docs-gen` #8) are
  **pre-existing** in this worktree (reproduced on a clean tree with the deps
  stashed), i.e. not introduced by this change.
- `task freshness:regenerate && task freshness:check` before PR.

## Deferred (not in this plan)

- `eslint-plugin-astro` 1→2 and `knip` 5→6 (website / pnpm) — separate
  website-domain change; see `specs/audit.md` for rationale.

## Conflict assessment

Conflict-free: touches only the root npm manifest + lockfile. No overlap with
the two occupied G-DEP02 slots (different packages) and no website lockfile
churn. Existing test suite preserved.
