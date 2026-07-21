---
title: "Spec-BATS Coverage (Billing & Business Workflows)"
ticket_id: "T002011"
domains:
  - "infrastructure"
  - "tests"
status: "planned"
---
# Design Spec: Spec-BATS Coverage (Billing & Business Workflows)

## WARUM (Intent)
Aktuell fehlen automatisierte BATS-Tests für 4 zentrale Billing- und Business-Workflow-Spezifikationen. Diese Lücke reduziert die Testabdeckung im Kernbereich der Abrechnungs- und Geschäftsprozesse (Billing-Pipeline, DATEV-Export, Newsletter, Fragebögen) und erhöht das Risiko von Regressionen. Das Ziel ist es, diese Lücke durch die systematische Einführung von BATS-Tests zu schließen, sodass alle 4 Specs messbar abgedeckt sind.

## WAS (Scope)
Erstellung von BATS-Testdateien (`tests/spec/<slug>.bats`) für die folgenden 4 Spezifikationen:
1. `billing-pipeline.bats`
2. `datev-export.bats`
3. `newsletter-system.bats`
4. `questionnaire-system.bats`

Jede dieser Dateien enthält initial mindestens einen `@test`-Block (Sanity-Check), der die grundlegende Infrastruktur validiert, sodass die Testsuite sie erfasst. Dies bildet die Grundlage für spätere Detail-Tests.

## WIE (Implementation Constraints)
- **Framework:** BATS (`tests/spec/*.bats`).
- **Isolation:** Keine neuen `tests/local/FA-XY-*.bats`-Dateien. Alle Tests müssen exakt dem `<slug>` der entsprechenden Spec in `openspec/specs/` folgen.
- **Verification:** Nach der Implementierung müssen `task test:changed`, `task freshness:regenerate` und `task freshness:check` erfolgreich durchlaufen.

## ENTSCHEIDUNGEN
- Wir fassen alle 4 Specs in einem einzigen Change zusammen, da es sich um eine homogene Erweiterung der BATS-Infrastruktur handelt.
- Die initialen Tests können einfache Platzhalter oder Setup-Validierungen sein; der Fokus liegt auf der Verankerung in der CI-Test-Matrix.
