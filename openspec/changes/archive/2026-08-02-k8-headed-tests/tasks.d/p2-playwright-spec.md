# Partial p2 — Playwright-Headed-Test-Spezifikation

## Scope
Neue Playwright-Test-Spezifikation für agentische Headed-Tests.

## Task List
- [x] **2.1** `tests/e2e/specs/k8-headed-verify.spec.ts`: agenten-lesbare Test-Parameter
- [x] **2.2** Headed-Modus (`headless: false`) für visuelle Verifikation
- [x] **2.3** Vision-Integration: Screenshot → Port 8094 → Validierung
- [x] **2.4** Explizit KEIN CI-Tag — dieser Test läuft nur manuell/agentisch

## Verification
```bash
npx playwright test tests/e2e/specs/k8-headed-verify.spec.ts --headed --dry-run
```
