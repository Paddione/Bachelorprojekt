## ADDED Requirements

### Requirement: Archive registriert neue Komponenten automatisch in config.yaml

The system SHALL, wenn `archive --create-new` (bzw. der zugrunde liegende
`applyDelta()`-Merge) eine bisher nicht existierende SSOT-Spec-Datei unter
`openspec/specs/<slug>.md` anlegt, den Slug `<slug>` automatisch und idempotent
in die `OpenSpec-Komponenten`-Liste von `openspec/config.yaml` eintragen, sodass
`checkConfigDrift()` (T001304) direkt danach ohne manuellen Follow-up-Commit grün
ist. Für Deltas gegen eine bereits existierende SSOT-Spec (MODIFIED/REMOVED/RENAMED)
SHALL `config.yaml` unverändert bleiben.

#### Scenario: Archive einer wirklich neuen Komponente registriert sie automatisch

- **GIVEN** ein Change mit einem Delta-Spec, dessen Ziel-SSOT `openspec/specs/<slug>.md`
  noch nicht existiert
- **WHEN** `scripts/openspec.sh archive <change-slug> --create-new` ausgeführt wird
- **THEN** wird `openspec/specs/<slug>.md` neu angelegt
- **AND** `<slug>` erscheint danach in `openspec/config.yaml`'s `OpenSpec-Komponenten`-Liste
- **AND** `bash scripts/openspec.sh validate` bzw. `checkConfigDrift()` meldet für `<slug>` keinen Fehler mehr

#### Scenario: Wiederholtes Registrieren ist idempotent

- **GIVEN** `<slug>` ist bereits in `openspec/config.yaml`'s `OpenSpec-Komponenten`-Liste enthalten
- **WHEN** `registerComponent()` erneut mit demselben `<slug>` aufgerufen wird
- **THEN** bleibt die Liste unverändert (kein doppelter Eintrag)

#### Scenario: Delta gegen existierende SSOT-Spec registriert nichts

- **GIVEN** ein Delta-Spec zielt auf eine bereits existierende SSOT-Spec (MODIFIED)
- **WHEN** `archive` ohne `--create-new` ausgeführt wird
- **THEN** bleibt `openspec/config.yaml` unverändert
