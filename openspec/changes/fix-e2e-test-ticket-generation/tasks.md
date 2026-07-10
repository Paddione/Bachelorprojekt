## 1. Analysis
- [ ] 1.1 Analyse `tests/e2e/specs/fa-26-bug-report-form.spec.ts` auf bestehende Skip-Logik.

## 2. Implementation
- [ ] 2.1 Aktualisiere die `test.skip` Bedingung in `tests/e2e/specs/fa-26-bug-report-form.spec.ts` auf `markerAvailable()`, um in Produktionsumgebungen zu überspringen.
- [ ] 2.2 Aktualisiere die Beschreibung des `POST /api/bug-report` Testfalls zu einer spezifischeren Bezeichnung.

## 3. Verification
- [ ] 3.1 Führe die E2E-Tests lokal ohne `CRON_SECRET` aus und verifiziere, dass der Test läuft.
- [ ] 3.2 Führe die E2E-Tests lokal mit `CRON_SECRET` aus und verifiziere, dass der Test übersprungen wird.
