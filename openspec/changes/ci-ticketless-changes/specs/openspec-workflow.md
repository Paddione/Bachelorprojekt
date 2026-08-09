## ADDED Requirements

### Requirement: Kanonischer /opsx:propose-Flow schreibt die .ticket-Datei

The system SHALL, when the canonical `/opsx:propose` workflow (as documented in
`.claude/skills/openspec-propose/SKILL.md` and mirrored in
`.claude/commands/opsx/propose.md` and `.opencode/commands/opsx-propose.md`) creates a new
change directory, write the associated ticket's external id into
`openspec/changes/<slug>/.ticket`, matching the artifact set that the Requirement "Propose
erstellt vollständiges Change-Skeleton" already mandates for `scripts/openspec.sh propose`.
All three mirrored instruction files SHALL carry this step; a change created through any of
them SHALL NOT be distinguishable — by artifact set — from one created through
`scripts/openspec.sh propose`.

#### Scenario: /opsx:propose legt .ticket mit der Ticket-ID an

- **GIVEN** ein Change `example-change` soll für Ticket `T000999` angelegt werden
- **WHEN** der Agent den kanonischen `/opsx:propose`-Flow ausführt
- **THEN** existiert `openspec/changes/example-change/.ticket`
- **AND** die Datei enthält `T000999`

#### Scenario: Alle drei gespiegelten Anweisungsdateien tragen den Schritt

- **GIVEN** die drei Dateien `.claude/skills/openspec-propose/SKILL.md`,
  `.claude/commands/opsx/propose.md` und `.opencode/commands/opsx-propose.md`
- **WHEN** eine davon auf den `.ticket`-Schritt geprüft wird
- **THEN** beschreibt jede von ihnen das Schreiben der `.ticket`-Datei
- **AND** keine der drei beschreibt einen Propose-Flow ohne diesen Schritt

### Requirement: Changes außerhalb des Altbestands tragen eine .ticket-Datei

The system SHALL fail the CI spec suite when a change directory under `openspec/changes/`
that is not part of the T002573 evaluation backlog lacks a `.ticket` file. The guard SHALL
name each offending slug in its output. The guard SHALL NOT be satisfied by an entry in
`evaluation.md`: for changes outside the backlog the `.ticket` file itself is the required
artifact, because it — not the register — is what `apply`, `archive` and `validate` read.

#### Scenario: Neuer Change ohne .ticket lässt die Suite fehlschlagen

- **GIVEN** ein Change-Verzeichnis `openspec/changes/new-thing/` ohne `.ticket`-Datei
- **AND** `new-thing` gehört nicht zum T002573-Altbestand
- **WHEN** die Spec-Suite läuft
- **THEN** schlägt der Guard fehl
- **AND** die Ausgabe nennt den Slug `new-thing`

#### Scenario: Positiv-Anker — ein Change mit .ticket besteht den Guard

- **GIVEN** ein Change-Verzeichnis außerhalb des Altbestands mit einer `.ticket`-Datei
- **WHEN** die Spec-Suite läuft
- **THEN** besteht der Guard für diesen Slug
- **AND** der Guard hat mindestens einen Change tatsächlich geprüft (die Kandidatenliste
  ist nicht leer, der Test besteht also nicht vakuos)

### Requirement: Das Bewertungsprotokoll-Gate gilt nur für den Altbestand

The system SHALL scope the `evaluation.md` completeness guard to the fixed set of changes
evaluated by T002573. The guard SHALL verify, for each slug of that set that still exists
under `openspec/changes/`, that `evaluation.md` records a verdict for it. The guard SHALL
NOT require a register entry for any change created after the evaluation. The slug set
SHALL be defined once and shared by both tests of the evaluation guard, so that the two
cannot drift apart.

#### Scenario: Ein neuer Change löst das Register-Gate nicht aus

- **GIVEN** ein Change `fresh-slug` wurde nach dem T002573-Bewertungslauf angelegt
- **AND** `fresh-slug` ist in `evaluation.md` nicht vermerkt
- **WHEN** die Spec-Suite läuft
- **THEN** besteht das Register-Gate
- **AND** die Ausgabe verlangt keinen Registereintrag für `fresh-slug`

#### Scenario: Ein Altbestands-Change ohne Vermerk lässt das Gate fehlschlagen

- **GIVEN** ein Slug des T002573-Altbestands existiert noch unter `openspec/changes/`
- **AND** sein Vermerk fehlt in `evaluation.md`
- **WHEN** die Spec-Suite läuft
- **THEN** schlägt das Register-Gate fehl und nennt den Slug
