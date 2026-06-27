## ADDED Requirements

### Requirement: ESLint Flat-Config für website/

The system SHALL provide an ESLint 9 flat configuration at `website/eslint.config.js` that lints
TypeScript, Svelte, and Astro sources in `website/` using `typescript-eslint`,
`eslint-plugin-svelte`, and `eslint-plugin-astro`, and SHALL expose a `lint` script in
`website/package.json` that runs ESLint with `--max-warnings 0`.

#### Scenario: ESLint-Config ist vorhanden

- **GIVEN** das `website/`-Paket ist ausgecheckt
- **WHEN** `website/eslint.config.js` geprüft wird
- **THEN** existiert die Datei und exportiert ein Flat-Config-Array, das TypeScript-, Svelte-
  und Astro-Dateien abdeckt

#### Scenario: lint-Script führt ESLint mit Null-Warnings-Schwelle aus

- **GIVEN** `website/package.json` ist vorhanden
- **WHEN** der `scripts.lint`-Eintrag gelesen wird
- **THEN** ruft er ESLint mit `--max-warnings 0` auf — jede Warnung wird als Fehler gewertet

### Requirement: Null-Warnings-Zustand in website/

The system SHALL ensure that running ESLint over the `website/` package produces zero errors and
zero warnings, so that `eslint . --max-warnings 0` exits with code 0.

#### Scenario: ESLint läuft sauber durch

- **GIVEN** die `website/`-Dependencies sind installiert (`pnpm install`)
- **WHEN** `pnpm --dir website lint` ausgeführt wird
- **THEN** beendet sich ESLint mit Exit-Code 0 — keine Fehler und keine Warnungen

### Requirement: Fail-Closed CI-Gate für website-Lint

The system SHALL run the website ESLint gate on every pull request against `main` as part of a
required branch-protection check, and SHALL block the merge when ESLint reports any finding.

#### Scenario: CI-Gate blockiert Merge bei Lint-Befund

- **GIVEN** ein PR fügt `website/`-Code mit einer ESLint-Verletzung hinzu
- **WHEN** der CI-Lint-Schritt `eslint . --max-warnings 0` ausführt
- **THEN** beendet sich der Schritt mit Exit-Code ≠ 0 und der required Check schlägt fehl —
  der Merge ist blockiert

#### Scenario: CI-Gate ist in ci.yml verdrahtet

- **GIVEN** `.github/workflows/ci.yml` ist vorhanden
- **WHEN** die Datei auf einen ESLint-Aufruf im website-Job geprüft wird
- **THEN** enthält sie einen Schritt, der ESLint im `website/`-Verzeichnis mit der
  Null-Warnings-Schwelle ausführt
