## ADDED Requirements

### Requirement: Nightly-E2E Post-Run-Purge-Fallback

The `e2e` workflow SHALL run an `if: always()` post-run test-data purge step
after the Playwright suite step, posting to
`/api/admin/systemtest/purge-all-test-data` with the `X-Cron-Secret` header
against the matrix `website_url`, so that `is_test_data=true` rows created
during a run that crashes or is killed before Playwright's own
`globalTeardown` hook fires (e.g. the job's `timeout-minutes` limit) do not
remain in production (G-E2E02, T002096).

#### Scenario: Post-Run-Purge läuft auch nach Timeout/Crash des Playwright-Steps

- **GIVEN** der `e2e`-Workflow ruft `npx playwright test` direkt auf (nicht über
  `task test:e2e`, das einen eigenen Pre-/Post-Run-curl-Purge als
  Defense-in-Depth hat) und der Job hat ein `timeout-minutes`-Limit
- **WHEN** der Playwright-Step durch den Job-Timeout gekillt wird oder anderweitig
  abstürzt, bevor sein in-process `globalTeardown`-Hook feuert
- **THEN** läuft danach trotzdem ein `if: always()`-Schritt, der
  `POST /api/admin/systemtest/purge-all-test-data` mit
  `X-Cron-Secret: ${{ secrets.CRON_SECRET }}` gegen die Matrix-`website_url`
  aufruft, sodass `is_test_data=true`-Zeilen aus einem abgebrochenen Lauf nicht
  in Prod liegen bleiben
