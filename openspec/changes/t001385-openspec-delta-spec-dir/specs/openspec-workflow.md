## MODIFIED Requirements

### Requirement: Propose erstellt vollständiges Change-Skeleton

The system SHALL create a new change directory under `openspec/changes/<slug>/` with
`proposal.md`, `tasks.md`, a Delta-Spec, und einer `.ticket`-Datei, und SHALL den
zugeordneten Ticket-Status auf `planning` setzen. Der Delta-Spec-Dateiname hängt vom
Change-Typ ab: für eine **neue Capability** ist er `specs/<slug>.md` (`<slug>` = Change-Slug,
Default ohne `--target-spec`). Für ein **Sub-Feature einer bestehenden Capability** ist er
`specs/<parent-slug>.md` (`<parent-slug>` = Slug der betroffenen SSOT-Spec unter
`openspec/specs/`, übergeben via `--target-spec <parent-slug>`) — siehe CLAUDE.md
"Delta-Spec-Konvention (T001304)". Ohne `--target-spec` fällt der Delta-Spec-Dateiname auf
den Change-Slug zurück.

#### Scenario: Erfolgreicher propose-Aufruf für eine neue Capability

- **GIVEN** kein Change mit dem Slug existiert noch in `openspec/changes/`
- **AND** der Change betrifft keine bestehende Capability unter `openspec/specs/`
- **WHEN** `task openspec:propose -- <slug> --ticket <ext-id>` (ohne `--target-spec`)
  ausgeführt wird
- **THEN** wird `openspec/changes/<slug>/` mit `proposal.md`, `tasks.md`,
  `specs/<slug>.md` und `.ticket` angelegt
- **AND** `.ticket` enthält die übergebene `<ext-id>`
- **AND** der Ticket-Status wird auf `planning` gesetzt

#### Scenario: Erfolgreicher propose-Aufruf für ein Sub-Feature einer bestehenden Capability

- **GIVEN** kein Change mit dem Slug existiert noch in `openspec/changes/`
- **AND** `openspec/specs/<parent-slug>.md` existiert bereits als SSOT-Spec einer
  bestehenden Capability
- **WHEN** `task openspec:propose -- <slug> --ticket <ext-id> --target-spec <parent-slug>`
  ausgeführt wird
- **THEN** wird `openspec/changes/<slug>/` mit `proposal.md`, `tasks.md`,
  `specs/<parent-slug>.md` (Parent-SSOT-Slug, NICHT Change-Slug) und `.ticket` angelegt
- **AND** `.ticket` enthält die übergebene `<ext-id>`
- **AND** der Ticket-Status wird auf `planning` gesetzt

#### Scenario: Doppelter Slug wird abgelehnt

- **GIVEN** `openspec/changes/my-feature/` existiert bereits
- **WHEN** `task openspec:propose -- my-feature --ticket T000999` ausgeführt wird
- **THEN** schlägt der Befehl mit einer Fehlermeldung fehl, ohne bestehende Dateien zu
  überschreiben

#### Scenario: Fehlende Pflichtargumente

- **GIVEN** kein Change existiert
- **WHEN** `propose` ohne `--ticket`-Argument aufgerufen wird
- **THEN** schlägt der Befehl mit Exit-Code ungleich 0 und einer Fehlermeldung fehl

## ADDED Requirements

### Requirement: Kanonischer /opsx:propose-Flow respektiert die Delta-Spec-Konvention für Sub-Features

The system SHALL, when the canonical `/opsx:propose` workflow (as documented in
`.claude/skills/openspec-propose/SKILL.md` and mirrored in
`.claude/commands/opsx/propose.md` and `.opencode/commands/opsx-propose.md`) creates the
`specs` artifact for a change, check whether the change is a sub-feature of an existing
capability under `openspec/specs/` (via `openspec/component-map.yaml` or explicit user
input) BEFORE writing the file, and SHALL, if it is, write the Delta-Spec to
`openspec/changes/<slug>/specs/<parent-slug>.md` (Parent-SSOT-Slug) instead of the
`outputPath` filename returned by `openspec instructions specs --change "<name>" --json`
(which always defaults to the change slug).

#### Scenario: /opsx:propose für ein Sub-Feature schreibt die Delta-Spec unter dem Parent-SSOT-Slug

- **GIVEN** ein Change `add-target-spec-check` soll das bestehende `openspec-workflow`
  SSOT-Spec erweitern
- **WHEN** der Agent `.claude/skills/openspec-propose/SKILL.md` Schritt 4a für das
  `specs`-Artefakt ausführt
- **THEN** identifiziert der Agent `openspec-workflow` als Parent-Capability
- **AND** schreibt die Delta-Spec nach `openspec/changes/add-target-spec-check/specs/openspec-workflow.md`
- **AND NICHT** nach `openspec/changes/add-target-spec-check/specs/add-target-spec-check.md`

#### Scenario: /opsx:propose für eine neue Capability nutzt weiterhin den Change-Slug

- **GIVEN** ein Change `brand-new-capability` betrifft keine bestehende Capability unter
  `openspec/specs/`
- **WHEN** der Agent `.claude/skills/openspec-propose/SKILL.md` Schritt 4a für das
  `specs`-Artefakt ausführt
- **THEN** bleibt der von `outputPath` gelieferte Dateiname unverändert
  (`specs/brand-new-capability.md`)
