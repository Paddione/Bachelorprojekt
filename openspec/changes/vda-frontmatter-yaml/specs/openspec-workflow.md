## MODIFIED Requirements

### Requirement: plan-frontmatter-hook repariert unvollständige Frontmatter-Felder

The system SHALL detect and repair incomplete frontmatter (domains: [], domains: null, or
missing status) by re-deriving domains from body signals and inserting status: active,
without destroying existing valid fields.

The frontmatter readers SHALL understand the YAML list form of the `domains` key
(`domains:` followed by `  - <item>` lines) in addition to the inline flow form
(`domains: [a, b]`): both `scripts/plan-lint.sh` (frontmatter completeness check F1/F2) and
`scripts/vda/frontmatter.sh` (validate + repair) SHALL treat a non-empty list-form `domains`
as present and non-empty, and the repair SHALL convert the list form into flow form without
re-deriving or guessing values and without leaving the list items behind as a loose block
below the frontmatter.

#### Scenario: Leere Domains-Liste wird aus dem Body abgeleitet

- **GIVEN** eine Plan-Datei hat Frontmatter mit `domains: []`
- **AND** der Body enthält Signale für `infra` und `db`
- **WHEN** `bash scripts/plan-frontmatter-hook.sh <datei>` ausgeführt wird
- **THEN** enthält `domains:` sowohl `infra` als auch `db`
- **AND** bestehende Felder wie `ticket_id` bleiben erhalten

#### Scenario: Fehlende Status-Zeile wird mit active aufgefüllt

- **GIVEN** eine Plan-Datei hat Frontmatter ohne `status:`-Zeile
- **WHEN** `bash scripts/plan-frontmatter-hook.sh <datei>` ausgeführt wird
- **THEN** wird `status: active` in den Frontmatter eingefügt
- **AND** bestehende `domains:`-Werte bleiben unverändert

#### Scenario: domains: null wird als unvollständig behandelt und befüllt

- **GIVEN** eine Plan-Datei hat `domains: null` im Frontmatter
- **AND** der Body enthält Signale für `website`
- **WHEN** `bash scripts/plan-frontmatter-hook.sh <datei>` ausgeführt wird
- **THEN** enthält `domains:` den Wert `website`
- **AND** `domains: null` existiert nicht mehr

#### Scenario: plan-lint akzeptiert domains in YAML-List-Form

- **GIVEN** a plan file whose frontmatter writes `domains` as a YAML list
  (`domains:` followed by `  - factory` indented items)
- **WHEN** `scripts/plan-lint.sh <plan-file>` runs its frontmatter completeness check
- **THEN** the check passes (no F1/F2 violation) and the list items are read as the domain set

#### Scenario: frontmatter-Repair konvertiert domains-Liste in Flow-Form ohne Raterei

- **GIVEN** a plan file whose frontmatter writes `domains` as a YAML list
  (`domains:` followed by `  - factory`)
- **WHEN** `scripts/vda.sh frontmatter <plan-file>` runs its repair path
- **THEN** the frontmatter carries `domains: [factory]` in flow form, the list items are not
  left behind below the frontmatter, and no other domain values are derived or guessed
