# Proposal: e2e-testdata-leak

## Why

G-E2E02 (Health-Goal, Priorität B, `.claude/lib/goals.md`) misst die Summe aller
`is_test_data=true`-Zeilen über alle Basistabellen je Brand-DB. Baseline 2026-07-22:
2 (je 1 Zeile `public.inbox_items` in mentolder und korczewski).

Root-Cause-Investigation (2026-07-23, T002096):

- Beide leaked Zeilen sind korrekt `is_test_data=true` geflaggt (Payload:
  `name='[TEST] E2E User'`, `email='test-e2e@example.invalid'`) und stammen aus
  dem Kontaktformular-Test (`tests/e2e/specs/fa-10-website.spec.ts` /
  `fa-20-finalize.spec.ts`).
- `tickets.fn_purge_test_data()` (`scripts/one-shot/purge-fn-v6.sql`) DELETEt
  `inbox_items WHERE is_test_data=true` korrekt (Zeile 307) — die Purge-Funktion
  selbst hat **keine** Lücke für `inbox_items`.
- Playwright `globalSetup`/`globalTeardown`
  (`tests/e2e/specs/global-db-cleanup.ts` + `global-db-cleanup-teardown.ts`)
  rufen den Purge-Endpoint korrekt auf — das Wiring in
  `tests/e2e/playwright.config.ts` stimmt.
- **Echte Lücke:** Der Nightly-CI-Workflow `.github/workflows/e2e.yml` ruft
  `npx playwright test` **direkt** auf (Schritt "Run Playwright suite"), nicht
  über `task test:e2e`. Der Taskfile-Task `test:e2e` hat einen Pre-Run- **und**
  Post-Run-curl-Purge als Defense-in-Depth (`Taskfile.yml` Zeilen ~1082–1104),
  extra für den Fall, dass Playwright abstürzt oder gekillt wird, bevor
  `globalTeardown` feuert. Der CI-Job hat zusätzlich `timeout-minutes: 45`
  gesetzt — bei Überschreitung killt GitHub Actions den `npx playwright
  test`-Prozess samt in-process `globalTeardown`-Hook, **ohne** dass irgendein
  Post-Run-Purge-Fallback im Workflow existiert.
- Das ist eine **neue, andere** Lücke als T001453 (dort fehlte das
  `CRON_SECRET`-Repo-Secret komplett, wodurch der Purge-Aufruf grundsätzlich
  401/403'te — seit PR #2507 gefixt; `e2e.yml` hat inzwischen sogar einen
  Kommentar "kein `SKIP_DB_PURGE` mehr" der genau diesen alten Fix dokumentiert).
  Hier ist CRON_SECRET vorhanden und der Purge-Call funktioniert grundsätzlich —
  es fehlt nur das *Sicherheitsnetz*, wenn der Playwright-Prozess selbst
  abnormal endet.

## What

- `.github/workflows/e2e.yml`: einen `if: always()`-Schritt NACH "Run Playwright
  suite" ergänzen, der `POST /api/admin/systemtest/purge-all-test-data` mit
  `X-Cron-Secret: ${{ secrets.CRON_SECRET }}` gegen `matrix.website_url` aufruft
  — läuft unabhängig davon, ob der Playwright-Step erfolgreich, fehlgeschlagen
  oder durch den Job-Timeout gekillt wurde (`if: always()` feuert auch bei
  `cancelled`, solange der Job selbst noch läuft — bei einem harten
  Job-Timeout/Runner-Abbruch bleibt das ein Restrisiko, das aber durch den
  nächsten Lauf's `globalSetup`-Pre-Purge abgefangen wird; die primäre Lücke
  hier ist der bislang komplett fehlende Post-Run-Fallback für "Playwright
  selbst crasht/wird während der Test-Ausführung beendet, bevor sein eigenes
  `globalTeardown` läuft").
- Kein Production-Code (`website/`) wird geändert — reiner CI-Workflow-Fix.
- Manuelle Sofort-Remediation der 2 aktuell leaked Zeilen (mentolder
  `inbox_items.id=2164`, korczewski `inbox_items.id=944`) ist **nicht** Teil
  dieses Plans — sie erfolgt im Rollout des Fixes (nach Merge, per
  `curl -X POST .../purge-all-test-data` gegen beide Brands, oder automatisch
  beim nächsten E2E-`globalSetup`-Lauf).

_Ticket: T002096_
