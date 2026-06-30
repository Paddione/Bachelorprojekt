# Proposal: website-strict-lint-gate-regression

_Ticket: T001337_

## Why

G-CQ03 (T001204, PR #2146, `done`) shipped `website/`'s ESLint setup with a fail-closed
`--max-warnings 0` gate — 0 warnings at merge time. Two days later, PR #2296 (commit
`02eb3da8`, "chore: ts hygiene configs", sub-commit "fix(website): relax legacy TS lint
gates") silently removed `--max-warnings 0` from `website/package.json`'s `lint`/`lint:fix`
scripts and set `noUnusedLocals`/`noUnusedParameters` to explicit `false` in
`website/tsconfig.json`, while only downgrading `no-explicit-any`/`no-unused-vars` from `off`
to `warn` (not `error`). The CI step still named "Run ESLint (--max-warnings 0 fail-closed
gate)" (`.github/workflows/ci.yml`, `vitest-website` job) has not enforced what its own name
claims since that commit. Verified now: `website/` carries 431 ESLint warnings and `pnpm lint`
exits 0 regardless.

The regression is independently confirmed by a pre-existing, currently-RED test:
`tests/spec/ci-cd.bats` — `"G-CQ03: website package.json has a lint script with
--max-warnings 0"` and `"G-CQ03: ESLint runs clean (0 warnings) when deps are installed"` both
fail on `main` today.

Out of scope / not affected: the separate `astro-check` CI job ("Astro TypeScript Check",
REQ-ASTRO-TC-004 in `openspec/specs/astro-type-check.md`) already gates real TypeScript errors
independently of ESLint and currently passes (0 errors) — this bug is scoped to the ESLint
warnings gate only, no new TS-error CI job is needed.

## What

- Restore `website/eslint.config.js`'s `@typescript-eslint/no-explicit-any` and
  `@typescript-eslint/no-unused-vars` to `'error'` (their pre-regression-attempt intent —
  PR #2296 only got as far as `'warn'` before giving up).
- Re-enable `noUnusedLocals`/`noUnusedParameters` in `website/tsconfig.json`.
- Fix all resulting findings in `website/` source (currently 431 ESLint warnings + ~233
  `astro check` hints, expected to mostly overlap) — no behavior change, pure
  cleanup/typing.
- Restore `--max-warnings 0` on `website/package.json`'s `lint`/`lint:fix` scripts so the
  existing CI step actually does what its name says.
- Confirm `tests/spec/ci-cd.bats` G-CQ03 cases go GREEN.

## Impact

- **Modified:** `website/eslint.config.js`, `website/tsconfig.json`, `website/package.json`,
  and whichever `website/src/**` / `website/tests/**` files carry findings.
- **Not modified:** `.github/workflows/ci.yml` (the gate step already exists and is correctly
  wired — only the script it calls was defanged), `tests/spec/ci-cd.bats` (test already
  exists and is correct, no edit needed — it just needs to turn green).
- **Risk:** none beyond a large mechanical diff — every change is either deleting genuinely
  unused code/imports or narrowing `any` to concrete/`unknown` types based on existing usage;
  no runtime behavior changes. Tests must stay green throughout as the behavior-preservation
  check.
- **Out of scope:** any subproject other than `website/` (VideoVault, brett, mentolder-web,
  mediaviewer-widget, packages/videovault-player, studio-server — separately scoped, much
  larger debt, decided out-of-scope for this fix); adopting type-aware/`strict-type-checked`
  ESLint rules beyond what was already configured pre-regression.
