## ADDED Requirements

### Requirement: Atlas-Generierung erzeugt einen Requirement-granularen SSOT-Index

`scripts/openspec-atlas.sh` SHALL aus `openspec/specs/*.md`,
`openspec/component-map.yaml`, den archivierten Changes
(`openspec/changes/archive/`) und den aktiven Changes ein Markdown-Artefakt
`docs/spec-atlas.md` generieren, das je Slug die Requirement-/Szenario-Anzahl,
die Zeilenzahl, die zugeordneten Code-Pfade (Reverse-Mapping der component-map),
das zuletzt zugreifende Ticket je Requirement (Provenance) sowie In-Flight-Deltas
aktiver Changes auf Requirement-Namen ausweist. Die SSOT-Specs unter
`openspec/specs/` werden dabei nicht verändert.

#### Scenario: Atlas spiegelt eine frisch gemergte Provenance

- **GIVEN** ein Change mit `.ticket` `T000123` wurde archiviert und hat ein
  MODIFIED-Requirement `Queue-Poll und Slot-Claim` in `software-factory` gemergt
- **WHEN** `scripts/openspec-atlas.sh` ausgeführt wird
- **THEN** listet der Abschnitt `software-factory` für dieses Requirement
  `T000123` als letzten Touch mit dem Delta-Typ `MODIFIED`

#### Scenario: Archiv ohne .ticket liefert keine Provenance, bricht aber nicht

- **GIVEN** ein Archiveintrag enthält kein lesbares `.ticket`-File
  (Altbestand vor Einführung der Pflicht)
- **WHEN** `scripts/openspec-atlas.sh` ausgeführt wird
- **THEN** erhält das betroffene Requirement keinen Provenance-Eintrag und der
  Generator beendet sich erfolgreich (fail-open)

#### Scenario: Aktives Delta erzeugt eine In-Flight-Warnung

- **GIVEN** ein aktiver Change enthält ein MODIFIED-Requirement
  `Dispatcher-Tick-Execution` für Slug `software-factory`
- **WHEN** `scripts/openspec-atlas.sh` ausgeführt wird
- **THEN** markiert der Atlas-Abschnitt `software-factory` dieses Requirement
  als in-flight mit Ticket-ID und Delta-Typ

### Requirement: Atlas nutzt die kanonische Delta-Grammatik

Der Atlas-Parser SHALL Delta-Dateien mit derselben Sektion-/Heading-Grammatik
lesen wie `scripts/openspec-merge.mjs` (`## ADDED|MODIFIED|REMOVED|RENAMED
Requirements`, `### Requirement:`, `#### Scenario:`), sodass Drift zwischen
Merge-Tool und Atlas-Parser nicht zu still falscher Provenance führt.

#### Scenario: Grammatik-Parität mit dem Merge-Tool ist abgesichert

- **GIVEN** die Merge-Parser-Tests definieren die kanonische Grammatik
- **WHEN** die Atlas-Testsuite läuft
- **THEN** parst der Atlas dieselben Fixture-Deltas zu denselben
  Requirement-Namen wie der Merge-Parser

### Requirement: Curatierte Gruppen sind View-Metadaten ohne SSOT-Eingriff

Eine Config-Datei neben dem Generator SHALL ausgewählten Specs der Top-Größe
Gruppennamen zuordnen; Requirements ohne Zuordnung SHALL im Atlas unter
`ungrouped` erscheinen. Die Gruppierung beeinflusst ausschließlich das
generierte Artefakt.

#### Scenario: Neue Requirements landen default in ungrouped

- **GIVEN** die Gruppen-Config ordnet nur einen Teil der Requirements von
  `software-factory` Gruppen zu
- **WHEN** der Atlas generiert wird
- **THEN** erscheinen alle nicht zugeordneten Requirements im Abschnitt
  `ungrouped` des jeweiligen Specs

## MODIFIED Requirements

### Requirement: Freshness-Check sichert Konsistenz der generierten Artefakte

The system SHALL im Rahmen des `freshness:check`-Gates die Aktualität von
`components/website/src/data/openspec-status.json` und `docs/spec-atlas.md`
prüfen und SHALL fehlschlagen, wenn eine der Dateien gegenüber dem aktuellen
Stand der `openspec/changes/`-Verzeichnisstruktur bzw. der `openspec/specs/`-
Inhalte veraltet ist.

#### Scenario: Veraltete openspec-status.json blockiert CI

- **GIVEN** ein neuer Change wurde hinzugefügt, aber `openspec-status-map.sh` wurde nicht neu ausgeführt
- **WHEN** `task freshness:check` im CI ausgeführt wird
- **THEN** schlägt der Job fehl mit Hinweis auf die veraltete `components/website/src/data/openspec-status.json`

#### Scenario: Frische openspec-status.json lässt CI passieren

- **GIVEN** `openspec-status-map.sh` wurde nach der letzten Change-Änderung ausgeführt und die Datei ist committed
- **WHEN** `task freshness:check` ausgeführt wird
- **THEN** wird `components/website/src/data/openspec-status.json` als aktuell akzeptiert

#### Scenario: Veralteter Spec-Atlas blockiert CI

- **GIVEN** eine SSOT-Spec oder ein Change-Verzeichnis änderte sich, aber
  `scripts/openspec-atlas.sh` wurde nicht neu ausgeführt
- **WHEN** `task freshness:check` im CI ausgeführt wird
- **THEN** schlägt der Job fehl mit Hinweis auf die veraltete `docs/spec-atlas.md`

#### Scenario: Frischer Spec-Atlas lässt CI passieren

- **GIVEN** `scripts/openspec-atlas.sh` wurde nach der letzten Spec-/Change-
  Änderung über `freshness:regenerate` ausgeführt und das Artefakt ist committed
- **WHEN** `task freshness:check` ausgeführt wird
- **THEN** wird `docs/spec-atlas.md` als aktuell akzeptiert
