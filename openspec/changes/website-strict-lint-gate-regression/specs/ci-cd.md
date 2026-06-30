## ADDED Requirements

### Requirement: website ESLint fail-closed gate stays enforced

The `website/` ESLint flat config (`website/eslint.config.js`) SHALL set
`@typescript-eslint/no-explicit-any` and `@typescript-eslint/no-unused-vars` to `error`
severity, and `website/package.json`'s `lint`/`lint:fix` scripts SHALL invoke ESLint with
`--max-warnings 0`, so that any future warning regression fails the PR-gate ESLint CI step
("Run ESLint (--max-warnings 0 fail-closed gate)" in the `vitest-website` job) instead of
being silently downgraded to a non-blocking warning.

#### Scenario: lint script enforces zero warnings

- **GIVEN** `website/package.json` is checked out
- **WHEN** the `scripts.lint` entry is read
- **THEN** it invokes `eslint . --max-warnings 0`

#### Scenario: no-explicit-any and no-unused-vars are errors, not warnings

- **GIVEN** `website/eslint.config.js` is checked out
- **WHEN** the `rules` block is read
- **THEN** `@typescript-eslint/no-explicit-any` and `@typescript-eslint/no-unused-vars` are both
  set to `'error'` (the latter with `argsIgnorePattern: '^_'` / `varsIgnorePattern: '^_'`)

#### Scenario: ESLint runs clean

- **GIVEN** `website/` dependencies are installed (`pnpm install`)
- **WHEN** `pnpm --prefix website lint` runs
- **THEN** it exits 0 with zero errors and zero warnings
