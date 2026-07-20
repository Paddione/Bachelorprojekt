# astro-type-check — SSOT Specification

## Purpose

Typsichere Entwicklung im Astro-Website-Projekt durch kontinuierliche statische Typprüfung aller `.astro`, `.svelte` und `.ts`-Dateien mittels `astro check`.

## Requirements

### Requirement: Zero-Error TypeScript

**ID:** REQ-ASTRO-TC-001
**Status:** Required

`astro check` muss ohne Fehler (`0 errors`) durchlaufen. Warnungen und Hints dürfen vorkommen, werden aber auf 0 angestrebt.

#### Scenario: astro check passes with zero errors

- **GIVEN** the website project with all TypeScript source files
- **WHEN** running `cd website && npx astro check`
- **THEN** the output shows "0 errors"
- **AND** the process exits with code 0

### Requirement: Fixture Factory for Cockpit Types

**ID:** REQ-ASTRO-TC-002
**Status:** Required

Eine zentrale Fixture-Factory `website/src/lib/tickets/__tests__/fixtures.ts` stellt typsichere Default-Objekte für `RollupMetrics`, `FeatureNode`, `ProductNode` und `PortfolioPayload` bereit.

#### Scenario: Fixture factory provides typed defaults with overrides

- **GIVEN** a test file that needs a RollupMetrics test object
- **WHEN** the test imports `makeRollup` from the fixtures module
- **THEN** calling `makeRollup()` returns a valid RollupMetrics with all required fields
- **AND** calling `makeRollup({ awaitingDeploy: 5 })` overrides only that field

### Requirement: Check Script

**ID:** REQ-ASTRO-TC-003
**Status:** Required

`website/package.json` enthält ein `"astro:check": "astro check"` Script für lokale Entwickler.

#### Scenario: Local check script runs astro check

- **GIVEN** a developer working on the website project
- **WHEN** running `cd website && pnpm astro:check`
- **THEN** astro check runs and reports any TypeScript errors

### Requirement: CI Advisory Gate

**ID:** REQ-ASTRO-TC-004
**Status:** Required

Ein neuer CI-Job `Astro TypeScript Check` in `.github/workflows/ci.yml` führt `astro check` bei jedem PR aus.

#### Scenario: CI job passes on a clean PR

- **GIVEN** a pull request with zero TypeScript errors
- **WHEN** CI runs
- **THEN** the "Astro TypeScript Check" job passes

<!-- merged from change delta astro-type-check.md on 2026-06-28 -->