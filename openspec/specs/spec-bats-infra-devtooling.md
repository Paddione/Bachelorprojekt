# spec-bats-infra-devtooling

## Purpose

_Purpose fehlt — beim nächsten inhaltlichen Delta zu spec-bats-infra-devtooling ergänzen._

## Requirements

### Requirement: BATS-Spec-Abdeckung für Plattform-Infrastruktur & DevTooling

Das System SOLL für jede der 15 folgenden OpenSpec-SSOT-Specs eine zugehörige
BATS-Testdatei unter `tests/spec/<slug>.bats` bereitstellen, die reale
Assertions gegen die im Repo vorhandenen Artefakte (Skill-Dateien, Scripts,
Manifeste) prüft — nicht nur Platzhalter-Tests:

- `agent-skills`
- `agentic-tooling-quality-goals`
- `astro-type-check`
- `e2e-test-infrastructure`
- `grilling-flow`
- `llm-local-dev`
- `llm-pipeline`
- `mcp-gateway`
- `mcp-skill-integration`
- `monitoring-alerts`
- `openspec-pgvector`
- `openspec-upstream-cli`
- `security`
- `sidekick-assistant`
- `archive`

#### Scenario: BATS-Datei existiert und ist grün

- **GIVEN** eine der 15 oben gelisteten Spec-Slugs
- **WHEN** `bats tests/spec/<slug>.bats` ausgeführt wird
- **THEN** die Datei existiert unter `tests/spec/<slug>.bats` und alle
  enthaltenen `@test`-Blöcke laufen grün durch

#### Scenario: Konvention — ein File pro SSOT-Spec

- **GIVEN** eine neue Spec-BATS-Datei soll ergänzt werden
- **WHEN** der Slug bereits eine SSOT-Spec unter `openspec/specs/<slug>.md` hat
- **THEN** die Tests werden in `tests/spec/<slug>.bats` ergänzt (nicht in
  einer neuen `tests/local/FA-XY-*.bats`-Datei)

<!-- merged from change delta spec-bats-infra-devtooling.md (0ca8d40aa235) -->