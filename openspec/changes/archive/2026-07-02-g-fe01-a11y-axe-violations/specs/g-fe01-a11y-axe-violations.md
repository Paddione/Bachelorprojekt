## ADDED Requirements

### Requirement: a11y axe-core gate on core routes (0 critical/serious)

The website SHALL expose its core routes for both brands with **zero**
axe-core violations of impact `critical` or `serious`, verified by an
automated Playwright + `@axe-core/playwright` scan. Violations of impact
`minor` or `moderate` are out of scope for this gate. Brand selection in the
scan SHALL be derived from the `PROD_DOMAIN` environment value (no hardcoded
brand-domain literals in the test code).

The core route set SHALL be:

- mentolder (`PROD_DOMAIN` != `korczewski.de`): `/`, `/ueber-mich`,
  `/kontakt`, and a representative `[service]` route (`/coaching`).
- korczewski (`PROD_DOMAIN` == `korczewski.de`): `/` (Kore homepage).

#### Scenario: mentolder core routes are free of critical/serious violations

- **GIVEN** the Playwright `website` project runs against a mentolder base URL
- **WHEN** `tests/e2e/specs/a11y-axe.spec.ts` scans `/`, `/ueber-mich`,
  `/kontakt`, and `/coaching` with `@axe-core/playwright`
- **THEN** the count of violations with impact `critical` or `serious` is 0 for
  every scanned route

#### Scenario: korczewski Kore homepage is free of critical/serious violations

- **GIVEN** the Playwright `website` project runs against a korczewski base URL
- **WHEN** `tests/e2e/specs/a11y-axe.spec.ts` scans `/` with
  `@axe-core/playwright`
- **THEN** the count of violations with impact `critical` or `serious` is 0

#### Scenario: a11y scan participates in the nightly e2e suite

- **GIVEN** `tests/e2e/playwright.config.ts` lists `**/a11y-axe.spec.ts` in the
  `website` project `testMatch`
- **WHEN** the nightly `e2e.yml` workflow runs the Playwright suite against
  `web.mentolder.de` and `web.korczewski.de`
- **THEN** the a11y scan executes for both brands without additional wiring
