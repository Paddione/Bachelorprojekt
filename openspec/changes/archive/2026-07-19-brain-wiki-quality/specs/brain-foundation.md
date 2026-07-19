## ADDED Requirements

### Requirement: REQ-BRAIN-FOUNDATION-013 — Prune-Phase (Deletion-Sync)

Die Ingest-Pipeline SOLL eine Prune-Phase besitzen (`scripts/brain-ingest-prune.sh`,
aufrufbar standalone und als Phase 2c aus `scripts/brain-ingest.sh` via `--prune`-Flag),
die Wiki-Seiten im brain-Repo als Löschkandidaten ermittelt, wenn (a) ihre
`source:: Bachelorprojekt <pfad>`-Rückreferenz auf eine nicht mehr existierende Datei zeigt
UND der Pfad nicht in der aktuellen Manifest-Worklist steht, ODER (b) die Seite keine
Bachelorprojekt-`source::`-Zeile trägt, aber ein State-File-Eintrag
(`~/.brain-ingest-state.json`, Quellpfad→Slug) auf sie zeigt, dessen Quellpfad nicht mehr
existiert. Meta-Seiten (source `self` oder ohne Bachelorprojekt-Präfix und ohne
State-Eintrag) DÜRFEN NIEMALS gelöscht werden. Der Default-Lauf listet Kandidaten nur
(dry); erst das `--prune`-Flag löscht scharf und bereinigt die zugehörigen
State-File-Einträge mit. Die Prune-Phase MUSS gegen die volle (nicht Pilot-gekürzte)
Worklist arbeiten und idempotent sein (zweiter Dry-Lauf nach scharfem Prune zeigt 0
Kandidaten).

#### Scenario: A stale source:: page is listed as candidate but not deleted by default

- **GIVEN** a wiki page whose `source:: Bachelorprojekt <path>` points to a file that no
  longer exists and whose path is absent from the current worklist
- **WHEN** the prune script runs without `--prune`
- **THEN** it exits zero and prints a `PRUNE-CANDIDATE:` line naming the page
- **AND** the page file still exists afterwards

#### Scenario: --prune deletes candidates and cleans their state entries

- **GIVEN** the same stale page and a state file entry mapping the vanished source path to
  its slug
- **WHEN** the prune script runs with `--prune`
- **THEN** the wiki page file is deleted
- **AND** the state file no longer contains the entry for the vanished source path

#### Scenario: A page without source:: is resolved via the state reverse map

- **GIVEN** a wiki page carrying no `source:: Bachelorprojekt` line, but a state file entry
  whose `slug` matches the page and whose source path no longer exists
- **WHEN** the prune script runs
- **THEN** the page is reported as a `PRUNE-CANDIDATE:`

#### Scenario: Meta pages are never deleted

- **GIVEN** a wiki page with `source:: self` (or no source:: line) and no matching state
  file entry
- **WHEN** the prune script runs with `--prune`
- **THEN** the page file still exists afterwards
- **AND** it never appears in the `PRUNE-CANDIDATE:` output

### Requirement: REQ-BRAIN-FOUNDATION-014 — Fail-Closed Transform-Output-Validierung

`scripts/brain-ingest-transform.sh` SOLL seinen LLM-Output fail-closed validieren: eine
`source::`-Zeile ist Pflicht, und der Body (nach dem Frontmatter-Block) MUSS mindestens
einen `[[`-Wikilink enthalten. Bei einem Verstoß erfolgt genau EIN Retry, dessen Prompt um
einen expliziten Fehlerhinweis (source::-Pflicht + Wikilink-Pflicht) ergänzt wird; schlägt
auch der Retry fehl, beendet sich das Skript mit Exit-Code 1 (zählt als Ingest-Fehlschlag,
kein stilles Durchwinken). Die Prompt-Sprachregel SOLL Mischübersetzungen verbieten
(durchgängig deutsche Prosa ODER englische Original-Passagen unverändert belassen), und der
Request SOLL `max_tokens: 3072` verwenden (statt 2048), bei unveränderter Temperatur 0.2.

#### Scenario: Output without source:: fails after exactly one retry

- **GIVEN** an LLM endpoint that always returns a page body without a `source::` line
- **WHEN** the transform script runs against it
- **THEN** it issues exactly two requests (initial attempt plus one retry)
- **AND** it exits non-zero reporting the missing `source::` line

#### Scenario: A valid output passes on the first attempt

- **GIVEN** an LLM endpoint returning a page with a `source::` line and at least one
  `[[wikilink]]` in the body
- **WHEN** the transform script runs against it
- **THEN** it exits zero after a single request
- **AND** its stdout contains the `source::` line

#### Scenario: The request carries the raised token budget and the language rule

- **GIVEN** the transform script source
- **WHEN** its request payload and prompt rules are inspected
- **THEN** the payload declares `max_tokens: 3072`
- **AND** the prompt forbids word-for-word mixed translation (Mischübersetzung)

### Requirement: REQ-BRAIN-FOUNDATION-015 — source::-Pflicht im brain-Repo-Lint

Der Frontmatter-Linter des brain-Repos (`scripts/lint-frontmatter.sh` in `Paddione/brain`)
SOLL zusätzlich prüfen, dass jede `wiki/*.md`-Seite eine `source::`-Rückreferenz trägt, und
bei Verstoß mit Exit-Code ungleich Null die betroffene Datei melden. Ergänzend SOLL ein
advisory Orphan-Audit-Skript Seiten ohne eingehenden MOC-Link auflisten, ohne die CI zu
blockieren (Exit 0 — keine neuen harten Gates über die source::-Pflicht hinaus).

#### Scenario: A wiki page without source:: fails the brain-repo frontmatter lint

- **GIVEN** a brain-repo checkout containing a `wiki/*.md` page without any `source::` line
- **WHEN** the brain repo's frontmatter linter runs
- **THEN** it exits non-zero
- **AND** its output reports the missing `source::` back-reference for that file

#### Scenario: The orphan audit is advisory only

- **GIVEN** a wiki page that no MOC page links to via `[[slug]]`
- **WHEN** the orphan audit script runs
- **THEN** it lists the orphan page on stdout
- **AND** it exits zero
