## ADDED Requirements

### Requirement: Spec-BATS-Grundabdeckung Billing & Business Workflows

Das System SOLL für die Billing- und Business-Workflow-Spezifikationen (`billing-pipeline`,
`datev-export`, `newsletter-system`, `questionnaire-system`) je eine initiale BATS-Testdatei
unter `tests/spec/<slug>.bats` bereitstellen, um eine messbare Testgrundlage für spätere
Detail-Tests zu verankern.

#### Scenario: Initiale BATS-Datei existiert je Spec

- **GIVEN** eine der vier Billing-/Business-Workflow-Specs in `openspec/specs/`
- **WHEN** die zugehörige `tests/spec/<slug>.bats`-Datei ausgeführt wird
- **THEN** enthält sie mindestens einen `@test`-Block und läuft grün durch
