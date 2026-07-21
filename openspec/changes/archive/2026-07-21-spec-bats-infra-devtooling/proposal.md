---
title: "Spec-BATS Coverage (Platform Infrastructure & DevTooling)"
ticket_id: "T002013"
domains:
  - "infrastructure"
  - "tests"
status: "planned"
---
# Design Spec: Spec-BATS Coverage (Platform Infrastructure & DevTooling)

## WARUM (Intent)
Aktuell fehlen automatisierte BATS-Tests für 15 zentrale Infrastruktur- und DevTooling-Spezifikationen. Diese Lücke reduziert die Testabdeckung im Kernbereich der Software Factory (Agent Skills, MCP, Pipeline, Security) und erhöht das Risiko von Regressionen. Das Ziel ist es, diese Lücke durch die systematische Einführung von BATS-Tests zu schließen, sodass alle 15 Specs messbar abgedeckt sind.

## WAS (Scope)
Erstellung von BATS-Testdateien (`tests/spec/<slug>.bats`) für die folgenden 15 Spezifikationen:
1. `agent-skills.bats`
2. `agentic-tooling-quality-goals.bats`
3. `astro-type-check.bats`
4. `e2e-test-infrastructure.bats`
5. `grilling-flow.bats`
6. `llm-local-dev.bats`
7. `llm-pipeline.bats`
8. `mcp-gateway.bats`
9. `mcp-skill-integration.bats`
10. `monitoring-alerts.bats`
11. `openspec-pgvector.bats`
12. `openspec-upstream-cli.bats`
13. `security.bats`
14. `sidekick-assistant.bats`
15. `archive.bats`

Jede dieser Dateien enthält initial mindestens einen `@test`-Block (z. B. einen Dummy-Test oder einen einfachen Sanity-Check), der `expected: FAIL` implementiert oder die grundlegende Infrastruktur validiert, sodass die Testsuite sie erfasst. Dies bildet die Grundlage für spätere Detail-Tests.

## WIE (Implementation Constraints)
- **Framework:** BATS (`tests/spec/*.bats`).
- **Isolation:** Keine neuen `tests/local/FA-XY-*.bats`-Dateien. Alle Tests müssen exakt dem `<slug>` der entsprechenden Spec in `openspec/specs/` folgen.
- **Fail-Step:** Der Implementierungsplan muss sicherstellen, dass pro Task oder am Ende ein Test existiert, der initial fehlschlägt und dann durch den Code-Fix (bzw. hier durch das korrekte Test-Setup) grün wird.
- **Verification:** Nach der Implementierung müssen `task test:changed`, `task freshness:regenerate` und `task freshness:check` erfolgreich durchlaufen.

## ENTSCHEIDUNGEN
- Wir fassen alle 15 Specs in einem einzigen Epic/Change zusammen, da es sich um eine homogene Erweiterung der BATS-Infrastruktur handelt.
- Die initialen Tests können einfache Platzhalter oder Setup-Validierungen sein; der Fokus liegt auf der Verankerung in der CI-Test-Matrix.
