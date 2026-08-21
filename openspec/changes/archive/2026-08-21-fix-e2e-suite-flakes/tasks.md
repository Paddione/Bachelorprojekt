# Tasks: fix-e2e-suite-flakes

## 1. Spec & Helper Fixes
- [ ] 1.1 `tests/e2e/specs/fa-53-systemtest-failure-loop.spec.ts`: Pfade von `/admin/systemtest/board` auf `/sdlc/systemtest/board` anpassen und Flag-Handling verbessern.
- [ ] 1.2 `tests/e2e/helpers/billing.ts`: `finalizeInvoiceViaAPI` und `createTestInvoice` überprüfen und gegen unvollständige Statuswechsel absichern.
- [ ] 1.3 `tests/e2e/lib/agent-guide.ts`: Sidekick-Row-Selektoren und Scroll-Verhalten für zuverlässige CI-Läufe optimieren.

## 2. Verification & Validation
- [ ] 2.1 E2E-Dateien auf Syntax & Type-Check validieren (`npm run typecheck` / lint).
- [ ] 2.2 OpenSpec Change validieren und committen.
