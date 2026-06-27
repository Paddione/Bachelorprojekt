# ci-speed

## Purpose

Die CI-Pipeline in `.github/workflows/ci.yml` wird um ~2–3 Minuten beschleunigt durch drei isolierte Maßnahmen: redundante `apt-get`-Pakete im `offline-tests`-Job entfernen, einen fehlenden npm-Cache-Slot für `scripts/factory` ergänzen, und den Website-Build zwischen `vitest-website` und `bundle-budget` per Artifact teilen statt ihn doppelt zu bauen.

## Requirements

### Requirement: apt-get-Bloat aus offline-tests entfernen

The system SHALL NOT install redundant `apt-get` packages in the `offline-tests` job of `.github/workflows/ci.yml` that are not exercised by the BATS suite. Required tools (curl, git, jq, kubectl, bats, node, etc.) stay; cosmetic or unused packages are removed.

### Requirement: Dedizierter npm-Cache-Slot für scripts/factory

The system SHALL configure a separate `actions/cache@v4` slot for `scripts/factory` keyed on its own lockfile (`scripts/factory/package-lock.json` if present, else `package-lock.json` at the root filtered to factory deps), so the factory test layer does not bust the website pnpm cache.

### Requirement: Website-Dist als Artifact zwischen vitest-website und bundle-budget teilen

The system SHALL have the `vitest-website` job upload the website dist (or its relevant build artifacts) via `actions/upload-artifact@v4`, and the `bundle-budget` job download that artifact via `actions/download-artifact@v4` instead of re-running the website build. `bundle-budget` MUST declare `needs: vitest-website` to enforce the serial dependency.

#### Scenario: bundle-budget nutzt den geteilten Dist-Artifact

- **GIVEN** `vitest-website` ist grün und hat den Website-Dist hochgeladen
- **WHEN** `bundle-budget` startet
- **THEN** lädt es den Dist-Artifact herunter statt `pnpm build` erneut auszuführen
- **AND** der Branch-Protection required check `bundle-budget` bleibt grün

#### Scenario: Kein Path-Filter auf required-check-Jobs

- **GIVEN** die Branch-Protection listet `offline-tests` und `vitest-website` als required
- **WHEN** die CI-Workflow-YAML inspiziert wird
- **THEN** enthalten diese Jobs keinen `paths:`-Filter, der sie auf bestimmten Code-Pfaden überspringen würde

<!-- from archive/2026-06-27-ci-speed/tasks.md lines 1-50 + design doc -->
