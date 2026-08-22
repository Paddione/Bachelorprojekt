## MODIFIED Requirements
### Requirement: PR-Gate — Vitest (website) mit `--changed` Smart-Selection

The system SHALL run Vitest unit tests on every non-draft PR against `main` using
`pnpm vitest run --changed --coverage` (mirrors the local `task test:changed` smart
selection) and SHALL keep the `Vitest line coverage gate (>= 60% on src/lib)` as a
required check that reports green on chore / config-only PRs even when no `website/`
files were touched.

The `vitest-website` job SHALL stay present and required on every PR (no job-level
path filter) so branch protection's `Vitest (website)` check always reports — the
smart selection happens inside the job via a step-level diff check: when no files
under `components/website/` were touched, expensive steps (`pnpm install`, `astro:check`,
`knip`, `vitest`) SHALL be skipped, allowing the job to finish green in under 10 seconds.

#### Scenario: Chore-PR ohne website-Änderungen nutzt Fast-Exit
- **GIVEN** ein PR ändert nur `openspec/` und `AGENTS.md` (keine Datei unter `components/website/`)
- **WHEN** der `vitest-website`-Job den Diff-Filter gegen `origin/main` ausführt
- **THEN** setzt der Filter `run_website=false`
- **THEN** werden `pnpm install`, `vitest`, `astro:check`, `knip` und `Vitest line coverage gate` übersprungen
- **THEN** meldet der Job `Vitest (website)` sofort Success (Exit 0) für GitHub Branch Protection

#### Scenario: Website-Feature-PR führt vollständige Suite aus
- **GIVEN** ein PR ändert `components/website/src/lib/auth/magic-link.ts`
- **WHEN** der `vitest-website`-Job den Diff-Filter gegen `origin/main` ausführt
- **THEN** setzt der Filter `run_website=true`
- **THEN** werden Dependencies installiert und `vitest run --changed`, `astro:check` und `knip` ausgeführt

