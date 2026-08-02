---
title: "e2e-testdata-leak — Implementation Plan"
ticket_id: T002096
domains: [ci-cd, testing]
status: active
file_locks: []
shared_changes: false
batch_id: null
parent_feature: null
depends_on_plans: []
---

# e2e-testdata-leak — Implementation Plan

## File Structure

```
.github/workflows/e2e.yml           (changed — add always()-guarded post-run purge step)
tests/spec/ci-cd.bats               (changed — 2 new @test cases, RED before fix)
openspec/specs/ci-cd.md             (changed — new "Nightly-E2E Post-Run-Purge-Fallback" requirement, already applied on this branch as the delta in openspec/changes/e2e-testdata-leak/specs/ci-cd.md)
website/src/data/test-inventory.json (changed — regenerated via task test:inventory after adding the bats tests)
```

S1-Budget-Hinweis: `.github/workflows/e2e.yml` (186 Zeilen) und
`tests/spec/ci-cd.bats` (526 Zeilen) sind YAML- bzw. BATS-Dateien — ihre
Extensions sind in `docs/code-quality/gates.yaml` (`s1.limits`) nicht gelistet.
Kein S1-Budget anwendbar, keine Baseline-Einträge betroffen (`jq` bestätigt
`nicht-baselined` für beide Dateien — erwartungsgemäß, da S1 sie gar nicht
scoped).

## Root Cause (aus Investigation, T002096)

`tickets.fn_purge_test_data()` (`scripts/one-shot/purge-fn-v6.sql`) deleted
`inbox_items WHERE is_test_data=true` korrekt, und Playwrights
`globalSetup`/`globalTeardown` (`tests/e2e/specs/global-db-cleanup.ts` +
`global-db-cleanup-teardown.ts`) rufen den Purge-Endpoint korrekt auf. Die
Lücke: `.github/workflows/e2e.yml` ruft `npx playwright test` **direkt** auf
(nicht über `task test:e2e`, das einen Pre-/Post-Run-curl-Purge als
Defense-in-Depth hat — siehe `Taskfile.yml` Task `test:e2e`, Zeilen ~1082–1104).
Der CI-Job hat `timeout-minutes: 45`; überschreitet der Playwright-Lauf dieses
Limit, killt GitHub Actions den Prozess samt in-process `globalTeardown` bevor
er feuert — jede in diesem Lauf erzeugte `is_test_data=true`-Zeile bleibt in
Prod liegen. Beobachtete leaked Zeilen (mentolder `inbox_items.id=2164`,
korczewski `inbox_items.id=944`, beide `created_at` im nächtlichen
03:00-UTC-Fenster) stammen aus dem Kontaktformular-Test
(`fa-10-website.spec.ts` / `fa-20-finalize.spec.ts`).

## Tasks

### Task 1: Failing-Test-Step (RED) — bats-Assertions für den Post-Run-Purge-Step

Die zwei `@test`-Fälle in `tests/spec/ci-cd.bats` (bereits committed auf
diesem Branch) prüfen, dass `.github/workflows/e2e.yml` einen
`always()`-guarded Schritt enthält, der `purge-all-test-data` mit
`X-Cron-Secret` gegen `matrix.website_url` aufruft. Auf dem aktuellen Stand
von `e2e.yml` (kein Post-Run-Purge-Schritt) schlagen beide fehl.

```bash
tests/unit/lib/bats-core/bin/bats tests/spec/ci-cd.bats --filter "G-E2E02"
# expected: FAIL (red — e2e.yml hat noch keinen always()-guarded purge-Schritt)
```

### Task 2: Fix-Step (GREEN) — Post-Run-Purge-Step in e2e.yml ergänzen

In `.github/workflows/e2e.yml`, im Job `playwright`, **nach** dem Step "Run
Playwright suite against ${{ matrix.website_url }}" (id: `playwright`) und
**vor** dem Step "Ingest Playwright results into website" einen neuen Step
einfügen:

```yaml
      - name: Post-run test-data purge (defense-in-depth)
        # Runs regardless of the Playwright step's outcome — including when
        # the job's timeout-minutes limit kills the process before its own
        # globalTeardown hook (tests/e2e/specs/global-db-cleanup-teardown.ts)
        # can fire. Mirrors the Taskfile `test:e2e` target's post-run curl
        # purge (Taskfile.yml, task test:e2e) as CI-side defense-in-depth,
        # since this workflow calls `npx playwright test` directly instead of
        # going through that Taskfile wrapper. Best-effort (|| true): a
        # transient failure here must not mask the real Playwright result.
        # G-E2E02 / T002096.
        if: always() && steps.gate.outputs.skip != 'true'
        working-directory: tests/e2e
        env:
          WEBSITE_URL: ${{ matrix.website_url }}
          CRON_SECRET: ${{ secrets.CRON_SECRET }}
        run: |
          if [ -z "${CRON_SECRET}" ]; then
            echo "::warning::CRON_SECRET not set; skipping post-run purge."
            exit 0
          fi
          echo "[post-run-purge] POST ${WEBSITE_URL}/api/admin/systemtest/purge-all-test-data"
          curl -fsS -X POST -H "X-Cron-Secret: ${CRON_SECRET}" \
            "${WEBSITE_URL}/api/admin/systemtest/purge-all-test-data" || true
          echo
```

Nach diesem Schritt erneut ausführen, jetzt GREEN erwartet:

```bash
tests/unit/lib/bats-core/bin/bats tests/spec/ci-cd.bats --filter "G-E2E02"
# expected: PASS
```

### Task 3: Sofort-Remediation der 2 leaked Prod-Zeilen dokumentieren (Rollout-Schritt, kein Code)

Kein Code-Task — Hinweis für den Merge/Rollout: nach Merge dieses Fixes die
2 aktuell leaked Zeilen manuell purgen (out of scope für die Implementierung,
siehe Proposal "What"):

```bash
curl -fsS -X POST -H "X-Cron-Secret: ${CRON_SECRET}" \
  https://web.mentolder.de/api/admin/systemtest/purge-all-test-data
curl -fsS -X POST -H "X-Cron-Secret: ${CRON_SECRET}" \
  https://web.korczewski.de/api/admin/systemtest/purge-all-test-data
```

Alternativ: den nächsten nächtlichen `e2e`-Lauf abwarten — dessen
`globalSetup`-Pre-Purge (`tests/e2e/specs/global-db-cleanup.ts`) räumt die
liegen gebliebenen Zeilen ebenfalls auf.

### Task 4: Final Verification

```bash
task test:inventory
git add website/src/data/test-inventory.json
task test:changed
task freshness:regenerate
task freshness:check
```
