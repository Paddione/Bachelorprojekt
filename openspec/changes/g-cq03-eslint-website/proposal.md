# Proposal: g-cq03-eslint-website

_Ticket: T001204_

## Why

The `website/` package (Astro 6, Svelte 5, TypeScript 6, React 19, Tailwind 4) ships
**without any ESLint configuration** — no `eslint.config.js` and no `.eslintrc*`. The only
static quality signal today is `vitest` (unit tests) and `astro check` (type-level). There is
no linter catching unused variables, accidental `any`, unreachable code, `no-undef`, Svelte
reactivity foot-guns, or Astro template mistakes. Code-quality initiative G-CQ03 closes this
gap: introduce a flat-config ESLint setup, drive the warning count to **0**, and wire a
**fail-closed CI gate** so the count cannot silently regress.

Because there is no baseline, every existing latent issue surfaces at once. The plan therefore
fixes all findings as part of the same change rather than freezing a debt baseline — the goal
explicitly is **0 warnings**, not "0 new warnings".

## What

- Add ESLint 9 flat config (`website/eslint.config.js`) covering TypeScript, Svelte, and Astro
  via `typescript-eslint`, `eslint-plugin-svelte`, and `eslint-plugin-astro`.
- Add the dev dependencies to `website/package.json` plus a `lint` (and `lint:fix`) script.
- Run the linter, auto-fix what is auto-fixable, and resolve the remaining findings by hand
  until `eslint . --max-warnings 0` exits clean.
- Add a fail-closed CI gate that runs the linter on every PR as part of a required check.
- Add a failing-first BATS regression (`tests/spec/ci-cd.bats`) that asserts the config exists,
  the `lint` script exists, the CI gate is present, and (when deps are installed) ESLint runs
  with zero warnings.

## Impact

- **New file:** `website/eslint.config.js`, `tests/spec/ci-cd.bats`.
- **Modified:** `website/package.json` (devDeps + scripts), `website/pnpm-lock.yaml`,
  `.github/workflows/ci.yml` (gate step), and whichever source files carry findings.
- **Risk:** peer-range friction between `typescript-eslint` and TypeScript 6 / Svelte 5 — pin
  the newest stable plugin releases and verify the install resolves under pnpm before fixing
  warnings. No runtime/behaviour change: linting is build-time only.
- **Out of scope:** Prettier/format-on-save, `brett/` (already has its own TypeScript gate),
  and reformatting unrelated code.
