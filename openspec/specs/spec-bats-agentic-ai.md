# spec-bats-agentic-ai

## Purpose

Das System SOLL BATS-Testabdeckung für die 8 agentic- und AI-Subsystem-Specs
bereitstellen, um die strukturelle Konsistenz von Agent-Frontmatter, Skill-Routing,
Review-Pipelines, Trend-Radar-Workflows und Superpowers-Redirects messbar zu verankern.

## Requirements

### Requirement: BATS-Spec-Abdeckung für Agentic & AI Subsysteme

Das System SOLL für jede der 8 folgenden OpenSpec-SSOT-Specs eine zugehörige
BATS-Testdatei unter `tests/spec/<slug>.bats` bereitstellen, die reale
Assertions gegen die im Repo vorhandenen Artefakte (Skill-Dateien, Scripts,
Workflows, Prompt-Files) prüft — nicht nur Platzhalter-Tests:

- `agentic-tooling-quality-goals`
- `coaching-sessions-polish-guide`
- `terminal-sidekick`
- `brain-foundation`
- `agentic-review`
- `agentic-trends-radar`
- `superpowers-writing-plans`
- `superpowers-executing-plans`

#### Scenario: BATS-Datei existiert und ist grün

- **GIVEN** eine der 8 oben gelisteten Spec-Slugs
- **WHEN** `bats tests/spec/<slug>.bats` ausgeführt wird
- **THEN** die Datei existiert unter `tests/spec/<slug>.bats` und alle
  enthaltenen `@test`-Blöcke laufen grün durch

#### Scenario: Konvention — ein File pro SSOT-Spec

- **GIVEN** eine neue Spec-BATS-Datei soll ergänzt werden
- **WHEN** der Slug bereits eine SSOT-Spec unter `openspec/specs/<slug>.md` hat
- **THEN** die Tests werden in `tests/spec/<slug>.bats` ergänzt (nicht in
  einer neuen `tests/local/FA-XY-*.bats`-Datei)

<!-- merged from change delta spec-bats-agentic-ai.md -->
