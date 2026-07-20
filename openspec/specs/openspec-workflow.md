# openspec-workflow

<!-- baseline SSOT — generiert aus Codebase-Analyse am 2026-06-20 -->

## Purpose

Dieses Dokument beschreibt den OpenSpec-Workflow als Spec-first Entwicklungssteuerung im
Bachelorprojekt. Er umfasst die Verben `propose`/`apply`/`archive`/`validate`, das
Dateiformat-Konformitätsmodell, die Ticket-Lifecycle-Kopplung, die Statusmap-Generierung
und die CI-Integration.

---

## Requirements

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

---

### Requirement: Apply setzt Change auf implementierbar (plan_staged)

The system SHALL verify that `tasks.md` in einem Change existiert und SHALL den
zugeordneten Ticket-Status auf `plan_staged` setzen, ohne Dateien zu verändern.

#### Scenario: Apply auf Change mit tasks.md

- **GIVEN** ein Change `openspec/changes/<slug>/` mit `tasks.md` existiert
- **WHEN** `task openspec:apply -- <slug>` ausgeführt wird
- **THEN** wird der Ticket-Status auf `plan_staged` gesetzt
- **AND** die Dateien im Change-Verzeichnis bleiben unverändert

#### Scenario: Apply ohne tasks.md schlägt fehl

- **GIVEN** ein Change existiert, aber `tasks.md` fehlt
- **WHEN** `task openspec:apply -- <slug>` ausgeführt wird
- **THEN** schlägt der Befehl mit einer Fehlermeldung fehl (Change nicht implementierbar)

---

### Requirement: Archive merged Delta in SSOT und schiebt Change ins Archiv

The system SHALL die Delta-Spec-Inhalte eines Changes in die entsprechende SSOT-Datei unter
`openspec/specs/<capability>.md` mergen, den Change nach
`openspec/changes/archive/<YYYY-MM-DD>-<slug>/` verschieben, und SHALL das Archivieren
verweigern, wenn der zugehörige Ticket-Status nicht `done` ist.

#### Scenario: Erfolgreiches Archive eines done-Tickets

- **GIVEN** ein Change mit Ticket-Status `done` und einer Delta-Spec `specs/<cap>.md` existiert
- **WHEN** `task openspec:archive -- <slug>` ausgeführt wird
- **THEN** werden die Requirements aus der Delta-Spec an die SSOT `openspec/specs/<cap>.md` angehängt
- **AND** das Change-Verzeichnis wird nach `openspec/changes/archive/<YYYY-MM-DD>-<slug>/` verschoben
- **AND** ein Merge-Kommentar-Header mit Datum wird in der SSOT eingefügt

#### Scenario: Archive bei nicht-done Ticket wird verweigert

- **GIVEN** ein Change existiert, aber der Ticket-Status ist `in_review`
- **WHEN** `task openspec:archive -- <slug>` ausgeführt wird
- **THEN** schlägt der Befehl mit einem Fehler ab (`archive refused: ticket status is 'in_review', expected 'done'`)
- **AND** keine Datei wird verändert oder verschoben

#### Scenario: SSOT-Datei wird angelegt, wenn sie noch nicht existiert

- **GIVEN** `openspec/specs/<cap>.md` existiert noch nicht
- **AND** ein Change mit einer Delta-Spec für diese Capability wird archiviert
- **WHEN** `task openspec:archive -- <slug>` ausgeführt wird
- **THEN** wird `openspec/specs/<cap>.md` neu erstellt und der Delta-Inhalt eingefügt

---

### Requirement: Validate ist ein fail-closed CI-Gate für Delta-Dateien

The system SHALL jede aktive Delta-Spec-Datei in `openspec/changes/*/specs/*.md` auf drei
Kriterien prüfen: Vorhandensein eines `## ADDED|MODIFIED|REMOVED Requirements`-Headers,
mindestens ein `### Requirement:`-Eintrag (H3), und Abwesenheit von H2-`## Requirement:`-Headern,
und SHALL mit Exit-Code ungleich 0 fehlschlagen, sobald eine Datei ein Kriterium verletzt.

#### Scenario: Wohlgeformter Change-Tree besteht Validation

- **GIVEN** alle Delta-Specs haben korrekte H2-Sektions-Header und H3-Requirement-Einträge
- **WHEN** `task openspec:validate` ausgeführt wird
- **THEN** gibt der Befehl `openspec validate: OK` aus und beendet mit Exit-Code 0

#### Scenario: Falsche Heading-Ebene (H2 statt H3) schlägt fehl

- **GIVEN** eine Delta-Spec verwendet `## Requirement:` (H2) statt `### Requirement:` (H3)
- **WHEN** `task openspec:validate` ausgeführt wird
- **THEN** schlägt der Befehl mit Exit-Code ungleich 0 fehl und benennt die fehlerhafte Datei

#### Scenario: Fehlender Operations-Header schlägt fehl

- **GIVEN** eine Delta-Spec enthält keinen `## ADDED|MODIFIED|REMOVED Requirements`-Header
- **WHEN** `task openspec:validate` ausgeführt wird
- **THEN** schlägt der Befehl mit Exit-Code ungleich 0 fehl

#### Scenario: Archivierte Changes werden nicht validiert

- **GIVEN** ein Change unter `openspec/changes/archive/` hat eine fehlerhafte Delta-Spec
- **WHEN** `task openspec:validate` ausgeführt wird
- **THEN** wird der archivierte Change übersprungen und der Befehl beendet mit Exit-Code 0

---

### Requirement: Statusmap-Generierung spiegelt den Change-Zustand als JSON

The system SHALL nach jedem `propose`-, `apply`- und `archive`-Aufruf automatisch
`website/src/data/openspec-status.json` regenerieren, die aktive Changes als `planning`
(ohne `tasks.md`) bzw. `plan_staged` (mit `tasks.md`) und archivierte Changes als `archived`
mit ihrem Ticket-Bezug ausgibt.

#### Scenario: Aktiver Change ohne tasks.md erscheint als planning

- **GIVEN** `openspec/changes/my-feature/` existiert ohne `tasks.md`, mit `.ticket`-Datei
- **WHEN** `scripts/openspec-status-map.sh` ausgeführt wird
- **THEN** enthält `website/src/data/openspec-status.json` einen Eintrag `{ ticket: "<id>", slug: "my-feature", status: "planning" }`

#### Scenario: Aktiver Change mit tasks.md erscheint als plan_staged

- **GIVEN** `openspec/changes/my-feature/` existiert mit `tasks.md` und `.ticket`-Datei
- **WHEN** `scripts/openspec-status-map.sh` ausgeführt wird
- **THEN** enthält die JSON-Ausgabe den Eintrag mit `status: "plan_staged"` für diesen Slug

#### Scenario: Archivierter Change erscheint als archived

- **GIVEN** ein Change liegt unter `openspec/changes/archive/<date>-<slug>/` mit `.ticket`-Datei
- **WHEN** `scripts/openspec-status-map.sh` ausgeführt wird
- **THEN** enthält die JSON-Ausgabe den Eintrag mit `status: "archived"` für diesen Slug

---

### Requirement: Lifecycle-Mapping koppelt OpenSpec-Phasen an Ticket-Statuses

The system SHALL die Ticket-Status-Übergänge konsistent mit den OpenSpec-Phasen halten:
`propose` → `planning`, `apply` → `plan_staged`, und `archive` SHALL nur erlaubt sein, wenn
der Ticket-Status `done` ist.

#### Scenario: Vollständiger Lifecycle eines Features

- **GIVEN** ein neues Feature-Ticket mit Status `triage`
- **WHEN** nacheinander `propose`, `apply`, das Ticket auf `done` gesetzt und dann `archive` ausgeführt werden
- **THEN** durchläuft der Ticket-Status die Stationen `planning` → `plan_staged` → `done`
- **AND** der Change landet schließlich im Archiv mit gemergetem Delta in der SSOT

---

### Requirement: Freshness-Check sichert Konsistenz der generierten Artefakte

The system SHALL im Rahmen des `freshness:check`-Gates die Aktualität von
`website/src/data/openspec-status.json` prüfen und SHALL fehlschlagen, wenn die Datei
gegenüber dem aktuellen Stand der `openspec/changes/`-Verzeichnisstruktur veraltet ist.

#### Scenario: Veraltete openspec-status.json blockiert CI

- **GIVEN** ein neuer Change wurde hinzugefügt, aber `openspec-status-map.sh` wurde nicht neu ausgeführt
- **WHEN** `task freshness:check` im CI ausgeführt wird
- **THEN** schlägt der Job fehl mit Hinweis auf die veraltete `website/src/data/openspec-status.json`

#### Scenario: Frische openspec-status.json lässt CI passieren

- **GIVEN** `openspec-status-map.sh` wurde nach der letzten Change-Änderung ausgeführt und die Datei ist committed
- **WHEN** `task freshness:check` ausgeführt wird
- **THEN** wird `website/src/data/openspec-status.json` als aktuell akzeptiert

---

### Requirement: Drop-in-Kompatibilität mit dem `openspec` npm CLI

The system SHALL das Dateilayout und das Deltaformat exakt so implementieren, dass
`npm i -g openspec` als vollständiger Drop-in-Ersatz für `scripts/openspec.sh`
funktioniert, ohne bestehende Dateien zu migrieren.

#### Scenario: SSOT-Dateien sind format-konform

- **GIVEN** eine SSOT-Datei `openspec/specs/<cap>.md` ist vorhanden
- **THEN** verwendet sie ausschließlich `### Requirement:` (H3) für Requirements und `#### Scenario:` (H4) für Szenarien mit `GIVEN/WHEN/THEN/AND`-Bullets

#### Scenario: Delta-Dateien sind format-konform

- **GIVEN** eine Delta-Spec `openspec/changes/<slug>/specs/<cap>.md` ist vorhanden
- **THEN** beginnt sie mit einem `## ADDED|MODIFIED|REMOVED Requirements`-Header (H2)
- **AND** Requirements sind als `### Requirement:` (H3) strukturiert

---

### Requirement: Unbekannter Verb wird mit Fehler und Usage abgewiesen

The system SHALL exit with a non-zero status code and output a usage or error message when
an unrecognised verb is passed to `scripts/openspec.sh`.

#### Scenario: Unbekanntes Verb

- **GIVEN** kein Change existiert und `scripts/openspec.sh` ist vorhanden
- **WHEN** `bash scripts/openspec.sh frobnicate` ausgeführt wird
- **THEN** endet der Befehl mit Exit-Code ungleich 0
- **AND** die Ausgabe enthält `Usage` oder `Unknown`

---

### Requirement: Validate schlägt fehl bei leerer Delta-Spec ohne Requirement-Header

The system SHALL exit non-zero when a Delta-Spec file exists in an active change directory
but contains no `### Requirement:` heading at all, even if it has no wrong-level headings.

#### Scenario: Delta-Spec enthält keinen Requirement-Header

- **GIVEN** ein Change-Verzeichnis `openspec/changes/empty-change/specs/cap.md` existiert
- **AND** der Dateiinhalt enthält keine `### Requirement:`-Zeile
- **WHEN** `bash scripts/openspec.sh validate` mit dem entsprechenden `OPENSPEC_ROOT` ausgeführt wird
- **THEN** endet der Befehl mit Exit-Code ungleich 0

---

### Requirement: plan-frontmatter-hook fügt vollständigen Frontmatter-Block ein, wenn keiner vorhanden ist

The system SHALL prepend a complete YAML frontmatter block to a plan file that has no
frontmatter, deriving `domains` from body signals and setting `status: active`.

#### Scenario: Plan ohne Frontmatter erhält neuen Block

- **GIVEN** eine Plan-Datei beginnt direkt mit `# ` (kein `---`-Block)
- **AND** der Fließtext enthält Signale für die Domäne `infra` (z. B. `k3d/`)
- **WHEN** `bash scripts/plan-frontmatter-hook.sh <datei>` ausgeführt wird
- **THEN** beginnt die Datei mit `---`
- **AND** `domains:` enthält `infra`
- **AND** `status: active` ist vorhanden

#### Scenario: Kein doppelter Frontmatter-Block bei Wiederholung

- **GIVEN** ein unvollständiger Frontmatter wurde bereits durch den Hook ergänzt
- **WHEN** der Hook ein zweites Mal auf derselben Datei ausgeführt wird
- **THEN** enthält die Datei genau zwei `---`-Delimiter-Zeilen (ein einziger Frontmatter-Block)

---

### Requirement: plan-frontmatter-hook repariert unvollständige Frontmatter-Felder

The system SHALL detect and repair incomplete frontmatter (domains: [], domains: null, or
missing status) by re-deriving domains from body signals and inserting status: active,
without destroying existing valid fields.

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

---

### Requirement: plan-frontmatter-hook repariert null ticket_id wenn Body eine ID liefert

The system SHALL overwrite a `ticket_id: null` placeholder in existing frontmatter when a
derivable ticket ID is found in the plan body, and SHALL leave it as null when no source
provides a value (idempotent null case).

#### Scenario: null ticket_id wird mit Body-ID überschrieben

- **GIVEN** eine Plan-Datei hat `ticket_id: null` und `domains: []` im Frontmatter
- **AND** der Body enthält `**Ticket:** T000999`
- **WHEN** `bash scripts/plan-frontmatter-hook.sh <datei>` ausgeführt wird
- **THEN** enthält der Frontmatter `ticket_id: T000999`
- **AND** `domains:` wurde ebenfalls neu abgeleitet

#### Scenario: null ticket_id bleibt null wenn keine Quelle verfügbar ist

- **GIVEN** eine Plan-Datei hat `ticket_id: null` und vollständige andere Felder
- **AND** weder Body noch Dateiname liefern eine Ticket-ID
- **WHEN** `bash scripts/plan-frontmatter-hook.sh <datei>` ausgeführt wird
- **THEN** bleibt der Dateiinhalt unverändert

---

### Requirement: plan-lint prüft STRUCT3 auf task freshness:check und test:changed

The system SHALL fail with STRUCT3 when the plan's verify task does not include
`task freshness:check`, and SHALL accept `task test:changed` (not `task test:all`) as the
correct test invocation.

#### Scenario: Fehlendes freshness:check im Verify-Task ist STRUCT3-Fehler

- **GIVEN** eine Plan-Datei enthält keinen `task freshness:check`-Aufruf im Verify-Abschnitt
- **WHEN** `bash scripts/plan-lint.sh <datei>` ausgeführt wird
- **THEN** endet der Befehl mit Exit-Code 1
- **AND** die Ausgabe enthält `STRUCT3`

#### Scenario: TODO-Platzhalter in Task-Body ist P1-Fehler

- **GIVEN** eine Plan-Datei enthält das Wort `TODO` im Fließtext eines Task-Körpers
- **WHEN** `bash scripts/plan-lint.sh <datei>` ausgeführt wird
- **THEN** endet der Befehl mit Exit-Code 1
- **AND** die Ausgabe enthält `P1`

---

### Requirement: Verzeichnis openspec/specs/ ist die einzige Komponenten-Quelle

The system SHALL treat the top-level `*.md` files under `openspec/specs/` as the
single source of truth for the component set, and SHALL NOT maintain, read, or
validate any duplicate component enumeration in `openspec/config.yaml`. The
validator (`scripts/openspec-validate.ts`) SHALL derive the component set
exclusively from the directory listing and SHALL perform no config-drift
comparison.

#### Scenario: config.yaml carries no component enumeration

- **GIVEN** the file `openspec/config.yaml`
- **WHEN** the file is inspected
- **THEN** it contains no `OpenSpec-Komponenten:` key
- **AND** `bash scripts/openspec.sh validate` exits 0 without performing a drift check

#### Scenario: validator reads only the directory

- **GIVEN** a well-formed SSOT spec `openspec/specs/<slug>.md`
- **WHEN** `validateTree()` runs against the repo
- **THEN** the spec is validated from the directory listing alone
- **AND** no registration in `openspec/config.yaml` is required for the run to pass

### Requirement: One-off-Specs liegen unter openspec/specs/archive/ und werden nicht als Komponenten validiert

The system SHALL store completed one-off change artifacts (ticket- and
gate-numbered specs) under `openspec/specs/archive/`, and both the validator and
the context loader SHALL treat only top-level `openspec/specs/*.md` files as
component specs, ignoring the `archive/` subdirectory entirely.

#### Scenario: archived spec is ignored by the validator

- **GIVEN** a malformed file `openspec/specs/archive/<slug>.md`
- **WHEN** `validateTree()` / `bash scripts/openspec.sh validate` runs
- **THEN** the archived file is not validated as a component spec
- **AND** the run stays green (exit 0)

#### Scenario: context loader does not fall back to archive

- **GIVEN** a slug whose spec was moved to `openspec/specs/archive/`
- **WHEN** `scripts/openspec-context.sh` is queried for that slug
- **THEN** it follows the existing not-found path
- **AND** it does not load the file from `archive/`

### Requirement: archive --create-new verweigert One-off-Slug-Muster ohne expliziten Override

The system SHALL, when `archive` (via `applyDelta()`) would create a new SSOT
spec whose slug matches the one-off denylist pattern
`^(t[0-9]{6}|g-[a-z0-9]+[0-9]{2})`, fail with a non-zero exit code and an error
message naming `--target-spec <parent>` and `--force-new-component` as
alternatives, unless `--force-new-component` is passed.

#### Scenario: one-off slug is rejected

- **GIVEN** a change whose delta targets a non-existent SSOT `openspec/specs/t000000-foo.md`
- **WHEN** `scripts/openspec.sh archive <slug> --create-new` runs
- **THEN** the command exits with a non-zero status
- **AND** the error message references `--target-spec` and `--force-new-component`
- **AND** no new spec file is written

#### Scenario: --force-new-component overrides the denylist

- **GIVEN** the same change and one-off-shaped target slug
- **WHEN** `scripts/openspec.sh archive <slug> --create-new --force-new-component` runs
- **THEN** the SSOT spec is created
- **AND** the command exits 0

### Requirement: Neu erzeugte SSOT-Stubs tragen einen deutschen Purpose-Platzhalter

The system SHALL, when writing a brand-new SSOT skeleton, emit a German
placeholder Purpose sentence that contains no `TODO` token, so the stub is
recognisable as incomplete without violating the Purpose-must-be-German rule or
tripping the TODO cleanup gate (G-CQ05).

#### Scenario: new skeleton carries a German placeholder purpose

- **GIVEN** `applyDelta()` creates `openspec/specs/<slug>.md` for a genuinely new component
- **WHEN** the skeleton file is written
- **THEN** its `## Purpose` section contains a German placeholder sentence
- **AND** the sentence contains no `TODO` token

## Testszenarien

<!-- merged from BATS unit tests and Playwright e2e tests -->

### Requirement: openspec validate akzeptiert wohlgeformten Change-Tree
<!-- bats: openspec.bats -->

The system SHALL exit 0 when all active Delta-Spec files under `openspec/changes/*/specs/`
are well-formed (correct heading levels and at least one `### Requirement:` entry).

#### Scenario: Wohlgeformter Change-Tree besteht Validierung *(BATS)*
- **GIVEN** alle Delta-Specs im Fixture-Verzeichnis `tests/unit/fixtures/openspec/valid` haben korrekte H2-Sektions-Header und H3-Requirement-Einträge
- **WHEN** `bash scripts/openspec.sh validate` mit `OPENSPEC_ROOT` auf das valide Fixture gesetzt wird
- **THEN** endet der Befehl mit Exit-Code 0

---

### Requirement: openspec validate schlägt bei falschem Heading-Level fail-closed
<!-- bats: openspec.bats -->

The system SHALL exit non-zero and report a heading/Requirement error when a Delta-Spec uses
`## Requirement:` (H2) instead of `### Requirement:` (H3).

#### Scenario: Falsches Heading-Level (H2 statt H3) schlägt fehl *(BATS)*
- **GIVEN** das Fixture-Verzeichnis `tests/unit/fixtures/openspec/bad-heading` enthält eine Delta-Spec mit `## Requirement:` (H2)
- **WHEN** `bash scripts/openspec.sh validate` mit `OPENSPEC_ROOT` auf das fehlerhafte Fixture gesetzt wird
- **THEN** endet der Befehl mit Exit-Code ungleich 0
- **AND** die Ausgabe enthält `heading` oder `Requirement`

---

### Requirement: openspec validate schlägt fehl wenn Requirement-Header fehlt
<!-- bats: openspec.bats -->

The system SHALL exit non-zero when a Delta-Spec file exists in an active change directory
but contains no `### Requirement:` heading.

#### Scenario: Delta-Spec ohne Requirement-Header schlägt fehl *(BATS)*
- **GIVEN** ein temporäres Change-Verzeichnis `changes/empty-change/specs/cap.md` existiert mit Inhalt `# nothing here` (kein Requirement-Header)
- **WHEN** `bash scripts/openspec.sh validate` mit `OPENSPEC_ROOT` auf das temporäre Verzeichnis gesetzt wird
- **THEN** endet der Befehl mit Exit-Code ungleich 0

---

### Requirement: SSOT-Requirement ohne Szenario schlägt fail-closed fehl
<!-- bats: openspec-workflow.bats -->

The system SHALL exit non-zero when any `### Requirement:` in an SSOT spec under
`openspec/specs/` declares no `#### Scenario:` entry before the next requirement header
(scenario-coverage ratchet, T002004). Archived one-off specs under `openspec/specs/archive/`
are exempt (directory entries are not validated as components).

#### Scenario: Requirement ohne Szenario wird vom Validator gemeldet *(BATS)*
- **GIVEN** eine temporäre SSOT-Spec mit `## Purpose`, `## Requirements` und einem `### Requirement:` ohne `#### Scenario:`
- **WHEN** `validateSpec` aus `scripts/openspec-validate.ts` auf die Datei läuft
- **THEN** enthält das Ergebnis einen Fehler mit `has no '#### Scenario:' entry`

#### Scenario: Vollständig szenarierte Spec passiert den Validator *(BATS)*
- **GIVEN** eine SSOT-Spec, in der jedes `### Requirement:` mindestens ein `#### Scenario:` deklariert
- **WHEN** `validateSpec` auf die Datei läuft
- **THEN** liefert es keine Szenario-Fehler

---

### Requirement: openspec weist unbekannte Verben mit Fehler und Usage ab
<!-- bats: openspec.bats -->

The system SHALL exit non-zero and output a usage or error message when an unrecognised verb
is passed to `scripts/openspec.sh`.

#### Scenario: Unbekanntes Verb gibt Usage aus und schlägt fehl *(BATS)*
- **GIVEN** `scripts/openspec.sh` ist vorhanden
- **WHEN** `bash scripts/openspec.sh frobnicate` ausgeführt wird
- **THEN** endet der Befehl mit Exit-Code ungleich 0
- **AND** die Ausgabe enthält `Usage` oder `Unknown`

---

### Requirement: plan-frontmatter-hook fügt Frontmatter ein wenn keiner vorhanden ist
<!-- bats: plan-frontmatter-hook.bats -->

The system SHALL prepend a complete YAML frontmatter block when a plan file has no
frontmatter, deriving `domains` from body signals and setting `status: active`.

#### Scenario: Plan ohne Frontmatter erhält vollständigen Block mit abgeleiteten Domains *(BATS)*
- **GIVEN** Datei `a-none.md` beginnt direkt mit `# My Plan` (kein `---`-Block) und enthält Signale für Domäne `infra` (`k3d/`)
- **WHEN** `bash scripts/plan-frontmatter-hook.sh a-none.md` ausgeführt wird
- **THEN** beginnt die Datei mit `---`
- **AND** `domains:` enthält `infra`
- **AND** `status: active` ist vorhanden

---

### Requirement: plan-frontmatter-hook repariert unvollständige Domains-Felder
<!-- bats: plan-frontmatter-hook.bats -->

The system SHALL re-derive domains from body signals when `domains: []` or `domains: null`
is found in existing frontmatter, preserving all other valid fields.

#### Scenario: domains: [] wird aus Body abgeleitet (infra+db) *(BATS)*
- **GIVEN** Datei `b-empty-domains.md` hat Frontmatter mit `domains: []` und `ticket_id: T000999`; Body enthält `k3d/` und Datenbank-Signale
- **WHEN** `bash scripts/plan-frontmatter-hook.sh b-empty-domains.md` ausgeführt wird
- **THEN** enthält `domains:` sowohl `infra` als auch `db`
- **AND** `ticket_id: T000999` bleibt erhalten

#### Scenario: domains: null wird als unvollständig behandelt und befüllt *(BATS)*
- **GIVEN** Datei `f-null-domains.md` hat `domains: null` und Body enthält Website/Svelte-Signale
- **WHEN** `bash scripts/plan-frontmatter-hook.sh f-null-domains.md` ausgeführt wird
- **THEN** enthält `domains:` den Wert `website`
- **AND** `domains: null` existiert nicht mehr

---

### Requirement: plan-frontmatter-hook fügt fehlende status-Zeile ein
<!-- bats: plan-frontmatter-hook.bats -->

The system SHALL insert `status: active` into existing frontmatter that is missing the
`status:` field, while leaving existing `domains:` values unchanged.

#### Scenario: Fehlende Status-Zeile wird mit active aufgefüllt *(BATS)*
- **GIVEN** Datei `c-missing-status.md` hat Frontmatter ohne `status:`-Zeile; `domains: [infra]` ist vorhanden
- **WHEN** `bash scripts/plan-frontmatter-hook.sh c-missing-status.md` ausgeführt wird
- **THEN** enthält die Datei `status: active`
- **AND** `domains: [infra]` bleibt erhalten

---

### Requirement: plan-frontmatter-hook bewahrt bewusst gesetzte Nicht-active-Statuses
<!-- bats: plan-frontmatter-hook.bats -->

The system SHALL NOT overwrite a deliberate non-active status (`done`, `completed`, etc.)
when run without `--activate`.

#### Scenario: Status done bleibt erhalten *(BATS)*
- **GIVEN** Datei `d-deliberate-done.md` hat `status: done` im Frontmatter
- **WHEN** `bash scripts/plan-frontmatter-hook.sh d-deliberate-done.md` ohne `--activate` ausgeführt wird
- **THEN** enthält die Datei weiterhin `status: done`
- **AND** `status: active` erscheint nicht

#### Scenario: Status completed bleibt ohne --activate erhalten *(BATS)*
- **GIVEN** Datei `e-keep.md` hat `status: completed` im Frontmatter
- **WHEN** `bash scripts/plan-frontmatter-hook.sh e-keep.md` ohne `--activate` ausgeführt wird
- **THEN** enthält die Datei weiterhin `status: completed`

#### Scenario: --activate überschreibt auch einen abgeschlossenen Status *(BATS)*
- **GIVEN** Datei `d-completed.md` hat `status: completed` im Frontmatter
- **WHEN** `bash scripts/plan-frontmatter-hook.sh --activate d-completed.md` ausgeführt wird
- **THEN** enthält die Datei `status: active`

---

### Requirement: plan-frontmatter-hook ist idempotent für vollständige Frontmatter-Blöcke
<!-- bats: plan-frontmatter-hook.bats -->

The system SHALL produce no changes and no duplicate frontmatter blocks when run on a plan
file that already has a complete, valid frontmatter block, including CRLF line-ending
variants.

#### Scenario: Vollständiger Frontmatter bleibt nach erneutem Hook-Aufruf unverändert *(BATS)*
- **GIVEN** Datei `e-complete.md` hat einen vollständigen Frontmatter mit allen Pflichtfeldern
- **WHEN** `bash scripts/plan-frontmatter-hook.sh e-complete.md` ausgeführt wird
- **THEN** ist der Dateiinhalt nach dem Aufruf identisch mit dem Inhalt davor

#### Scenario: CRLF-Zeilenenden erzeugen keinen doppelten Frontmatter-Block *(BATS)*
- **GIVEN** Datei `crlf.md` hat CRLF-Zeilenenden und einen vollständigen Frontmatter-Block
- **WHEN** `bash scripts/plan-frontmatter-hook.sh crlf.md` ausgeführt wird
- **THEN** enthält die Datei exakt zwei `---`-Delimiter-Zeilen (ein einziger Frontmatter-Block)

#### Scenario: Kein doppelter Frontmatter-Block nach Repair-Aufruf *(BATS)*
- **GIVEN** Datei `b-empty-domains.md` hat unvollständige Domains und wird repariert
- **WHEN** `bash scripts/plan-frontmatter-hook.sh b-empty-domains.md` ausgeführt wird
- **THEN** beginnt die Datei mit `---` in Zeile 1
- **AND** die Datei enthält exakt zwei `---`-Delimiter-Zeilen

---

### Requirement: plan-frontmatter-hook leitet ticket_id aus Body oder Dateinamen ab
<!-- bats: plan-frontmatter-hook.bats -->

The system SHALL derive `ticket_id` from a `**Ticket:** T000xxx` line in the plan body,
falling back to a ticket ID embedded in the filename, and SHALL overwrite `ticket_id: null`
when a derivable value is found.

#### Scenario: ticket_id wird aus Body-Ticket-Link abgeleitet *(BATS)*
- **GIVEN** Datei `h-body-ticket.md` ohne Frontmatter enthält `**Ticket:** T000886` im Body
- **WHEN** `bash scripts/plan-frontmatter-hook.sh h-body-ticket.md` ausgeführt wird
- **THEN** enthält der erzeugte Frontmatter `ticket_id: T000886`
- **AND** `ticket_id: null` erscheint nicht

#### Scenario: ticket_id wird aus Dateiname-Slug abgeleitet *(BATS)*
- **GIVEN** Datei heißt `2026-06-16-t000884.md` und hat keinen Body-Ticket-Link
- **WHEN** `bash scripts/plan-frontmatter-hook.sh 2026-06-16-t000884.md` ausgeführt wird
- **THEN** enthält der Frontmatter `ticket_id: T000884`

#### Scenario: null ticket_id wird mit Body-ID überschrieben *(BATS)*
- **GIVEN** Datei `i-null-ticket.md` hat `ticket_id: null` und `domains: []`; Body enthält `**Ticket:** T000999` und `k3d/`-Signale
- **WHEN** `bash scripts/plan-frontmatter-hook.sh i-null-ticket.md` ausgeführt wird
- **THEN** enthält der Frontmatter `ticket_id: T000999`
- **AND** `domains:` wurde auf `infra` abgeleitet

#### Scenario: null ticket_id bleibt null wenn keine Quelle verfügbar ist *(BATS)*
- **GIVEN** Datei `j-undeterminable.md` hat vollständige andere Felder, `ticket_id: null`; weder Body noch Dateiname liefern eine ID
- **WHEN** `bash scripts/plan-frontmatter-hook.sh j-undeterminable.md` ausgeführt wird
- **THEN** bleibt der Dateiinhalt unverändert

---

### Requirement: plan-frontmatter-hook unterstützt --spec-Modus für Delta-Spec-Dateien
<!-- bats: plan-frontmatter-hook.bats -->

The system SHALL, when invoked with `--spec`, prepend a spec-specific frontmatter block
containing `ticket_id`, `plan_ref`, `status: active`, and `date`, and SHALL be idempotent
when frontmatter is already present.

#### Scenario: --spec fügt Spec-Frontmatter ein *(BATS)*
- **GIVEN** Datei `f-spec.md` beginnt ohne Frontmatter (`# My Feature Design`)
- **WHEN** `bash scripts/plan-frontmatter-hook.sh --spec f-spec.md` ausgeführt wird
- **THEN** beginnt die Datei mit `---`
- **AND** der Block enthält `ticket_id:`, `plan_ref:`, `status: active` und `date:`

#### Scenario: --spec ist idempotent bei vorhandenem Frontmatter *(BATS)*
- **GIVEN** Datei `g-spec.md` hat bereits einen vollständigen Spec-Frontmatter-Block
- **WHEN** `bash scripts/plan-frontmatter-hook.sh --spec g-spec.md` erneut ausgeführt wird
- **THEN** bleibt der Dateiinhalt unverändert

---

### Requirement: plan-frontmatter-hook --validate leitet fehlendes title-Feld aus H1 ab
<!-- bats: plan-frontmatter-hook.bats -->

The system SHALL, when invoked with `--validate`, auto-fill a missing `title` field from the
first H1 heading in the plan body, and SHALL exit 1 when domains cannot be derived to a
non-empty list.

#### Scenario: Fehlender title wird aus erstem H1 ergänzt *(BATS)*
- **GIVEN** Datei `v-no-title.md` hat Frontmatter ohne `title:`; Body enthält `# Derived Title Plan`
- **WHEN** `bash scripts/plan-frontmatter-hook.sh --validate v-no-title.md` ausgeführt wird
- **THEN** enthält der Frontmatter `title: Derived Title Plan`

#### Scenario: Fehlende ableitbare Domains führen zu Exit 1 *(BATS)*
- **GIVEN** Datei `v-no-domains.md` hat `domains: []` und kein Body-Signal das Routing ermöglicht
- **WHEN** `bash scripts/plan-frontmatter-hook.sh --validate v-no-domains.md` ausgeführt wird
- **THEN** endet der Befehl mit Exit-Code 1

---

### Requirement: plan-lint erkennt Pflicht-Strukturfehler als harten Fail
<!-- bats: plan-lint.bats -->

The system SHALL exit 1 and emit `PLAN-LINT: FAIL` when a plan file is missing required
structural elements: a `title:` field (F1), a `task freshness:check` call in the verify
task (STRUCT3), or a `TODO` placeholder in a task body (P1). A good plan SHALL exit 0 with
`PLAN-LINT: PASS`.

#### Scenario: Gültige Plan-Datei erhält PASS-Verdict *(BATS)*
- **GIVEN** Fixture `good.md` enthält alle Pflichtfelder sowie `task test:changed` und `task freshness:check` im Verify-Abschnitt
- **WHEN** `bash scripts/plan-lint.sh good.md` ausgeführt wird
- **THEN** endet der Befehl mit Exit-Code 0
- **AND** die Ausgabe enthält `PLAN-LINT: PASS`

#### Scenario: Fehlendes title-Feld ist harter F1-Fehler *(BATS)*
- **GIVEN** Fixture `missing-title.md` hat keinen `title:`-Eintrag im Frontmatter
- **WHEN** `bash scripts/plan-lint.sh missing-title.md` ausgeführt wird
- **THEN** endet der Befehl mit Exit-Code 1
- **AND** die Ausgabe enthält `F1` und `PLAN-LINT: FAIL`

#### Scenario: Fehlendes freshness:check im Verify-Task ist STRUCT3-Fehler *(BATS)*
- **GIVEN** Fixture `missing-verify.md` enthält keinen `task freshness:check`-Aufruf im Verify-Abschnitt
- **WHEN** `bash scripts/plan-lint.sh missing-verify.md` ausgeführt wird
- **THEN** endet der Befehl mit Exit-Code 1
- **AND** die Ausgabe enthält `STRUCT3`

#### Scenario: STRUCT3 akzeptiert test:changed nicht test:all *(BATS)*
- **GIVEN** Fixture `good.md` verwendet `task test:changed` im Verify-Abschnitt
- **WHEN** `bash scripts/plan-lint.sh good.md` ausgeführt wird
- **THEN** endet der Befehl mit Exit-Code 0 (STRUCT3 ist erfüllt)

#### Scenario: TODO-Platzhalter in Task-Body ist P1-Fehler *(BATS)*
- **GIVEN** Fixture `placeholder-todo.md` enthält das Wort `TODO` im Fließtext eines Task-Körpers
- **WHEN** `bash scripts/plan-lint.sh placeholder-todo.md` ausgeführt wird
- **THEN** endet der Befehl mit Exit-Code 1
- **AND** die Ausgabe enthält `P1`

---

### Requirement: plan-lint berechnet effektive Datei-Größenschwellen korrekt (B1-Mathematik)
<!-- bats: plan-lint.bats -->

The system SHALL compute the effective line-count threshold: ungated extensions yield 0;
unbaselined `.sh` files yield 500; baselined files yield `max(static_limit, baseline.metric)`;
the residual budget equals `threshold − wc -l` of the live file.

#### Scenario: Ungegated Extension (.md) ergibt Threshold 0 *(BATS)*
- **GIVEN** Datei `docs/foo.md` mit Endung `.md`
- **WHEN** `PLAN_LINT_SELFTEST=1 bash scripts/plan-lint.sh effective_threshold "docs/foo.md"` ausgeführt wird
- **THEN** gibt der Befehl `0` aus und endet mit Exit-Code 0

#### Scenario: Nicht-baselinierte .sh-Datei ergibt Threshold 500 *(BATS)*
- **GIVEN** Datei `scripts/never-baselined-xyz.sh` existiert nicht in `baseline.json`
- **WHEN** `PLAN_LINT_SELFTEST=1 bash scripts/plan-lint.sh effective_threshold "scripts/never-baselined-xyz.sh"` ausgeführt wird
- **THEN** gibt der Befehl `500` aus

#### Scenario: Baselinierte Datei verwendet max(limit, baseline.metric) *(BATS)*
- **GIVEN** `scripts/backup-restore.sh` ist in `baseline.json` mit 1037 Zeilen hinterlegt (überschreitet statischen Limit von 500)
- **WHEN** `PLAN_LINT_SELFTEST=1 bash scripts/plan-lint.sh effective_threshold "scripts/backup-restore.sh"` ausgeführt wird
- **THEN** gibt der Befehl `1037` aus

#### Scenario: Residual Budget ergibt threshold minus wc -l *(BATS)*
- **GIVEN** `scripts/plan-context.sh` ist eine unbaselinierte `.sh`-Datei mit 64 Zeilen (Threshold 500)
- **WHEN** `PLAN_LINT_SELFTEST=1 bash scripts/plan-lint.sh residual_budget "scripts/plan-context.sh"` ausgeführt wird
- **THEN** gibt der Befehl `436` aus (500 − 64)

---

### Requirement: plan-lint meldet B1a als harten Fehler und B1b als Warnung
<!-- bats: plan-lint.bats -->

The system SHALL exit 1 with a B1a finding when a plan self-reports a budget that
contradicts the computed value, and SHALL exit 0 with a B1b warning when a file exceeds its
effective threshold but no split step is present.

#### Scenario: Widersprüchliches self-reported Budget ist B1a-Fehler *(BATS)*
- **GIVEN** Fixture `wrong-budget.md` enthält ein angegebenes Datei-Budget das nicht mit dem berechneten Wert übereinstimmt
- **WHEN** `bash scripts/plan-lint.sh wrong-budget.md` ausgeführt wird
- **THEN** endet der Befehl mit Exit-Code 1
- **AND** die Ausgabe enthält `B1a`

#### Scenario: Datei über Threshold ohne Split-Schritt ergibt B1b-Warnung (Exit 0) *(BATS)*
- **GIVEN** Fixture `over-threshold.md` referenziert eine Datei die ihren effektiven Threshold überschreitet ohne Split-Schritt
- **WHEN** `bash scripts/plan-lint.sh over-threshold.md` ausgeführt wird
- **THEN** endet der Befehl mit Exit-Code 0
- **AND** die Ausgabe enthält `B1b` und `PLAN-LINT: PASS` mit mindestens einer Warnung

---

### Requirement: plan-lint gibt bei --json maschinenlesbares Verdict-Objekt aus
<!-- bats: plan-lint.bats -->

The system SHALL, when invoked with `--json`, emit a single JSON object containing `verdict`,
`hard`, and `warn` fields, with exit code matching the verdict.

#### Scenario: --json für gültige Plan-Datei gibt PASS-Objekt aus *(BATS)*
- **GIVEN** Fixture `good.md` besteht alle Checks
- **WHEN** `bash scripts/plan-lint.sh --json good.md` ausgeführt wird
- **THEN** endet der Befehl mit Exit-Code 0
- **AND** die Ausgabe ist valides JSON mit `"verdict": "PASS"`, `"hard"` als Array und `"warn"` als Array

#### Scenario: --json für fehlerhafte Plan-Datei gibt FAIL-Objekt aus *(BATS)*
- **GIVEN** Fixture `missing-title.md` hat einen harten Strukturfehler (fehlendes `title:`)
- **WHEN** `bash scripts/plan-lint.sh --json missing-title.md` ausgeführt wird
- **THEN** endet der Befehl mit Exit-Code 1
- **AND** die Ausgabe ist valides JSON mit `"verdict": "FAIL"` und mindestens einem Eintrag in `"hard"`

---

### Requirement: preflight-pr-scope validiert PR-Titel-Scope gegen die Semantic-PR-Allowlist
<!-- bats: preflight-pr-scope.bats -->

The system SHALL exit 0 for titles with a valid scope or no scope, exit non-zero with
an explanatory message for an invalid scope, and exit 2 when the workflow file is missing.

#### Scenario: Gültiger Scope besteht Validierung *(BATS)*
- **GIVEN** ci.yml enthält die Allowlist-Scopes `website`, `admin`, `db`, `ops`, `factory`
- **WHEN** `bash scripts/preflight-pr-scope.sh "feat(admin): add dashboard" ci.yml` ausgeführt wird
- **THEN** endet der Befehl mit Exit-Code 0

#### Scenario: Ungültiger Scope wird mit Fehlermeldung abgewiesen *(BATS)*
- **GIVEN** `cockpit` ist nicht in der Allowlist
- **WHEN** `bash scripts/preflight-pr-scope.sh "feat(cockpit): add view" ci.yml` ausgeführt wird
- **THEN** endet der Befehl mit Exit-Code ungleich 0
- **AND** die Ausgabe enthält `NOT in the semantic-PR allowlist` und listet gültige Scopes auf

#### Scenario: Titel ohne Scope besteht Validierung *(BATS)*
- **GIVEN** ein PR-Titel ohne `(scope)`-Klammer (`docs: update readme`)
- **WHEN** `bash scripts/preflight-pr-scope.sh "docs: update readme" ci.yml` ausgeführt wird
- **THEN** endet der Befehl mit Exit-Code 0
- **AND** die Ausgabe enthält einen Hinweis auf fehlenden Scope

#### Scenario: Fehlende Workflow-Datei ergibt Exit-Code 2 *(BATS)*
- **GIVEN** der Pfad `/nonexistent/ci.yml` existiert nicht
- **WHEN** `bash scripts/preflight-pr-scope.sh "feat(admin): x" /nonexistent/ci.yml` ausgeführt wird
- **THEN** endet der Befehl mit Exit-Code 2

#### Scenario: Scope mit Bindestrichen wird korrekt erkannt *(BATS)*
- **GIVEN** `ops` ist in der Allowlist
- **WHEN** `bash scripts/preflight-pr-scope.sh "fix(ops): restart pod" ci.yml` ausgeführt wird
- **THEN** endet der Befehl mit Exit-Code 0

#### Scenario: Breaking-Change-Marker lässt gültigen Scope passieren *(BATS)*
- **GIVEN** `db` ist in der Allowlist
- **WHEN** `bash scripts/preflight-pr-scope.sh "feat(db)!: breaking schema" ci.yml` ausgeführt wird
- **THEN** endet der Befehl mit Exit-Code 0

---

### Requirement: quality-loop erstellt Tickets für Code-Qualitäts-Gruppen ohne Duplikate
<!-- bats: quality-loop.bats -->

The system SHALL create exactly one ticket per eligible code-quality gate group that has no
open ticket, respect the `MAX_NEW` throttle, skip groups with existing open tickets (dedup),
and perform no side effects in `DRY_RUN=1` mode.

#### Scenario: DRY_RUN=1 mit leerer Baseline erstellt keine Tickets *(BATS)*
- **GIVEN** `QUALITY_LOOP_GROUPS_CMD` gibt `[]` zurück; kein Ticket-Backend ist erreichbar
- **WHEN** `DRY_RUN=1 bash scripts/code-quality/loop.sh` ausgeführt wird
- **THEN** endet der Befehl mit Exit-Code 0
- **AND** kein `ticket.sh create`-Aufruf wurde getätigt

#### Scenario: DRY_RUN=1 mit zwei Gruppen gibt beide aus ohne Tickets anzulegen *(BATS)*
- **GIVEN** Fixture `groups.json` enthält zwei Gruppen (`S1:website`, `S3:infra-manifests`)
- **WHEN** `DRY_RUN=1 bash scripts/code-quality/loop.sh` ausgeführt wird
- **THEN** endet der Befehl mit Exit-Code 0
- **AND** die Ausgabe enthält `CQ-GATE:S1:website`, `CQ-GATE:S3:infra-manifests` und `[DRY_RUN]`
- **AND** kein Ticket wurde angelegt

#### Scenario: MAX_NEW=1 mit zwei Gruppen erstellt exakt ein Ticket *(BATS)*
- **GIVEN** Fixture `groups.json` enthält zwei förderfähige Gruppen; psql-Stub gibt keine offenen Tickets zurück
- **WHEN** `MAX_NEW=1 bash scripts/code-quality/loop.sh` ausgeführt wird
- **THEN** endet der Befehl mit Exit-Code 0
- **AND** genau ein `ticket.sh create`-Aufruf wurde getätigt

#### Scenario: Offenes Ticket für CQ-GATE:S1:website überspringt diese Gruppe *(BATS)*
- **GIVEN** psql-Stub gibt bei SQL-Abfragen für `S1:website` den Titel des offenen Tickets zurück; `S3:infra-manifests` hat kein offenes Ticket
- **WHEN** `MAX_NEW=2 bash scripts/code-quality/loop.sh` ausgeführt wird
- **THEN** endet der Befehl mit Exit-Code 0
- **AND** genau ein Ticket wird erstellt (für `S3:infra-manifests`)
- **AND** `ticket.sh create` enthält `S3:infra-manifests` in den Argumenten

---

### Requirement: qa-dal setzt Ticket-Status bei Approve auf done und bei Reject auf in_progress
<!-- bats: qa-dal.bats -->

The system SHALL, via `createQaReview`, transition the ticket to `status=done` (with
`done_at` set) on an approved review, and to `status=in_progress` (with a `factory_injection`
note record) on a rejected review.

#### Scenario: FA-QS-07 — Approve setzt status=done und done_at *(BATS)*
- **GIVEN** ein Ticket mit `status=qa_review` existiert in der DB (als Testdaten)
- **AND** alle fünf QA-Kriterien (`spec_match`, `no_regression`, `responsive`, `performance`, `copy`) sind `passed: true`
- **WHEN** `createQaReview({ verdict: 'approved' })` aufgerufen wird
- **THEN** hat das Ticket in der DB `status=done` und `done_at IS NOT NULL`

#### Scenario: FA-QS-08 — Reject setzt status=in_progress und legt factory_injection an *(BATS)*
- **GIVEN** ein Ticket mit `status=qa_review` existiert in der DB (als Testdaten)
- **AND** Kriterium `spec_match` ist `passed: false`; `notes` enthält `Spec nicht erfüllt`; `re_entry_phase: 'implement'`
- **WHEN** `createQaReview({ verdict: 'rejected' })` aufgerufen wird
- **THEN** hat das Ticket `status=in_progress`
- **AND** es existiert exakt ein Eintrag in `tickets.ticket_injections` mit `kind='note'` für dieses Ticket

<!-- merged from change delta openspec-workflow.md on 2026-06-27 -->

### Requirement: SSOT specs MUST declare Purpose and Requirements sections

The system SHALL require every spec under `openspec/specs/<capability>.md` to begin with a `## Purpose` H2 section (containing the capability overview, written in German per the project convention) and to group all `### Requirement:` blocks under a `## Requirements` H2 section. Specs that omit either section SHALL be rejected by `task test:openspec`.

#### Scenario: Conforming spec passes validation

- **GIVEN** a spec at `openspec/specs/<capability>.md` whose first H2 is `## Purpose` and whose `### Requirement:` blocks are nested under a `## Requirements` H2
- **WHEN** `task test:openspec` runs
- **THEN** the spec is included in the change tree without error

#### Scenario: Spec without Purpose fails validation

- **GIVEN** a spec at `openspec/specs/<capability>.md` whose first heading after the H1 title is `### Requirement:` (no `## Purpose`)
- **WHEN** `task test:openspec` runs
- **THEN** the spec is reported as failing with a "missing `## Purpose`" error and a pointer to the upstream conformance rule (`src/core/parsers/markdown-parser.ts:74-99`)

#### Scenario: Spec with stub Requirement fails validation

- **GIVEN** a spec whose only `### Requirement:` is `### Requirement: TODO` with body `The system SHALL …` and a `#### Scenario: TODO` block
- **WHEN** `task test:openspec` runs
- **THEN** the spec is reported as failing with a "stub Requirement detected" error

---

### Requirement: Agent-native /opsx:* workflow commands are installed

The system SHALL provide the upstream OpenSpec workflow commands under `.opencode/commands/opsx-{propose,explore,apply,archive}.md` (one Markdown file per workflow) and under `.claude/skills/openspec-{propose,explore,apply,archive}/SKILL.md` (one Agent Skill directory per workflow), generated by `openspec init --tools opencode,claude --profile core`. Agent prompts (in particular `dev-flow-plan` and `dev-flow-execute`) SHALL reference these commands rather than the `task openspec:*` bash wrappers.

#### Scenario: Workflow commands present in .opencode

- **GIVEN** `openspec init --tools opencode,claude --profile core` has been run in the repo
- **WHEN** `ls .opencode/commands/opsx-*.md | wc -l` is evaluated
- **THEN** the count is exactly 4 (propose, explore, apply, archive)

#### Scenario: Agent skills present in .claude

- **GIVEN** `openspec init --tools opencode,claude --profile core` has been run
- **WHEN** `ls -d .claude/skills/openspec-* | wc -l` is evaluated
- **THEN** the count is exactly 4 (propose, explore, apply, archive)

#### Scenario: dev-flow-plan skill uses /opsx:propose

- **GIVEN** the workflow commands are installed
- **WHEN** `.agents/skills/dev-flow-plan/SKILL.md` is read
- **THEN** the plan-creation step references `/opsx:propose` (or the equivalent agent-native path) rather than `task openspec:propose`

---

### Requirement: No openspec-mcp MCP server is registered

The system SHALL NOT register the third-party `openspec-mcp@0.4.2` package as an MCP server in `.opencode/opencode.jsonc` or in `.mcp.json`. The upstream OpenSpec project (v1.3.1) does not ship an MCP server; bringing one back requires a separate ticket that adopts whatever the upstream project ships natively.

#### Scenario: opencode.jsonc has no openspec entry

- **GIVEN** the cleanup commit (T001264, `cdc8d61f`) has landed
- **WHEN** `grep -c "openspec-mcp" .opencode/opencode.jsonc` is evaluated
- **THEN** the count is 0

#### Scenario: .mcp.json has no openspec entry

- **GIVEN** the cleanup commit (T001264, `cdc8d61f`) has landed
- **WHEN** `grep -c "openspec-mcp" .mcp.json` is evaluated
- **THEN** the count is 0

#### Scenario: No openspec/project.md exists

- **GIVEN** the cleanup commit has landed
- **WHEN** the file system at `openspec/project.md` is checked
- **THEN** the file does not exist (project context lives in `openspec/config.yaml:context:` instead)

---

### Requirement: OpenSpec context lives in config.yaml, not project.md

The system SHALL keep all project-level OpenSpec context (stack, conventions, services, language rules) in the `context:` field of `openspec/config.yaml`. No `openspec/project.md` file SHALL exist; if a future contributor wants to add context, they edit `config.yaml:context:` and respect the 50 KB hard cap (`src/core/project-config.ts:45`).

#### Scenario: config.yaml context field is populated

- **GIVEN** the cleanup commit has landed
- **WHEN** `openspec/config.yaml` is parsed
- **THEN** the `context:` field is non-empty and contains the stack, conventions, and services summary

#### Scenario: config.yaml rules cover specs and design artifacts

- **GIVEN** the polish commit (T001265) has landed
- **WHEN** `openspec/config.yaml:rules:` is parsed
- **THEN** the keys include `proposal`, `tasks`, `specs`, and `design` (all four artifact IDs the upstream spec-driven schema defines)

---

### Requirement: CI workflows opt out of OpenSpec telemetry

The system SHALL set the environment variable `OPENSPEC_TELEMETRY=0` in every workflow file under `.github/workflows/` that may invoke the OpenSpec CLI, so the upstream PostHog client (`src/telemetry/index.ts:11-181`) is disabled in CI. The opt-out SHALL be applied at the workflow-level `env:` block where possible, or per-job `env:` where workflow-level is not feasible.

#### Scenario: Workflow file sets OPENSPEC_TELEMETRY=0

- **GIVEN** the polish commit (T001265) has landed
- **WHEN** a CI workflow that invokes `openspec` (directly or via `task`) is parsed
- **THEN** the `env:` block (workflow-level or per-job) contains `OPENSPEC_TELEMETRY: '0'`

#### Scenario: Opt-out prevents PostHog requests from CI

- **GIVEN** `OPENSPEC_TELEMETRY=0` is set
- **WHEN** any `openspec` CLI command is run in CI
- **THEN** the telemetry client returns early without making a network request (per `src/telemetry/index.ts:46-63`)

---

(none — the full SSOT rewrite is parked under T001266 and will land when T001262 unparks)

(none in this delta — the existing `openspec-workflow.md` SSOT is being narrowed, not modified; the full rewrite is parked)

<!-- merged from change delta openspec-workflow.md on 2026-07-01 -->

<!-- merged from change delta openspec-workflow.md on 2026-07-02 -->

<!-- merged from change delta openspec-workflow.md (3f6f031c1866) -->