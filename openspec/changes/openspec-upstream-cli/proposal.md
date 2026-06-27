# Proposal: OpenSpec upstream CLI adoption (T001262)

_Ticket: T001262 — adopt upstream @fission-ai/openspec CLI as authoritative_

## Why

Ein 2026-06-27-Audit von `@fission-ai/openspec@1.3.1` gegen den Bachelorprojekt-`openspec/`-Tree
fand drei Konformanz-Lücken im homegrown Tooling:

1. **Raw-append merge**: `_merge_delta()` in `scripts/openspec.sh` hängt Delta-Inhalte ohne
   Sectioning-Bewusstsein an die SSOT-Datei an — die `## ADDED/MODIFIED/REMOVED Requirements`-Header
   aus dem Delta landen im SSOT und verstopfen die Spec mit Artefakt-Metadaten statt Inhalt.

2. **Schwacher Validator**: `_validate_delta_file()` und `openspec-validate.ts` akzeptieren nur
   `ADDED|MODIFIED|REMOVED` als gültige Operations-Header. `RENAMED` (vollständig unterstützt
   upstream) wird als invalide abgelehnt. Außerdem prüft der Validator nicht, ob jede
   Requirement mindestens ein `#### Scenario:` (4 Rauten) hat — upstream erzwingt dies.

3. **Struktureller Mismatch**: Unser Tree verwendet Flat-Files (`specs/<name>.md`), der upstream
   CLI erwartet Subdirectories (`specs/<name>/spec.md`). Dadurch findet `openspec validate --all`
   0 Specs und sieht jede Change als "No deltas found" — der CLI ist blind für den gesamten Tree.

T001261 (alle SSOT-Specs conformant mit Purpose + Requirements) ist abgeschlossen. T001262 ist
jetzt sicher zu unparken, weil der strenge Upstream-Validator beim Migrate keinen neuen Fehler mehr
auf den Spec-Inhalten (nur noch auf der Struktur) findet.

T001266 (SSOT openspec-workflow.md Vollrewrite) wartet auf dieses Ticket.

## What

### Capabilities betroffen

- `openspec-workflow` — MODIFIED: Validator-Logik, merge-Verhalten, Verzeichnisstruktur

### Änderungen

1. **RENAMED support** — Beide Validatoren (`scripts/openspec.sh::_validate_delta_file()` +
   `scripts/openspec-validate.ts::validateDeltaFile()`) akzeptieren `RENAMED` als vierten
   gültigen Operations-Header.

2. **Section-aware `_merge_delta()`** — Beim archive entfernt die Funktion den
   `## ADDED/MODIFIED/REMOVED/RENAMED Requirements`-Header vor dem Appenden, fügt
   nur den Requirements-Inhalt in den SSOT ein und schreibt einen klaren Merge-Kommentar
   (`<!-- merged from <slug> on <date> -->`).

3. **Scenario-Pflicht im Validator** — `_validate_delta_file()` und `validateDeltaFile()`
   prüfen, dass jede `### Requirement:` mindestens ein `#### Scenario:` (4 Rauten, nicht 3)
   enthält — entspricht upstream-Anforderung.

4. **Strukturmigration (flat → nested)**:
   - Migrationsskript: `scripts/openspec-migrate-flat-to-nested.sh`
   - SSOT: 63 `openspec/specs/<name>.md` → `openspec/specs/<name>/spec.md`
   - Active Changes: 26 Change-Delta-Files `openspec/changes/<slug>/specs/<name>.md`
     → `openspec/changes/<slug>/specs/<name>/spec.md`
   - `scripts/openspec.sh::cmd_propose()` erstellt ab jetzt `specs/<slug>/spec.md`
   - `scripts/openspec.sh::_merge_delta()` liest aus `specs/<cap>/spec.md`
   - `scripts/openspec.sh::cmd_validate()` traversiert Subdirectories

5. **`openspec-validate.ts` für nested Struktur** — `validateSpecsDir()` rekursiert in
   `<name>/spec.md` statt `<name>.md`, `validateChange()` liest aus `specs/<cap>/spec.md`.

6. **CI gate erweitern** — `task test:openspec` (Vitest-Test in `scripts/openspec-validate.test.ts`)
   bleibt, wird aber durch einen zusätzlichen BATS-Guard ergänzt: `openspec validate --changes`
   muss nach der Migration 0 ERRORs liefern.

### Out of Scope

- `scripts/openspec.sh::cmd_archive()` Ticket-Status-Integration bleibt wie ist (nur Dateipfade)
- Vollständiger Ersatz des homegrown propose/apply/archive durch upstream CLI — das ist eine
  spätere Iteration (upstream hat keine native Ticket-Integration)
- SSOT-Inhalt-Rewrite von `openspec-workflow.md` → T001266

## Capabilities

### New Capabilities
- (keine — kein neues SSOT-Capability-File)

### Modified Capabilities
- `openspec-workflow` — Validator-Regeln erweitert (RENAMED, Scenario-Pflicht), merge-Logik
  section-aware, Verzeichnisstruktur zu nested migriert, CI-Gate erweitert

## Impact

- **Dateien geändert:** `scripts/openspec.sh` (~+50 Zeilen), `scripts/openspec-validate.ts`
  (~+30 Zeilen), `scripts/openspec-validate.test.ts` (minimal)
- **Neue Dateien:** `scripts/openspec-migrate-flat-to-nested.sh` (~80 Zeilen),
  zusätzliche BATS-Guards in `tests/spec/openspec-workflow.bats`
- **Umbenennungen:** 63 SSOT-Spec-Files, 26 Change-Delta-Files (reine Renames, kein Inhalt)
- **Verhaltensänderung:** `task openspec:propose` erstellt nested Struktur;
  `task openspec:archive` merged section-aware; Validator lehnt `## Scenario:` (3 Rauten) ab
- **Risiko:** mittel — Strukturmigration ändert alle Pfade. Mitigation: Migrationsskript läuft
  idempotent, alle Tests grün vor Commit.
- **Reversibilität:** hoch — git revert aller Commits.
