# Design: fix-e2e-suite-flakes

## Architecture & Integration Details

### 1. FA-53 System-Test Failure Loop Spec
- **Dateipfad:** `tests/e2e/specs/fa-53-systemtest-failure-loop.spec.ts`
- **Pfade korrigieren:** `/admin/systemtest/board` → `/sdlc/systemtest/board`, `/api/admin/systemtest/board` → `/sdlc/api/systemtest/board`
- **Feature-Flag Support:** Wenn `SYSTEMTEST_LOOP_ENABLED` auf dem Test-Cluster nicht aktiv ist (`isSystemtestLoopEnabled() === false`), leitet die Astro-Page auf `/admin?msg=systemtest-loop-disabled` weiter. Der Test sollte diesen Status erkennen und bei deaktiviertem Flag den UI-Check überspringen (bzw. auf die Umleitung prüfen), während die API `sdlc/api/systemtest/board` immer getestet werden kann.

### 2. FA-21 Billing Invoice Lifecycle
- **Dateipfad:** `tests/e2e/helpers/billing.ts`
- **Finalisierung prüfen:** Falls `/api/admin/billing/${id}/send` fehlschlägt oder Rechnungsstatus unklar ist, Status vor Zahlungsaufrufen verifizieren.

### 3. Agent Guide Walkthrough & PortalSidekick Helper
- **Dateipfad:** `tests/e2e/lib/agent-guide.ts` & `tests/e2e/specs/agent-guide-walkthrough.spec.ts`
- Klick- und Scrolling-Interaktionen robuster absichern (`scrollIntoViewIfNeeded`, `waitFor`).
