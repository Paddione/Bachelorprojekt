# T-2 — Update Order & Steps (T001360, dep02)

Derived from `audit.md`. The in-scope upgrade lives in the root `package.json` /
`package-lock.json` (dev-only tooling, no runtime coupling) → one self-contained
commit.

## Order

1. **vitest 3.2.6 → 4.1.9** (devDependency) — **shipped**.
   - Risk: v4 default transformer is oxc (esbuild transform opts ignored, logged).
   - Validate: `npm run test:openspec` (12 tests) green; `test:agent-guide`,
     `test:code-quality` green; `npm ci` resolves cleanly.
2. **typescript 5.9.3 → 6.0.3** (devDependency) — **deferred, not shipped**.
   - Blocker: `madge@8.0.0` declares `peerOptional typescript@^5.4.4`; TS 6 fails
     strict `npm ci` (ERESOLVE). No madge release yet supports TS 6. A lenient
     local `npm install` masked this — CI's `npm ci` is the source of truth.
   - Unblock path: bump/replace madge once it widens its TS peer range, then
     re-attempt in a follow-up dep slot.

## Verification steps

- `npm run test:openspec` → 12 passed.
- `npm run test:agent-guide` → passed.
- `npm run test:code-quality` → passed.
- `task test:changed` → the only failures (`plan-lint` #8, `docs-gen` #8) are
  **pre-existing** in this worktree (reproduced on a clean tree with the deps
  stashed), i.e. not introduced by this change.
- `task freshness:regenerate && task freshness:check` before PR.

## Deferred (not in this plan)

- **typescript 6** (blocked by madge peer range — see Order step 2).
- `eslint-plugin-astro` 1→2 and `knip` 5→6 (website / pnpm) — separate
  website-domain change; see `audit.md` for rationale.

## Conflict assessment

Conflict-free: touches only the root npm manifest + lockfile. No overlap with
the two occupied G-DEP02 slots (different packages) and no website lockfile
churn. Existing test suite preserved.
