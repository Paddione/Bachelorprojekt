# Proposal: fix-e2e-suite-flakes

## Why
Die nächtliche E2E-Playwright-Testsuite (`.github/workflows/e2e.yml`) weist Flakes und Routendrift auf:
1. `specs/fa-53-systemtest-failure-loop.spec.ts` ruft `/admin/systemtest/board` und `/api/admin/systemtest/board` auf, während die Astro-Routen unter `/sdlc/systemtest/board` und `/sdlc/api/systemtest/board` liegen (führt zu 404). Zudem ist die UI hinter `SYSTEMTEST_LOOP_ENABLED` gegatet.
2. `specs/fa-21-billing.spec.ts` testet Invoice-Payments über `/api/admin/billing/${inv.id}/payments`. Bei `finalizeInvoiceViaAPI` wird `/api/admin/billing/${id}/send` aufgerufen, welches bei SMTP/Sidecar-Offline-Zustand fehlschlagen kann; wenn der Status auf `draft` verbleibt, schlägt die Zahlung mit HTTP 400 (`cannot record payment on status=draft`) fehl.
3. `specs/fa-55-lmstudio-integration.spec.ts` schlägt fehl, wenn der Live-LLM-Provider (LLM-Gateway) offline oder nicht bereit ist.

## What
1. **Routen- & Auth-Anpassung in `fa-53-systemtest-failure-loop.spec.ts`:**
   * Korrektur der Pfade auf die tatsächlichen Astro-Routen (`/sdlc/systemtest/board` bzw. `/sdlc/api/systemtest/board`).
   * Saubere Behandlung des Feature-Flags `SYSTEMTEST_LOOP_ENABLED` (Redirect auf `/admin?msg=systemtest-loop-disabled`).
2. **Robustere Finalisierung in `tests/e2e/helpers/billing.ts` & `fa-21-billing.spec.ts`:**
   * Sicherstellen, dass Test-Rechnungen vor Zahlungstests verlässlich im Status `open` sind.
3. **Resiliente Fallbacks in E2E-Hilfsfunktionen:**
   * Saubere Wartezeiten und Timeouts bei Portal-Sidekick- und Drawer-Aktionen.

_Ticket: T013029_
