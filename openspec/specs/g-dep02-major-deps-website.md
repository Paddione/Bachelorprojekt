# g-dep02-major-deps-website


<!-- merged from change delta g-dep02-major-deps-website.md on 2026-06-27 -->

## Purpose

### Requirement: Website Major-Dependency Drift Budget

The website package SHALL carry no more than 3 runtime/dev dependencies that are
a full major version behind their latest stable release. The budget SHALL be
enforced by an offline vitest gate that reads `website/package.json` and makes no
package-registry network calls, so it runs deterministically inside the existing
"Vitest (website)" CI job.

#### Scenario: Drift budget enforced offline in CI

- **GIVEN** `website/package.json`
- **WHEN** the G-DEP02 vitest gate compares each tracked dependency against its
  target major version (the latest stable major recorded at the ticket baseline)
- **THEN** the number of dependencies still behind their target major SHALL be ≤ 3
- **AND** the gate SHALL complete without any registry network request

#### Scenario: Alpha-pinned session-replay deps may be deferred as documented exceptions

- **GIVEN** `rrweb` and `rrweb-player` are pinned to pre-release (alpha) builds
- **WHEN** a stable migration is deferred within an implementation slice
- **THEN** they MAY remain behind their stable target as accepted, documented
  exceptions
- **AND** the total behind-count SHALL still be ≤ 3
## Requirements

