# astro-type-check — Specification

## Purpose

Typsichere Entwicklung im Astro-Website-Projekt durch kontinuierliche statische Typprüfung aller `.astro`, `.svelte` und `.ts`-Dateien mittels `astro check`.

## Requirements

### Requirement: Zero-Error TypeScript

**ID:** REQ-ASTRO-TC-001
**Status:** Required

`astro check` muss ohne Fehler (`0 errors`) durchlaufen. Warnungen und Hints dürfen vorkommen, werden aber auf 0 angestrebt.

**Scenarios:**

```
GIVEN the website project with all TypeScript source files
WHEN running `cd website && npx astro check`
THEN the output shows "0 errors"
AND the process exits with code 0
```

### Requirement: Fixture Factory for Cockpit Types

**ID:** REQ-ASTRO-TC-002
**Status:** Required

Eine zentrale Fixture-Factory `website/src/lib/tickets/__tests__/fixtures.ts` stellt typsichere Default-Objekte für `RollupMetrics`, `FeatureNode`, `ProductNode` und `PortfolioPayload` bereit.

**Scenarios:**

```
GIVEN a test file that needs a RollupMetrics test object
WHEN the test imports `makeRollup` from the fixtures module
THEN calling `makeRollup()` returns a valid RollupMetrics with all required fields
AND calling `makeRollup({ awaitingDeploy: 5 })` overrides only that field
```

```
GIVEN that cockpit-types.ts adds a new required field to FeatureNode
WHEN a developer updates makeFeature() in fixtures.ts
THEN TypeScript immediately flags all callers that pass conflicting overrides
AND tests that use makeFeature() without overriding the new field still compile
```

### Requirement: Check Script

**ID:** REQ-ASTRO-TC-003
**Status:** Required

`website/package.json` enthält ein `"check": "astro check"` Script für lokale Entwickler.

**Scenarios:**

```
GIVEN a developer working on the website project
WHEN running `cd website && pnpm check`
THEN astro check runs and reports any TypeScript errors
```

### Requirement: CI Advisory Gate

**ID:** REQ-ASTRO-TC-004
**Status:** Required

Ein neuer CI-Job `Astro TypeScript Check` in `.github/workflows/ci.yml` führt `astro check` bei jedem PR aus.

**Scenarios:**

```
GIVEN a pull request that introduces a TypeScript error in an Astro component
WHEN CI runs
THEN the "Astro TypeScript Check" job fails and is visible in the PR status
AND the failure does not block auto-merge (advisory, non-required)
```

```
GIVEN a pull request with zero TypeScript errors
WHEN CI runs
THEN the "Astro TypeScript Check" job passes
```
